// ==================== CHAT SYSTEM REDESIGN (RTDB ENGINE) ====================

// --- Chat Creation logic (RTDB) ---
async function createChatFromMentions(usernames) {
    try {
        showLoading();
        const allUsers = await getCachedUsers();
        const targetUsers = allUsers.filter(u => usernames.includes(u.username));
        
        if (targetUsers.length === 0) {
            showToast('No valid users mentioned', 'error');
            return;
        }

        const memberIds = [currentUser.id, ...targetUsers.map(u => u.id)];
        
        if (targetUsers.length === 1) {
            // Private Chat
            const otherUser = targetUsers[0];
            const chatId = [currentUser.id, otherUser.id].sort().join('_');
            
            const chatRef = rtdb.ref(`chats/${chatId}`);
            const chatSnap = await chatRef.once('value');
            
            if (!chatSnap.exists()) {
                const metadata = {
                    type: 'private',
                    members: memberIds,
                    memberData: {
                        [currentUser.id]: { role: 'member', joinedAt: firebase.database.ServerValue.TIMESTAMP },
                        [otherUser.id]: { role: 'member', joinedAt: firebase.database.ServerValue.TIMESTAMP }
                    },
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                };
                
                await Promise.all([
                    chatRef.set(metadata),
                    rtdb.ref(`users/${currentUser.id}/joinedChats/${chatId}`).set(true),
                    rtdb.ref(`users/${otherUser.id}/joinedChats/${chatId}`).set(true)
                ]);
            }
            selectChat(chatId);
        } else {
            // Group Chat
            const newChatRef = rtdb.ref('chats').push();
            const chatId = newChatRef.key;
            const groupName = targetUsers.map(u => u.username).join(', ') + ', ' + currentUser.username;
            
            const memberData = { [currentUser.id]: { role: 'owner', joinedAt: firebase.database.ServerValue.TIMESTAMP } };
            targetUsers.forEach(u => memberData[u.id] = { role: 'member', joinedAt: firebase.database.ServerValue.TIMESTAMP });

            const metadata = {
                id: chatId,
                type: 'group',
                name: groupName,
                members: memberIds,
                memberData: memberData,
                createdBy: currentUser.id,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            };

            await newChatRef.set(metadata);

            // Add to all users' joinedChats
            const updatePromises = memberIds.map(uid => 
                rtdb.ref(`users/${uid}/joinedChats/${chatId}`).set(true)
            );
            await Promise.all(updatePromises);
            selectChat(chatId);
        }
        
        loadChatList();
        hideLoading();
    } catch (error) {
        console.error('Error creating chat:', error);
        showToast('Error creating chat: ' + error.message, 'error');
        hideLoading();
    }
}

// --- Message Loading (RTDB) ---
function loadMessages(chatId) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';

    if (messageListeners[currentChat]) {
        const prev = messageListeners[currentChat];
        if (typeof prev === 'function') prev();
    }

    const messagesRef = rtdb.ref(`chat_messages/${chatId}`).limitToLast(100);

    const listener = messagesRef.on('value', snapshot => {
        container.innerHTML = '';
        const messages = [];
        snapshot.forEach(child => {
            messages.push({ id: child.key, ...child.val() });
        });
        
        messages.forEach(msg => displayMessage(msg, container));
        scrollToBottom();
    });

    messageListeners[chatId] = () => messagesRef.off('value', listener);
    
    // Load metadata from RTDB (Infinite Reads)
    if (chatId !== 'global' && chatId !== 'announcements') {
        rtdb.ref(`chats/${chatId}`).once('value', snapshot => {
            currentChatMetadata = snapshot.val();
            updateChatHeader();
        });
    } else {
        currentChatMetadata = { type: chatId, name: chatId === 'global' ? 'Global Chat' : 'Announcements' };
        updateChatHeader();
    }
}

// --- All other message actions already use rtdb.ref() from the previous update ---
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content) return;

    const words = content.split(/\s+/);
    if (words.length > 0 && words.every(w => w.startsWith('@'))) {
        const usernames = words.map(w => w.substring(1));
        await createChatFromMentions(usernames);
        input.value = '';
        return;
    }

    try {
        const messageData = {
            senderId: currentUser.id,
            senderName: currentUser.username,
            senderAvatar: currentUser.avatar,
            content: content,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            type: 'normal'
        };

        if (currentReplyTo) {
            messageData.replyTo = currentReplyTo;
            currentReplyTo = null;
            document.getElementById('replyIndicator').classList.add('hidden');
        }

        await rtdb.ref(`chat_messages/${currentChat}`).push(messageData);
        input.value = '';
        scrollToBottom();
        clearTyping();
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Error sending message', 'error');
    }
}

