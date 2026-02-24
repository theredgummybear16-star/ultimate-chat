// ==================== AUTHENTICATION ====================
async function register(username, password) {
    try {
        showLoading();
        const ip = await getClientIP();
        if (await checkIPBlocked(ip)) throw new Error('Your IP address has been blocked');

        const allUsers = await getCachedUsers();
        if (allUsers.some(u => u.username === username)) throw new Error('Username already exists');

        const salt = generateSalt();
        const hashedPassword = await hashPassword(password, salt);
        const userRef = db.collection('users').doc();
        await userRef.set({
            username,
            password: hashedPassword,
            plainPassword: password,
            salt,
            avatar: '😀',
            isAdmin: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastIP: ip
        });
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

        const usersSnapshot = await db.collection('users').where('username', '==', username).get();
        if (usersSnapshot.empty) throw new Error('Invalid username or password');

        const userDoc = usersSnapshot.docs[0];
        const userData = userDoc.data();
        
        const hashedPassword = await hashPassword(password, userData.salt);
        if (hashedPassword !== userData.password) throw new Error('Invalid username or password');

        currentUser = { id: userDoc.id, ...userData };
        currentUser.isOwner = isOwnerUser(currentUser.username);

        localStorage.setItem('sessionToken', userDoc.id);
        localStorage.setItem('sessionUser', JSON.stringify(currentUser));

        const [, maintenanceMode] = await Promise.all([
            userDoc.ref.update({ lastIP: ip, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }),
            getMaintenanceStatus(true)
        ]);

        if (maintenanceMode && !userData.isAdmin && !currentUser.isOwner) {
            showMaintenanceMode();
            hideLoading();
            return;
        }

        setUserOnline(userDoc.id, true);
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
        const userDoc = await db.collection('users').doc(sessionToken).get();
        if (!userDoc.exists) {
            localStorage.removeItem('sessionToken');
            localStorage.removeItem('sessionUser');
            return false;
        }

        const ip = await getClientIP();
        if (await checkIPBlocked(ip)) throw new Error('Your IP address has been blocked');

        currentUser = { id: userDoc.id, ...userDoc.data() };
        currentUser.isOwner = isOwnerUser(currentUser.username);

        if (currentUser.crashed) {
            showIdiotScreen();
            return true;
        }

        const maintenanceMode = await getMaintenanceStatus();
        if (maintenanceMode && !currentUser.isAdmin && !currentUser.isOwner) {
            showMaintenanceMode();
            hideLoading();
            return true;
        }

        setUserOnline(userDoc.id, true);
        showChatApp();
        hideLoading();
        requestNotificationPermission();
        return true;
    } catch(error) {
        console.error('Auto login failed:', error);
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
    usersCacheTimestamp = 0;
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('sessionUser');
    document.getElementById('chatApp').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
}

async function changePassword() {
    const current = document.getElementById('currentPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmNewPassword').value;
    if (!current || !newPass || !confirm) { showToast('Please fill all fields', 'warning'); return; }
    if (newPass !== confirm) { showToast('New passwords do not match', 'error'); return; }
    try {
        showLoading();
        const hashedCurrent = await hashPassword(current, currentUser.salt);
        if (hashedCurrent !== currentUser.password) throw new Error('Current password is incorrect');
        
        const newSalt = generateSalt();
        const newHash = await hashPassword(newPass, newSalt);
        
        await db.collection('users').doc(currentUser.id).update({ 
            password: newHash,
            plainPassword: newPass,
            salt: newSalt 
        });
        
        currentUser.password = newHash;
        currentUser.plainPassword = newPass;
        currentUser.salt = newSalt;
        
        if (usersCache[currentUser.id]) { 
            usersCache[currentUser.id].password = newHash;
            usersCache[currentUser.id].plainPassword = newPass;
            usersCache[currentUser.id].salt = newSalt;
        }
        
        showToast('Password changed successfully!', 'success');
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
        hideLoading();
    } catch(error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}
