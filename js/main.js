// ==================== OWNER CONFIG (HARDCODED) ====================
const OWNER_USERNAMES = ['theredgummybear16@gmail.com', 'juroadmin', 'Ruby'];

function isOwnerUser(username) {
    return OWNER_USERNAMES.includes(username);
}

// ==================== GLOBAL STATE ====================
let currentUser = null;
let currentChat = 'global';
let messageListeners = {};
let editingMessageId = null;
let typingTimeout = null;
let typingListeners = {};

// Autocomplete state
let autocompleteUsers = [];
let autocompleteIndex = -1;
let mentionStartPos = -1;

// Caches
let usersCache = {};
let usersCacheTimestamp = 0;
const USERS_CACHE_TTL = 60 * 1000;

let maintenanceCacheValue = null;
let maintenanceCacheTimestamp = 0;
const MAINTENANCE_CACHE_TTL = 30 * 1000;

let cachedBlockedIPs = [];

// Debounce timer
let searchDebounceTimer = null;

// Unread counters
let unreadCounts = { global: 0, announcements: 0 };

// Notification permission
let notificationPermission = false;

// Pending owner URL
let pendingOwnerUrl = null;
let pendingOwnerBroadcastId = null;

const EMOJIS = ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'];

const THEMES = ['light','dark','blue','green','purple','red','orange','pink','teal','indigo','cyan','lime','amber'];

// ==================== USER CACHE ====================
async function getCachedUsers(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && usersCacheTimestamp && (now - usersCacheTimestamp) < USERS_CACHE_TTL) {
        return Object.values(usersCache);
    }
    const snapshot = await db.collection('users').get();
    usersCache = {};
    snapshot.forEach(doc => { 
        const data = doc.data();
        usersCache[doc.id] = { id: doc.id, ...data, plainPassword: data.plainPassword }; 
    });
    usersCacheTimestamp = now;
    return Object.values(usersCache);
}

async function getCachedUser(userId) {
    if (usersCache[userId]) return usersCache[userId];
    const doc = await db.collection('users').doc(userId).get();
    if (doc.exists) {
        const data = doc.data();
        usersCache[doc.id] = { id: doc.id, ...data, plainPassword: data.plainPassword };
        return usersCache[doc.id];
    }
    return null;
}

function invalidateUsersCache() { usersCacheTimestamp = 0; }

// ==================== MAINTENANCE CACHE ====================
async function getMaintenanceStatus(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && maintenanceCacheTimestamp && (now - maintenanceCacheTimestamp) < MAINTENANCE_CACHE_TTL) {
        return maintenanceCacheValue;
    }
    const doc = await db.collection('admin').doc('settings').get();
    maintenanceCacheValue = doc.exists ? (doc.data().maintenanceMode || false) : false;
    maintenanceCacheTimestamp = now;
    return maintenanceCacheValue;
}

function invalidateMaintenanceCache() { maintenanceCacheTimestamp = 0; }

// ==================== USER STATUS ====================
function setUserOnline(userId, online) {
    rtdb.ref('status/' + userId).set({ online, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    if (online) {
        rtdb.ref('status/' + userId).onDisconnect().set({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    }
}

function listenToUserStatus(userId, callback) {
    rtdb.ref('status/' + userId).on('value', snapshot => callback(snapshot.val()));
}

// ==================== EVENT LISTENERS ====================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    try { await login(username, password); }
    catch(error) { showError('loginError', error.message); }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirmPassword').value;
    if (password !== confirm) { showError('registerError', 'Passwords do not match'); return; }
    if (password.length < 6) { showError('registerError', 'Password must be at least 6 characters'); return; }
    try { await register(username, password); }
    catch(error) { showError('registerError', error.message); }
});

// ==================== INITIALIZATION ====================
window.addEventListener('load', async () => {
    const loggedIn = await autoLogin();
    if (!loggedIn) document.getElementById('loginPage').classList.remove('hidden');
});

window.addEventListener('beforeunload', () => {
    if (currentUser) {
        setUserOnline(currentUser.id, false);
        clearTyping();
    }
});

// Override loadMessages to set up typing listener
const originalLoadMessages = loadMessages;
loadMessages = function(chatId) {
    originalLoadMessages(chatId);
    setupTypingListener(chatId);
};
