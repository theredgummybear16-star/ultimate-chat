// ==================== CHAT FUNCTIONS ====================
function loadMessages(chatId) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';

    if (messageListeners[currentChat]) {
        const prev = messageListeners[currentChat];
        if (typeof prev === 'function') prev();
    }
    if (messageListeners[currentChat + '_new']) {
        const prev = messageListeners[currentChat + '_new'];
        if (typeof prev === 'function') prev();
    }

    if (chatId === 'announcements') {
        let knownMessageIds = null;
        const unsubscribe = db.collection('announcements').onSnapshot(snapshot => {
            container.innerHTML = '';
            const messages = [];
            snapshot.forEach(doc => { const data = doc.data(); if (data.timestamp) messages.push({ id: doc.id, ...data }); });
            messages.sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
            const lastMessages = messages.slice(-100);
            lastMessages.forEach(msg => displayMessage(msg, container, false, true));
            scrollToBottom();
            if (knownMessageIds !== null) {
                lastMessages.forEach(msg => {
                    if (!knownMessageIds.has(msg.id) && msg.userId !== currentUser.id) {
                        if (currentChat !== 'announcements') {
                            unreadCounts['announcements'] = (unreadCounts['announcements'] || 0) + 1;
                            updateUnreadBadge('announcements');
                            showNotification('📣 New Announcement', msg.content, '📣');
                        }
                    }
                });
            }
            knownMessageIds = new Set(lastMessages.map(m => m.id));
        }, error => { showToast('Error loading announcements: ' + error.message, 'error'); });
        messageListeners[chatId] = unsubscribe;

    } else if (chatId === 'global') {
        let knownMessageIds = null;
        const unsubscribe = db.collection('messages').onSnapshot(snapshot => {
            container.innerHTML = '';
            const messages = [];
            snapshot.forEach(doc => { const data = doc.data(); if (data.timestamp) messages.push({ id: doc.id, ...data }); });
            messages.sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
            const lastMessages = messages.slice(-100);
            lastMessages.forEach(msg => displayMessage(msg, container));
            scrollToBottom();
            
            // Check for mentions in new messages
            if (knownMessageIds !== null) {
                lastMessages.forEach(msg => {
                    if (!knownMessageIds.has(msg.id) && msg.userId !== currentUser.id) {
                        const mentionRegex = new RegExp('@' + currentUser.username + '\\b', 'i');
                        const isMentioned = mentionRegex.test(msg.content);
                        const isEveryoneMention = msg.content && msg.content.includes('@everyone');
                        
                        if (isMentioned || isEveryoneMention) {
                            showNotification(
                                `Mentioned by ${msg.username}`,
                                msg.content,
                                msg.userAvatar,
                                'mention'
                            );
                            
                            if (currentChat !== 'global') {
                                unreadCounts['global'] = (unreadCounts['global'] || 0) + 1;
                                updateUnreadBadge('global');
                            }
                        } else {
                            if (currentChat !== 'global') {
                                unreadCounts['global'] = (unreadCounts['global'] || 0) + 1;
                                updateUnreadBadge('global');
                                showNotification('New message in Global Chat', msg.content, msg.userAvatar);
                            }
                        }
                    }
                });
            }
            knownMessageIds = new Set(lastMessages.map(m => m.id));
        }, error => { showToast('Error loading messages: ' + error.message, 'error'); });
        messageListeners[chatId] = unsubscribe;

    } else {
        // Private chat
        const messagesRef = rtdb.ref(`privateChats/${chatId}/messages`).orderByChild('timestamp').limitToLast(100);
        messagesRef.on('value', snapshot => {
            container.innerHTML = '';
            const messages = [];
            snapshot.forEach(child => {
                const msg = { id: child.key, ...child.val() };
                messages.push(msg);
            });
            messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            messages.forEach(msg => displayMessage(msg, container, true));
            scrollToBottom();
        }, error => { 
            console.error('Error loading private messages:', error);
            showToast('Error loading messages: ' + error.message, 'error'); 
        });
        messageListeners[chatId] = () => messagesRef.off();

        const newPrivateRef = rtdb.ref(`privateChats/${chatId}/messages`).orderByChild('timestamp').limitToLast(1);
        let privateListenerReady = false;
        newPrivateRef.on('child_added', snapshot => {
            if (!privateListenerReady) { 
                privateListenerReady = true; 
                return; 
            }
            const msg = snapshot.val();
            if (msg.userId !== currentUser.id && currentChat !== chatId) {
                unreadCounts[chatId] = (unreadCounts[chatId] || 0) + 1;
                updateUnreadBadge(chatId);
                getCachedUser(msg.userId).then(userData => {
                    if (userData) {
                        showNotification(`Private message from ${userData.username}`, msg.content, userData.avatar, 'private');
                    }
                });
            }
        });
        messageListeners[chatId + '_new'] = () => newPrivateRef.off();
    }
}

