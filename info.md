# Ultimate Chat - Full Frontend Specification

This document contains the complete frontend codebase (HTML, CSS, and Core Logic) for the **Ultimate Chat** application. By implementing a compatible backend data layer, this application can be fully recreated to look and behave identically for users.

---

## 🏗️ 1. HTML Structure (`index.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ultimate Chat</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body class="theme-dark">
    <!-- Broadcast Banner -->
    <div id="broadcastBanner" class="broadcast-banner hidden">
        <div class="broadcast-content">
            <span class="broadcast-icon">📢</span>
            <div class="broadcast-message" id="broadcastText"></div>
        </div>
        <button class="broadcast-close" onclick="dismissBroadcast()">Dismiss</button>
    </div>

    <!-- Toast Container -->
    <div id="toastContainer" class="toast-container"></div>

    <!-- Loading Overlay -->
    <div id="loadingOverlay" class="loading-overlay hidden">
        <div class="spinner"></div>
    </div>

    <!-- Login Page -->
    <div id="loginPage" class="auth-container hidden">
        <div class="auth-box">
            <h2>🔐 Login</h2>
            <div id="loginError" class="error hidden"></div>
            <form id="loginForm">
                <div class="form-group"><label>Username</label><input type="text" id="loginUsername" required></div>
                <div class="form-group"><label>Password</label><input type="password" id="loginPassword" required></div>
                <button type="submit" class="btn">Login</button>
            </form>
            <div class="link" onclick="showRegister()">Don't have an account? Register</div>
        </div>
    </div>

    <!-- Main Chat Application -->
    <div id="chatApp" class="chat-container hidden">
        <div id="sidebar" class="sidebar">
            <div class="sidebar-header">
                <div class="user-info">
                    <div class="avatar" id="userAvatar">😀</div>
                    <div><div id="currentUsername" style="font-weight:600;"></div><span class="status-indicator" id="userStatus"></span></div>
                </div>
            </div>
            <div class="search-box"><input type="text" id="userSearch" placeholder="Search users..."></div>
            <div class="chat-list" id="chatList"></div>
            <div style="padding:1rem; border-top:1px solid var(--border);"><button class="btn btn-secondary" onclick="logout()">Logout</button></div>
        </div>

        <div class="main-content">
            <div class="chat-header">
                <div class="chat-title" id="chatTitle">🌍 Global Chat</div>
                <div class="header-actions">
                    <button class="btn-small" onclick="showSettings()">⚙️ Settings</button>
                    <div id="adminButton" class="hidden"><button class="btn-small" onclick="showAdminPanel()">👑 Admin</button></div>
                </div>
            </div>
            <div id="messagesContainer" class="messages-container"></div>
            <div id="inputContainer" class="input-container">
                <input type="text" id="messageInput" placeholder="Type a message...">
                <button onclick="sendMessage()">Send</button>
            </div>
        </div>
    </div>

    <!-- Maintenance Mode -->
    <div id="maintenancePage" class="maintenance-container hidden">
        <h1>🔧 System Maintenance</h1>
        <canvas id="gameCanvas" width="400" height="600"></canvas>
        <div class="game-info">Score: <span id="gameScore">0</span></div>
    </div>

    <!-- Idiot Screen -->
    <div id="idiotScreen" class="idiot-screen hidden">
        <div class="idiot-text">YOU ARE AN IDIOT</div>
    </div>
</body>
</html>
```

---

## 🎨 2. Styling System (`css/style.css`)

```css
:root {
    --primary: #3b82f6; --secondary: #64748b; --background: #f8fafc;
    --surface: #ffffff; --text: #1e293b; --border: #e2e8f0;
    --success: #10b981; --warning: #f59e0b; --danger: #ef4444;
    --owner-color: #f59e0b; --terminal-bg: #1a1a1a;
}

.theme-dark {
    --primary: #60a5fa; --background: #0f172a; --surface: #1e293b;
    --text: #f1f5f9; --border: #334155;
}

body { font-family: sans-serif; background: var(--background); color: var(--text); overflow: hidden; }
.hidden { display: none !important; }

/* Message Bubbles */
.message-wrapper { width: 100%; margin-bottom: 1rem; display: flex; flex-direction: column; }
.message-wrapper.own { align-items: flex-end; }
.message { padding: 0.75rem 1rem; border-radius: 1rem; background: var(--surface); max-width: 75%; }
.message.own { background: var(--primary); color: white; border-bottom-right-radius: 0.25rem; }

/* Modals & Overlays */
.modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; }
.modal-content { background: var(--surface); padding: 2rem; border-radius: 1rem; width: 90%; max-width: 500px; }

/* Idiot Screen Animation */
@keyframes idiotFlash {
    0% { background: #000; } 50% { background: #f00; } 100% { background: #000; }
}
.idiot-screen { position: fixed; inset: 0; z-index: 20000; display: flex; justify-content: center; align-items: center; animation: idiotFlash 0.05s infinite; }
```

---

## ⚙️ 3. Core Logic (`js/`)

### A. State & Initialization (`main.js`)
```javascript
let currentUser = null;
let currentChat = 'global';
const THEMES = ['light', 'dark', 'blue', 'green', 'purple'];

window.addEventListener('load', async () => {
    const sessionToken = localStorage.getItem('sessionToken');
    if (sessionToken) {
        // Implementation of auto-login logic
    } else {
        document.getElementById('loginPage').classList.remove('hidden');
    }
});
```

### B. Chat & Rendering Logic (`chat.js`)
```javascript
function displayMessage(message, container) {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${message.userId === currentUser.id ? 'own' : ''}`;
    
    const div = document.createElement('div');
    div.className = 'message';
    
    let content = `<div class="message-header">${message.username}</div>`;
    
    // Rich content parsing (Links, Images, Mentions)
    let body = sanitizeHTML(message.content);
    if (isImageUrl(body)) body += `<img src="${body}" class="message-image">`;
    
    content += `<div class="message-content">${body}</div>`;
    div.innerHTML = content;
    wrapper.appendChild(div);
    container.appendChild(wrapper);
}
```

### C. Security & Utils (`utils.js`)
```javascript
async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}
```

### D. UI Helpers (`ui.js`)
```javascript
function applyTheme(theme) {
    document.body.className = 'theme-' + theme;
    localStorage.setItem('theme', theme);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}
```

---

## 🔌 4. Required Backend API (Interface)
To make this frontend work, you must implement a `db` object with the following methods:

| Method | Description |
| :--- | :--- |
| `db.users.get(id)` | Fetch user profile, avatar, and permissions. |
| `db.messages.list(chatId)` | Stream or fetch the last 100 messages for a channel. |
| `db.messages.add(data)` | Post a new message. |
| `db.broadcasts.on(callback)` | Real-time listener for system commands (reload, redirect, popup). |
| `db.status.setOnline(id, bool)`| Update user's real-time presence. |
