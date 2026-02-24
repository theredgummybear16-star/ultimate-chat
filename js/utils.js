// ==================== TOAST ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-message">${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// ==================== UTILITY ====================
async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function showLoading() { document.getElementById('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.add('hidden'); }

function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    setTimeout(() => errorEl.classList.add('hidden'), 5000);
}

function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

async function getClientIP() {
    try { return localStorage.getItem('mockIP') || generateMockIP(); }
    catch(e) { return generateMockIP(); }
}

function generateMockIP() {
    const ip = `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
    localStorage.setItem('mockIP', ip);
    return ip;
}

async function checkIPBlocked(ip) {
    if (cachedBlockedIPs.length === 0) await loadBlockedIPsCache();
    return cachedBlockedIPs.includes(ip);
}

// ==================== NOTIFICATIONS ====================
function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(permission => {
        notificationPermission = (permission === 'granted');
    });
}

function showNotification(title, body, icon = '💬', type = 'info') {
    // Show browser notification if permitted and tab is hidden
    if (notificationPermission && document.hidden) {
        try {
            new Notification(title, { body, icon: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwww.pngmart.com%2Ffiles%2F11%2FChat-Logo-PNG-Pic.png&f=1&nofb=1&ipt=282b359cc027c71e1d0c549868e3cce0202f5b0185a1d96d02bd22143786cb2e' });
        } catch (e) {
            console.error('Error showing browser notification:', e);
        }
    }

    // Always show in-app toast for visibility
    const toastType = type === 'mention' ? 'warning' : (type === 'private' ? 'success' : 'info');
    showToast(`${title}: ${body}`, toastType);
}
