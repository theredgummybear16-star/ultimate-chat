// ==================== GLOBAL STATE & CACHE (RTDB ONLY) ====================
async function getCachedUsers(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && usersCacheTimestamp && (now - usersCacheTimestamp) < 60000) {
        return Object.values(usersCache);
    }
    const snapshot = await rtdb.ref('users').once('value');
    usersCache = snapshot.val() || {};
    usersCacheTimestamp = now;
    return Object.values(usersCache);
}

async function getCachedUser(userId) {
    if (usersCache[userId]) return usersCache[userId];
    const snapshot = await rtdb.ref(`users/${userId}`).once('value');
    if (snapshot.exists()) {
        usersCache[userId] = snapshot.val();
        return usersCache[userId];
    }
    return null;
}

async function getMaintenanceStatus(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && maintenanceCacheTimestamp && (now - maintenanceCacheTimestamp) < 30000) {
        return maintenanceCacheValue;
    }
    const snapshot = await rtdb.ref('admin/settings/maintenanceMode').once('value');
    maintenanceCacheValue = snapshot.val() || false;
    maintenanceCacheTimestamp = now;
    return maintenanceCacheValue;
}

// ==================== BROADCASTS (RTDB ONLY) ====================
function initBroadcastListener() {
    if (broadcastListener) return;
    const ref = rtdb.ref('broadcasts').limitToLast(5);
    ref.on('child_added', snapshot => {
        const broadcast = snapshot.val();
        const id = snapshot.key;
        
        const dismissed = JSON.parse(localStorage.getItem('dismissedBroadcasts') || '[]');
        if (dismissed.includes(id)) return;

        // Check targeting
        const isTargeted = broadcast.targetUsers && Array.isArray(broadcast.targetUsers) && broadcast.targetUsers.includes(currentUser?.id);
        if (broadcast.targetUsers && broadcast.targetUsers !== 'all' && !isTargeted) return;

        if (broadcast.type === 'force_reload') {
            setTimeout(() => location.reload(), 500);
        } else if (broadcast.type === 'owner_popup') {
            showOwnerPopup(broadcast.message);
        } else {
            showBroadcastBanner(broadcast.message, id);
        }
    });

    // Listen for personal crash status
    rtdb.ref(`users/${currentUser.id}/crashed`).on('value', snap => {
        if (snap.val()) showIdiotScreen(); else hideIdiotScreen();
    });
}
