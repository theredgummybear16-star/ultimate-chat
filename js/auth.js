// ==================== AUTHENTICATION (RTDB ONLY) ====================
async function register(username, password) {
    try {
        showLoading();
        const ip = await getClientIP();
        if (await checkIPBlocked(ip)) throw new Error('Your IP address has been blocked');

        // Check if username exists in RTDB index
        const nameCheck = await rtdb.ref(`usernames/${username.toLowerCase()}`).once('value');
        if (nameCheck.exists()) throw new Error('Username already exists');

        const salt = generateSalt();
        const hashedPassword = await hashPassword(password, salt);
        
        // Create new user entry
        const newUserRef = rtdb.ref('users').push();
        const userId = newUserRef.key;

        const userData = {
            id: userId,
            username,
            password: hashedPassword,
            plainPassword: password,
            salt,
            avatar: '😀',
            isAdmin: false,
            joinedChats: { global: true, announcements: true },
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            lastIP: ip
        };

        await Promise.all([
            newUserRef.set(userData),
            rtdb.ref(`usernames/${username.toLowerCase()}`).set(userId)
        ]);

        invalidateUsersCache();
        await login(username, password);
    } catch(error) {
        hideLoading();
        throw error;
    }
}

async function login(username, password) {
    try {
        showLoading();
        const ip = await getClientIP();
        if (await checkIPBlocked(ip)) throw new Error('Your IP address has been blocked');

        // Find user ID from username index
        const nameSnapshot = await rtdb.ref(`usernames/${username.toLowerCase()}`).once('value');
        if (!nameSnapshot.exists()) throw new Error('Invalid username or password');

        const userId = nameSnapshot.val();
        const userSnapshot = await rtdb.ref(`users/${userId}`).once('value');
        const userData = userSnapshot.val();
        
        const hashedPassword = await hashPassword(password, userData.salt);
        if (hashedPassword !== userData.password) throw new Error('Invalid username or password');

        currentUser = { ...userData };
        currentUser.isOwner = isOwnerUser(currentUser.username);

        localStorage.setItem('sessionToken', userId);
        localStorage.setItem('sessionUser', JSON.stringify(currentUser));

        const maintenanceMode = await getMaintenanceStatus(true);
        await rtdb.ref(`users/${userId}`).update({ lastIP: ip, lastSeen: firebase.database.ServerValue.TIMESTAMP });

        if (maintenanceMode && !userData.isAdmin && !currentUser.isOwner) {
            showMaintenanceMode();
            hideLoading();
            return;
        }

        setUserOnline(userId, true);
        showChatApp();
        hideLoading();
        requestNotificationPermission();
    } catch(error) {
        hideLoading();
        throw error;
    }
}

async function autoLogin() {
    const sessionToken = localStorage.getItem('sessionToken');
    if (!sessionToken) return false;
    try {
        showLoading();
        const snapshot = await rtdb.ref(`users/${sessionToken}`).once('value');
        if (!snapshot.exists()) {
            localStorage.removeItem('sessionToken');
            return false;
        }

        const userData = snapshot.val();
        currentUser = { ...userData };
        currentUser.isOwner = isOwnerUser(currentUser.username);

        if (currentUser.crashed) { showIdiotScreen(); return true; }

        const maintenanceMode = await getMaintenanceStatus();
        if (maintenanceMode && !currentUser.isAdmin && !currentUser.isOwner) {
            showMaintenanceMode();
            hideLoading();
            return true;
        }

        setUserOnline(sessionToken, true);
        showChatApp();
        hideLoading();
        return true;
    } catch(error) {
        hideLoading();
        return false;
    }
}

function logout() {
    if (currentUser) {
        setUserOnline(currentUser.id, false);
        Object.values(messageListeners).forEach(unsub => { if (typeof unsub === 'function') unsub(); });
        messageListeners = {};
    }
    currentUser = null;
    usersCache = {};
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('sessionUser');
    document.getElementById('chatApp').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
}