function displayMessage(message, container, isPrivate = false, isAnnouncement = false) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper';

    const div = document.createElement('div');
    const isOwn = message.userId === currentUser.id;
    const isSystem = message.type === 'system';
    const isBroadcast = message.type === 'broadcast';
    const msgIsOwner = isOwnerUser(message.username || '');

    let className = 'message';
    if (isOwn && !isSystem && !isBroadcast) className += ' own';
    if (isSystem) className += ' system';
    if (isBroadcast) className += ' admin-broadcast';
    if (isPrivate && !isSystem) className += ' private';
    if (isAnnouncement && !isSystem) className += ' announcement';
    
    // Check for mentions
    const mentionRegex = new RegExp('@' + currentUser.username + '\\b', 'i');
    const isMentioned = mentionRegex.test(message.content);
    const isEveryoneMention = message.content && message.content.includes('@everyone');
    
    if ((isMentioned || isEveryoneMention) && !isSystem && !isOwn) {
        className += ' mention';
    }

    div.className = className;
    div.setAttribute('data-message-id', message.id);

    let content = '';
    if (!isSystem) {
        content += `
            <div class="message-header">
                <span class="avatar">${message.userAvatar || '😀'}</span>
                <span>${sanitizeHTML(message.username || 'Unknown')}</span>
                ${msgIsOwner ? '<span class="badge owner">⭐ OWNER</span>' : (message.isAdmin ? '<span class="badge admin">ADMIN</span>' : '')}
                ${isBroadcast ? '<span class="badge">BROADCAST</span>' : ''}
                ${(isMentioned || isEveryoneMention) ? '<span class="badge warning">🔔 MENTION</span>' : ''}
            </div>
        `;
    }

    const rawText = message.content || '';
    const URL_REGEX = /(https?:\/\/[^\s]+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    const detectedLinks = [];

    while ((match = URL_REGEX.exec(rawText)) !== null) {
        if (match.index > lastIndex) parts.push({ type: 'text', value: rawText.slice(lastIndex, match.index) });
        const url = match[0];
        if (isImageUrl(url)) {
            parts.push({ type: 'image', value: url });
        } else {
            parts.push({ type: 'link', value: url });
            detectedLinks.push(url);
        }
        lastIndex = match.index + url.length;
    }
    if (lastIndex < rawText.length) parts.push({ type: 'text', value: rawText.slice(lastIndex) });

    let messageHtml = '';
    parts.forEach(part => {
        if (part.type === 'text') {
            let text = sanitizeHTML(part.value);
            
            text = text.replace(
                /@everyone\b/g,
                '<span class="mention-highlight">@everyone</span>'
            );
            
            const allUsers = Object.values(usersCache);
            allUsers.forEach(user => {
                if (user.username) {
                    const userMentionRegex = new RegExp('@' + user.username + '\\b', 'g');
                    text = text.replace(userMentionRegex, '<span class="mention-highlight">@' + user.username + '</span>');
                }
            });
            
            messageHtml += text;
        } else if (part.type === 'link') {
            messageHtml += `<a href="${sanitizeHTML(part.value)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:underline;">${sanitizeHTML(part.value)}</a>`;
        } else if (part.type === 'image') {
            messageHtml += `<br><img class="message-image" src="${sanitizeHTML(part.value)}" alt="image" onclick="window.open('${sanitizeHTML(part.value)}','_blank')" onerror="this.replaceWith(Object.assign(document.createElement('a'),{href:'${sanitizeHTML(part.value)}',target:'_blank',rel:'noopener noreferrer',textContent:'${sanitizeHTML(part.value)}',style:'color:var(--primary);text-decoration:underline;'}))">`;
        }
    });

    content += `<div class="message-content">${messageHtml}</div>`;

    if (!isSystem) {
        const canEdit = isOwn && !isBroadcast && isWithinEditTime(message.timestamp) && !isAnnouncement;
        const canDelete = (isOwn || currentUser.isAdmin || currentUser.isOwner) && !isBroadcast && isWithinEditTime(message.timestamp);
        content += `
            <div class="message-footer">
                <span>${formatTimestamp(message.timestamp)}</span>
                ${canEdit || canDelete ? `
                    <div class="message-actions">
                        ${canEdit ? `<button onclick="editMessage('${message.id}', '${currentChat}', ${isPrivate})">Edit</button>` : ''}
                        ${canDelete ? `<button onclick="deleteMessage('${message.id}', '${currentChat}', ${isPrivate})">Delete</button>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    div.innerHTML = content;
    wrapper.appendChild(div);

    if (isOwn) wrapper.classList.add('own');
    container.appendChild(wrapper);

    if (detectedLinks.length > 0 && !isSystem) fetchAndRenderPreview(detectedLinks[0], div);
}

function isWithinEditTime(timestamp) {
    if (!timestamp) return false;
    const messageTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return (new Date() - messageTime) < 7200000;
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content) return;

    if (currentChat === 'announcements' && !currentUser.isAdmin && !currentUser.isOwner) {
        showToast('Only admins can post in Announcements', 'error');
        return;
    }

    if (content.includes('@everyone') && !currentUser.isAdmin && !currentUser.isOwner) {
        showToast('Only admins can use @everyone', 'error');
        return;
    }

    clearTyping();
    hideAutocomplete();

    try {
        const messageData = {
            userId: currentUser.id,
            username: currentUser.username,
            userAvatar: currentUser.avatar,
            isAdmin: currentUser.isAdmin || false,
            content,
            type: 'normal'
        };

        if (editingMessageId) {
            if (currentChat === 'global') {
                await db.collection('messages').doc(editingMessageId).update({ content, edited: true, editedAt: firebase.firestore.FieldValue.serverTimestamp() });
            } else if (currentChat === 'announcements') {
                await db.collection('announcements').doc(editingMessageId).update({ content, edited: true, editedAt: firebase.firestore.FieldValue.serverTimestamp() });
            } else {
                await rtdb.ref(`privateChats/${currentChat}/messages/${editingMessageId}`).update({ content, edited: true, editedAt: firebase.database.ServerValue.TIMESTAMP });
            }
            editingMessageId = null;
        } else {
            if (currentChat === 'global') {
                messageData.timestamp = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('messages').add(messageData);
            } else if (currentChat === 'announcements') {
                messageData.timestamp = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('announcements').add(messageData);
            } else {
                messageData.timestamp = firebase.database.ServerValue.TIMESTAMP;
                const newMsgRef = await rtdb.ref(`privateChats/${currentChat}/messages`).push(messageData);
                console.log('Message sent to private chat:', currentChat, newMsgRef.key);
            }
        }

        input.value = '';
        scrollToBottom();
    } catch(error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message: ' + error.message, 'error');
    }
}

function editMessage(messageId, chatId, isPrivate) {
    editingMessageId = messageId;
    if (isPrivate) {
        rtdb.ref(`privateChats/${chatId}/messages/${messageId}`).once('value', snapshot => {
            const message = snapshot.val();
            if (message) { document.getElementById('messageInput').value = message.content; document.getElementById('messageInput').focus(); }
        });
    } else {
        db.collection(chatId === 'announcements' ? 'announcements' : 'messages').doc(messageId).get().then(doc => {
            if (doc.exists) { document.getElementById('messageInput').value = doc.data().content; document.getElementById('messageInput').focus(); }
        });
    }
}

async function deleteMessage(messageId, chatId, isPrivate) {
    try {
        if (chatId === 'announcements') {
            await db.collection('announcements').doc(messageId).delete();
        } else if (isPrivate) {
            await rtdb.ref(`privateChats/${chatId}/messages/${messageId}`).remove();
        } else {
            await db.collection('messages').doc(messageId).delete();
        }
        showToast('Message deleted', 'success');
    } catch(error) {
        console.error('Error deleting message:', error);
        showToast('Failed to delete message', 'error');
    }
}

function handleMessageKeyPress(event) { 
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

// ==================== MENTION AUTOCOMPLETE ====================
async function handleMentionAutocomplete(event) {
    const input = document.getElementById('messageInput');
    const cursorPos = input.selectionStart;
    const text = input.value;
    const dropdown = document.getElementById('autocompleteDropdown');
    
    let lastAtIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
        if (text[i] === '@') {
            if (i === 0 || text[i-1].match(/\s/)) {
                lastAtIndex = i;
                break;
            } else {
                break;
            }
        }
    }
    
    if (lastAtIndex !== -1) {
        const searchTerm = text.substring(lastAtIndex + 1, cursorPos).toLowerCase();
        mentionStartPos = lastAtIndex;
        
        const users = await getCachedUsers();
        autocompleteUsers = users
            .filter(u => u.id !== currentUser.id && u.username.toLowerCase().startsWith(searchTerm))
            .slice(0, 5);
        
        if (autocompleteUsers.length > 0) {
            renderAutocomplete(searchTerm);
            dropdown.classList.remove('hidden');
            autocompleteIndex = 0;
            highlightAutocompleteItem();
        } else {
            hideAutocomplete();
        }
    } else {
        hideAutocomplete();
    }
}

function renderAutocomplete(searchTerm) {
    const dropdown = document.getElementById('autocompleteDropdown');
    dropdown.innerHTML = '';
    
    autocompleteUsers.forEach((user, index) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.dataset.index = index;
        item.onclick = () => selectAutocompleteUser(user.username);
        
        let badge = '';
        if (isOwnerUser(user.username)) {
            badge = '<span class="badge owner" style="font-size:0.6rem;">⭐</span>';
        } else if (user.isAdmin) {
            badge = '<span class="badge admin" style="font-size:0.6rem;">👑</span>';
        }
        
        item.innerHTML = `
            <span class="avatar">${user.avatar}</span>
            <span style="flex:1;">${sanitizeHTML(user.username)} ${badge}</span>
            <span style="color:var(--text-secondary); font-size:0.75rem;">${user.username.toLowerCase().startsWith(searchTerm) ? 'Match' : ''}</span>
        `;
        dropdown.appendChild(item);
    });
}

function highlightAutocompleteItem() {
    const items = document.querySelectorAll('.autocomplete-item');
    items.forEach((item, index) => {
        if (index === autocompleteIndex) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

function handleAutocompleteKeydown(event) {
    const dropdown = document.getElementById('autocompleteDropdown');
    if (dropdown.classList.contains('hidden')) return;
    
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        autocompleteIndex = (autocompleteIndex + 1) % autocompleteUsers.length;
        highlightAutocompleteItem();
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        autocompleteIndex = (autocompleteIndex - 1 + autocompleteUsers.length) % autocompleteUsers.length;
        highlightAutocompleteItem();
    } else if (event.key === 'Tab' || event.key === 'Enter') {
        if (autocompleteIndex >= 0 && autocompleteUsers[autocompleteIndex]) {
            event.preventDefault();
            selectAutocompleteUser(autocompleteUsers[autocompleteIndex].username);
        }
    } else if (event.key === 'Escape') {
        hideAutocomplete();
    }
}

function selectAutocompleteUser(username) {
    const input = document.getElementById('messageInput');
    const text = input.value;
    const beforeMention = text.substring(0, mentionStartPos + 1);
    const afterMention = text.substring(input.selectionStart);
    
    input.value = beforeMention + username + ' ' + afterMention;
    input.focus();
    input.selectionStart = input.selectionEnd = mentionStartPos + 1 + username.length + 1;
    
    hideAutocomplete();
}

function hideAutocomplete() {
    document.getElementById('autocompleteDropdown').classList.add('hidden');
    autocompleteUsers = [];
    autocompleteIndex = -1;
    mentionStartPos = -1;
}

// ==================== TYPING INDICATOR ====================
function handleTyping() {
    if (!currentUser) return;
    
    if (typingTimeout) clearTimeout(typingTimeout);
    
    const typingRef = rtdb.ref(`typing/${currentChat}/${currentUser.id}`);
    typingRef.set({
        username: currentUser.username,
        avatar: currentUser.avatar,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    
    typingTimeout = setTimeout(() => {
        typingRef.remove();
    }, 2000);
}

function clearTyping() {
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
    if (currentUser) {
        rtdb.ref(`typing/${currentChat}/${currentUser.id}`).remove();
    }
}

function setupTypingListener(chatId) {
    if (typingListeners[chatId]) {
        typingListeners[chatId]();
        delete typingListeners[chatId];
    }

    const typingRef = rtdb.ref(`typing/${chatId}`);
    const listener = typingRef.on('value', snapshot => {
        const typers = snapshot.val();
        const indicator = document.getElementById('typingIndicator');
        const typingText = document.getElementById('typingText');
        
        if (typers) {
            const typingUsers = Object.values(typers)
                .filter(t => t.username !== currentUser?.username);
            
            if (typingUsers.length > 0) {
                const names = typingUsers.map(t => t.username).join(', ');
                typingText.textContent = typingUsers.length === 1 
                    ? `${names} is typing...` 
                    : `${names} are typing...`;
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        } else {
            indicator.classList.add('hidden');
        }
    });

    typingListeners[chatId] = () => typingRef.off('value', listener);
}

function hideTypingIndicator() {
    document.getElementById('typingIndicator').classList.add('hidden');
}

// ==================== SEARCH USERS ====================
function searchUsersDebounced() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(searchUsers, 300);
}

async function searchUsers() {
    const query = document.getElementById('userSearch').value.toLowerCase().trim();
    if (!query) { loadChatList(); return; }
    
    const allUsers = await getCachedUsers();
    const chatList = document.getElementById('chatList');
    
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
    
    const dmHeader = document.createElement('div');
    dmHeader.className = 'sidebar-section-header';
    dmHeader.textContent = 'Search Results';
    chatList.appendChild(dmHeader);
    
    allUsers.forEach(userData => {
        if (userData.id === currentUser.id) return;
        if (!userData.username.toLowerCase().includes(query)) return;
        
        const chatId = [currentUser.id, userData.id].sort().join('_');
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.onclick = () => startPrivateChat(userData.id);

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
                <div class="chat-item-preview">Start private chat</div>
            </div>
        `;
        chatList.appendChild(chatItem);
    });
}

async function startPrivateChat(otherUserId) {
    const chatId = [currentUser.id, otherUserId].sort().join('_');
    const chatRef = rtdb.ref(`privateChats/${chatId}`);
    const snapshot = await chatRef.once('value');
    if (!snapshot.exists()) {
        await chatRef.set({ 
            participants: [currentUser.id, otherUserId], 
            createdAt: firebase.database.ServerValue.TIMESTAMP 
        });
        await rtdb.ref(`privateChats/${chatId}/messages`).push({
            type: 'system',
            content: 'Private chat started',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }
    selectChat(chatId);
    loadChatList();
}