async function toggleReaction(messageId, emoji) {
    const reactionRef = rtdb.ref(`chat_messages/${currentChat}/${messageId}/reactions/${emoji}/${currentUser.id}`);
    const snapshot = await reactionRef.once('value');
    if (snapshot.exists()) {
        await reactionRef.remove();
    } else {
        await reactionRef.set(true);
    }
}

async function inviteUser(username) {
    if (!currentChatMetadata || currentChatMetadata.type !== 'group') return;
    try {
        const users = await getCachedUsers();
        const user = users.find(u => u.username === username);
        if (!user) { showToast('User not found', 'error'); return; }
        
        await rtdb.ref(`chats/${currentChat}/members`).transaction(members => {
            if (members && !members.includes(user.id)) members.push(user.id);
            return members;
        });
        
        await rtdb.ref(`chats/${currentChat}/memberData/${user.id}`).set({ 
            role: 'member', joinedAt: firebase.database.ServerValue.TIMESTAMP 
        });
        
        await rtdb.ref(`users/${user.id}/joinedChats/${currentChat}`).set(true);
        showToast(`Invited ${username}`, 'success');
    } catch (error) { showToast('Error inviting user', 'error'); }
}

async function updateGroupSettings(name, picture) {
    if (!currentChatMetadata || currentChatMetadata.type !== 'group') return;
    const role = currentChatMetadata.memberData[currentUser.id].role;
    if (role !== 'owner' && role !== 'admin') { showToast('Only owners and admins can change settings', 'error'); return; }
    try {
        const updates = {};
        if (name) updates.name = name;
        if (picture) updates.picture = picture;
        await rtdb.ref(`chats/${currentChat}`).update(updates);
        showToast('Group updated', 'success');
    } catch (error) { showToast('Error updating group', 'error'); }
}

