// ==================== UI HELPERS (RTDB ONLY) ====================
async function loadChatList() {
    const chatList = document.getElementById('chatList');
    chatList.innerHTML = '';

    // Channels
    const channelsHeader = document.createElement('div');
    channelsHeader.className = 'sidebar-section-header';
    channelsHeader.textContent = 'Channels';
    chatList.appendChild(channelsHeader);

    const defaultChannels = [
        { id: 'global', name: 'Global Chat', avatar: '🌍', preview: 'Public chat room' },
        { id: 'announcements', name: 'Announcements', avatar: '📣', preview: 'Official announcements', adminOnly: true }
    ];

    defaultChannels.forEach(ch => {
        chatList.appendChild(createChatItem(ch.id, ch.name, ch.avatar, ch.preview, ch.adminOnly));
    });

    // Messages (DMs & Groups)
    try {
        const userSnap = await rtdb.ref(`users/${currentUser.id}/joinedChats`).once('value');
        const joinedChatIds = userSnap.val() ? Object.keys(userSnap.val()) : [];
        
        const otherChatIds = joinedChatIds.filter(id => id !== 'global' && id !== 'announcements');
        
        if (otherChatIds.length > 0) {
            const header = document.createElement('div');
            header.className = 'sidebar-section-header';
            header.textContent = 'Messages';
            chatList.appendChild(header);

            for (const chatId of otherChatIds) {
                const chatSnap = await rtdb.ref(`chats/${chatId}`).once('value');
                if (chatSnap.exists()) {
                    const data = chatSnap.val();
                    let name = data.name || 'Group Chat';
                    let avatar = data.picture || '👥';
                    
                    if (data.type === 'private') {
                        const otherUserId = data.members.find(id => id !== currentUser.id);
                        const otherUser = await getCachedUser(otherUserId);
                        if (otherUser) { name = otherUser.username; avatar = otherUser.avatar; }
                    }
                    
                    chatList.appendChild(createChatItem(chatId, name, avatar, data.type === 'private' ? 'Private Chat' : 'Group'));
                }
            }
        }
    } catch (error) { console.error('Error loading chats:', error); }
}

function createChatItem(id, name, avatar, preview, adminOnly = false) {
    const div = document.createElement('div');
    div.className = `chat-item ${currentChat === id ? 'active' : ''}`;
    div.setAttribute('data-chat-id', id);
    div.onclick = () => selectChat(id);
    div.innerHTML = `
        <div class="avatar">${avatar}</div>
        <div class="chat-item-info">
            <div class="chat-item-name">${sanitizeHTML(name)} ${adminOnly ? '<span class="channel-badge">ADMIN</span>' : ''}</div>
            <div class="chat-item-preview">${sanitizeHTML(preview)}</div>
        </div>
    `;
    return div;
}

// ==================== ADMIN PANEL (RTDB ONLY) ====================
async function toggleMaintenance() {
    const currentState = await getMaintenanceStatus(true);
    const newState = !currentState;
    await rtdb.ref('admin/settings/maintenanceMode').set(newState);
    invalidateMaintenanceCache();
    document.getElementById('maintenanceText').textContent = newState ? 'Disable Maintenance' : 'Enable Maintenance';
    showToast(newState ? 'Maintenance enabled' : 'Maintenance disabled', 'info');
}

async function sendBroadcast() {
    const content = document.getElementById('broadcastMessage').value.trim();
    if (!content) return;
    try {
        showLoading();
        await rtdb.ref('broadcasts').push({
            type: 'message',
            message: content,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            sentBy: currentUser.id,
            sentByName: currentUser.username
        });
        document.getElementById('broadcastMessage').value = '';
        hideLoading();
        showToast('Broadcast sent!', 'success');
    } catch(error) { hideLoading(); showToast('Error: ' + error.message, 'error'); }
}

async function deleteUser(userId) {
    if (!confirm('Delete this user?')) return;
    try {
        const user = await getCachedUser(userId);
        if (isOwnerUser(user.username)) { showToast('Cannot delete owner', 'error'); return; }
        await Promise.all([
            rtdb.ref(`users/${userId}`).remove(),
            rtdb.ref(`usernames/${user.username.toLowerCase()}`).remove(),
            rtdb.ref(`status/${userId}`).remove()
        ]);
        showToast('User deleted', 'success');
        loadAdminUsers();
    } catch(error) { showToast('Error: ' + error.message, 'error'); }
}

// --- Rest of UI helpers remain similar but redirected to rtdb calls ---
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function showSettings() { document.getElementById('settingsModal').classList.remove('hidden'); initializeEmojiPicker(); initializeThemeSelector(); }
function closeSettings() { document.getElementById('settingsModal').classList.add('hidden'); }
async function selectEmoji(emoji, btnEl) {
    try {
        await rtdb.ref(`users/${currentUser.id}/avatar`).set(emoji);
        currentUser.avatar = emoji;
        document.getElementById('userAvatar').textContent = emoji;
        if (usersCache[currentUser.id]) usersCache[currentUser.id].avatar = emoji;
        document.querySelectorAll('.emoji-btn').forEach(btn => btn.classList.remove('selected'));
        if (btnEl) btnEl.classList.add('selected');
    } catch(error) { console.error('Error:', error); }
}
function applyTheme(theme) { document.body.className = 'theme-' + theme; }
function selectChat(chatId) {
    currentChat = chatId;
    currentReplyTo = null;
    const indicator = document.getElementById('replyIndicator');
    if (indicator) indicator.classList.add('hidden');
    document.querySelectorAll('.chat-item').forEach(item => { item.classList.toggle('active', item.getAttribute('data-chat-id') === chatId); });
    updateChatHeader();
    loadMessages(chatId);
    setupTypingListener(chatId);
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
}
function updateChatHeader() {
    const chatTitle = document.getElementById('chatTitle');
    const headerActions = document.querySelector('.header-actions');
    const existingManage = document.getElementById('manageGroupBtn');
    if (existingManage) existingManage.remove();
    if (currentChat === 'global') { chatTitle.innerHTML = '<span class="avatar">🌍</span><span>Global Chat</span>'; }
    else if (currentChat === 'announcements') { chatTitle.innerHTML = '<span class="avatar">📣</span><span>Announcements</span>'; }
    else if (currentChatMetadata) {
        if (currentChatMetadata.type === 'private') {
            const otherUserId = currentChatMetadata.members.find(id => id !== currentUser.id);
            getCachedUser(otherUserId).then(u => { if (u) chatTitle.innerHTML = `<span class="avatar">${u.avatar}</span><span>Private Chat with ${u.username}</span>`; });
        } else {
            const name = currentChatMetadata.name || 'Group Chat';
            const avatar = currentChatMetadata.picture || '👥';
            chatTitle.innerHTML = `<span class="avatar">${avatar}</span><span>${sanitizeHTML(name)}</span>`;
            if (currentChatMetadata.memberData && currentChatMetadata.memberData[currentUser.id]) {
                const role = currentChatMetadata.memberData[currentUser.id].role;
                if (role === 'owner' || role === 'admin') {
                    const btn = document.createElement('button'); btn.id = 'manageGroupBtn'; btn.className = 'btn-small'; btn.textContent = '⚙️ Manage'; btn.onclick = showGroupSettings;
                    headerActions.prepend(btn);
                }
            }
        }
    }
}