function displayMessage(message, container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper';
    if (message.senderId === currentUser.id) wrapper.classList.add('own');
    const div = document.createElement('div');
    const isOwn = message.senderId === currentUser.id;
    const isSystem = message.type === 'system';
    let className = 'message';
    if (isOwn) className += ' own';
    if (isSystem) className += ' system';
    const mentionRegex = new RegExp('@' + currentUser.username + '\\b', 'i');
    const isMentioned = message.content && mentionRegex.test(message.content);
    if (isMentioned && !isOwn) className += ' mention';
    div.className = className;
    div.setAttribute('data-message-id', message.id);
    let contentHtml = '';
    if (message.replyTo) {
        contentHtml += `<div class="message-reply-preview" onclick="scrollToMessage('${message.replyTo.messageId}')"><div class="reply-sender">${sanitizeHTML(message.replyTo.senderName)}</div><div class="reply-content">${sanitizeHTML(message.replyTo.content.substring(0, 50))}</div></div>`;
    }
    if (!isSystem) {
        contentHtml += `<div class="message-header"><span class="avatar">${message.senderAvatar || '😀'}</span><span class="username">${sanitizeHTML(message.senderName || 'Unknown')}</span></div>`;
    }
    contentHtml += `<div class="message-content">${renderMessageContent(message.content)}</div>`;
    if (message.reactions) {
        let reactionsHtml = '<div class="message-reactions">';
        for (const [emoji, users] of Object.entries(message.reactions)) {
            const userIds = Object.keys(users);
            if (userIds.length > 0) {
                const hasReacted = userIds.includes(currentUser.id);
                reactionsHtml += `<div class="reaction-badge ${hasReacted ? 'active' : ''}" onclick="toggleReaction('${message.id}', '${emoji}')">${emoji} <span class="count">${userIds.length}</span></div>`;
            }
        }
        reactionsHtml += '</div>';
        contentHtml += reactionsHtml;
    }
    if (!isSystem) {
        contentHtml += `<div class="message-footer"><span>${formatTimestamp(message.timestamp)}</span><div class="message-actions"><button onclick="setReplyTo('${message.id}', '${sanitizeHTML(message.senderName)}', '${sanitizeHTML(message.content.replace(/'/g, "\\'"))}')">Reply</button><button onclick="showReactionPicker('${message.id}', event)">😊</button>${isOwn ? `<button onclick="deleteMessage('${message.id}')">Delete</button>` : ''}</div></div>`;
    }
    div.innerHTML = contentHtml;
    wrapper.appendChild(div);
    container.appendChild(wrapper);
}
function renderMessageContent(content) {
    if (!content) return '';
    let html = sanitizeHTML(content);
    const URL_REGEX = /(https?:\/\/[^\s]+)/g;
    html = html.replace(URL_REGEX, (url) => { if (isImageUrl(url)) return `<br><img class="message-image" src="${url}" onclick="window.open('${url}','_blank')">`; return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`; });
    const MENTION_REGEX = /@(\w+)/g;
    html = html.replace(MENTION_REGEX, match => `<span class="mention-highlight">${match}</span>`);
    return html;
}
function setReplyTo(messageId, senderName, content) { currentReplyTo = { messageId, senderName, content }; const indicator = document.getElementById('replyIndicator'); document.getElementById('replyText').textContent = `Replying to ${senderName}: ${content.substring(0, 30)}...`; indicator.classList.remove('hidden'); document.getElementById('messageInput').focus(); }
function cancelReply() { currentReplyTo = null; document.getElementById('replyIndicator').classList.add('hidden'); }
function handleTyping() { if (!currentUser) return; if (typingTimeout) clearTimeout(typingTimeout); const typingRef = rtdb.ref(`typing/${currentChat}/${currentUser.id}`); typingRef.set({ username: currentUser.username, timestamp: firebase.database.ServerValue.TIMESTAMP }); typingTimeout = setTimeout(() => { typingRef.remove(); }, 2000); }
function clearTyping() { if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; } if (currentUser) rtdb.ref(`typing/${currentChat}/${currentUser.id}`).remove(); }
function setupTypingListener(chatId) { if (typingListeners[chatId]) { typingListeners[chatId](); delete typingListeners[chatId]; } const typingRef = rtdb.ref(`typing/${chatId}`); const listener = typingRef.on('value', snapshot => { const typers = snapshot.val(); const indicator = document.getElementById('typingIndicator'); const typingText = document.getElementById('typingText'); if (typers) { const typingUsers = Object.values(typers).filter(t => t.username !== currentUser?.username); if (typingUsers.length > 0) { const names = typingUsers.map(t => t.username).join(', '); typingText.textContent = typingUsers.length === 1 ? `${names} is typing...` : `${names} are typing...`; indicator.classList.remove('hidden'); } else { indicator.classList.add('hidden'); } } else { indicator.classList.add('hidden'); } }); typingListeners[chatId] = () => typingRef.off('value', listener); }
function scrollToBottom() { const container = document.getElementById('messagesContainer'); container.scrollTop = container.scrollHeight; }
function scrollToMessage(messageId) { const el = document.querySelector(`[data-message-id="${messageId}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('highlight'); setTimeout(() => el.classList.remove('highlight'), 2000); } }
function handleMessageKeyPress(event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }
async function searchUsers() { /* Auto-mentions */ }
async function startPrivateChat(otherUserId) { const otherUser = await getCachedUser(otherUserId); if (otherUser) createChatFromMentions([otherUser.username]); }
function showReactionPicker(messageId, event) { const picker = document.getElementById('reactionPicker'); picker.style.left = event.clientX + 'px'; picker.style.top = (event.clientY - 50) + 'px'; picker.classList.remove('hidden'); const emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '✅']; picker.innerHTML = emojis.map(e => `<span onclick="toggleReaction('${messageId}', '${e}'); hideReactionPicker()">${e}</span>`).join(''); setTimeout(() => { window.onclick = () => { hideReactionPicker(); window.onclick = null; }; }, 100); }
function hideReactionPicker() { document.getElementById('reactionPicker').classList.add('hidden'); }
function formatTimestamp(ts) { if (!ts) return ''; const date = new Date(ts); return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function sanitizeHTML(str) { const temp = document.createElement('div'); temp.textContent = str; return temp.innerHTML; }
function isImageUrl(url) { return url.match(/\.(jpeg|jpg|gif|png|webp)$/) != null; }
