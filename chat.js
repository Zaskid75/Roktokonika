// ============================================================
// ROKTOKONIKA — Messaging Logic  (chat.js)
// Messages stored in Supabase `messages` table.
// Auto-cleaned after 48 hours on each chat load.
// ============================================================

let activeChatRequestId  = null;
let activeChatReceiverId = null;
let chatPollInterval     = null;
let _lastRenderedMsgIds  = '';  // track rendered message IDs to avoid full re-renders

// ── Init chat for a given request ──
async function initChat(requestId, receiverId) {
  activeChatRequestId  = requestId;
  activeChatReceiverId = receiverId;

  const box = document.getElementById('chat-messages');
  if (box) box.innerHTML = '<div class="loading"></div>';

  // Stop any existing poll
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }

  // Reset smart-diff cache for the new conversation
  _lastRenderedMsgIds = '';

  // Step 1: Clean messages older than 48h for this conversation
  await cleanupOldMessages(requestId);

  // Step 2: Load remaining messages
  await refreshChat();

  // Step 3: Poll every 1.5 seconds for near-instant updates
  chatPollInterval = setInterval(refreshChat, 1500);
}

// ── Stop subscription when modal closes ──
async function stopChatPolling() {
  if (chatPollInterval) { 
    clearInterval(chatPollInterval);
    chatPollInterval = null; 
  }
  activeChatRequestId  = null;
  activeChatReceiverId = null;
}

// ── Delete messages older than 48h ──
async function cleanupOldMessages(requestId) {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await sb.from('messages')
    .delete()
    .eq('request_id', requestId)
    .lt('created_at', cutoff);
}

// ── Load and render messages ──
async function refreshChat() {
  if (!activeChatRequestId || !activeChatReceiverId) return;

  const box = document.getElementById('chat-messages');
  if (!box) return;

  // Fetch messages for this specific conversation:
  // Same request_id AND (sender↔receiver pair involving current user and the partner)
  const { data, error } = await sb
    .from('messages')
    .select('*')
    .eq('request_id', activeChatRequestId)
    .or(
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatReceiverId}),` +
      `and(sender_id.eq.${activeChatReceiverId},receiver_id.eq.${currentUser.id})`
    )
    .order('created_at', { ascending: true });

  if (error) {
    box.innerHTML = '<p style="text-align:center;color:var(--muted);padding:20px">Could not load messages.</p>';
    return;
  }

  if (!data?.length) {
    box.innerHTML = `
      <div style="text-align:center;padding:30px;color:var(--muted)">
        <div style="font-size:32px;margin-bottom:8px">💬</div>
        <p style="font-size:13px">No messages yet. Say hello!</p>
        <p style="font-size:11px;margin-top:4px">Messages expire after 48 hours.</p>
      </div>`;
    return;
  }

  // Smart diff: only re-render if message set changed
  const newIds = data.map(m => m.id).join(',');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const hadNewMessages = newIds !== _lastRenderedMsgIds;

  if (!hadNewMessages) return; // nothing changed — skip full re-render
  _lastRenderedMsgIds = newIds;

  let lastDate = '';
  box.innerHTML = data.map(msg => {
    const mine = msg.sender_id === currentUser.id;
    const d = new Date(msg.created_at);
    const dateStr = d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
    const timeStr = d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    let dateSep = '';
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      dateSep = `<div class="msg-time">${dateStr}</div>`;
    }
    return `${dateSep}
      <div style="display:flex;flex-direction:column;align-items:${mine ? 'flex-end' : 'flex-start'}">
        <div class="msg-bubble ${mine ? 'msg-mine' : 'msg-theirs'}">${safeText(msg.content)}</div>
        <span style="font-size:10px;color:var(--muted);margin-top:2px;padding:0 4px">${timeStr}</span>
      </div>`;
  }).join('');

  // Auto-scroll to bottom when near bottom or new messages arrived
  if (atBottom || hadNewMessages) {
    box.scrollTop = box.scrollHeight;
  }
}

// ── Send a message ──
async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const content = input?.value.trim();
  if (!content || !activeChatRequestId || !activeChatReceiverId) return;

  // Optimistic: show message immediately
  input.value = '';
  input.disabled = true;
  const box = document.getElementById('chat-messages');
  const nowStr = new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  if (box) {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;opacity:0.6';
    el.innerHTML = `<div class="msg-bubble msg-mine">${safeText(content)}</div>
      <span style="font-size:10px;color:var(--muted);margin-top:2px;padding:0 4px">${nowStr} ✓</span>`;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }

  const { error } = await sb.from('messages').insert({
    sender_id:   currentUser.id,
    receiver_id: activeChatReceiverId,
    request_id:  activeChatRequestId,
    content:     content,
  });

  input.disabled = false;
  input.focus();

  if (error) {
    showToast('Could not send message: ' + error.message, 'error');
    input.value = content; // restore
    return;
  }

  // Force a fresh poll so both sides see the real persisted message
  _lastRenderedMsgIds = ''; // invalidate cache so next poll re-renders
  await refreshChat();
}

// ── Load Inbox Conversations ──
async function loadInbox() {
  const inboxList = document.getElementById('inbox-list');
  if (!inboxList) return;
  inboxList.innerHTML = '<div class="loading"></div>';

  // Fetch all messages where current user is sender or receiver
  const { data: msgs, error } = await sb
    .from('messages')
    .select('*, profiles:sender_id(name), blood_requests:request_id(patient_name, blood_group)')
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .order('created_at', { ascending: false });

  if (error || !msgs || msgs.length === 0) {
    inboxList.innerHTML = '<div class="empty-state" style="padding:30px 10px"><div class="emoji">💬</div><p style="font-size:13px">No conversations yet.</p><p style="font-size:12px;color:var(--muted);margin-top:6px">Start chatting by volunteering on a blood request.</p></div>';
    return;
  }

  // Group by conversation key: request_id + partner_id (keep only latest per conversation)
  const convMap = new Map();
  msgs.forEach(m => {
    const partnerId = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
    const key = `${m.request_id}_${partnerId}`;
    if (!convMap.has(key)) {
      convMap.set(key, {
        requestId: m.request_id,
        partnerId: partnerId,
        lastMsg: m.content,
        lastTime: m.created_at,
        patientName: m.blood_requests?.patient_name || 'Blood Request',
        bloodGroup: m.blood_requests?.blood_group || ''
      });
    }
  });

  const convs = Array.from(convMap.values());

  // Fetch partner profiles
  const partnerIds = [...new Set(convs.map(c => c.partnerId))];
  const { data: partnerProfiles } = await sb.from('profiles').select('id, name').in('id', partnerIds);
  const nameMap = new Map(partnerProfiles?.map(p => [p.id, p.name]) || []);

  inboxList.innerHTML = convs.map(c => {
    const partnerName = nameMap.get(c.partnerId) || 'User';
    const initial = partnerName.charAt(0).toUpperCase();
    const timeLabel = timeAgo(c.lastTime);
    const preview = c.lastMsg.length > 40 ? c.lastMsg.substring(0, 40) + '…' : c.lastMsg;
    return `
      <div class="inbox-item" onclick="openInboxConversation('${c.requestId}', '${c.partnerId}', ${JSON.stringify(partnerName)})">
        <div class="inbox-avatar">${initial}</div>
        <div class="inbox-details">
          <h4>${safeText(partnerName)} ${c.bloodGroup ? `<span style="font-size:11px;color:var(--red);font-weight:700">${c.bloodGroup}</span>` : ''}</h4>
          <p>${safeText(preview)}</p>
        </div>
        <span style="font-size:11px;color:var(--muted);margin-left:auto;flex-shrink:0">${timeLabel}</span>
      </div>`;
  }).join('');
}

// ── Open Conversation in Inbox Tab ──
async function openInboxConversation(requestId, partnerId, partnerName) {
  // Stop any previous poll
  if (chatPollInterval) { 
    clearInterval(chatPollInterval);
    chatPollInterval = null; 
  }

  activeChatRequestId  = requestId;
  activeChatReceiverId = partnerId;
  _lastRenderedMsgIds  = ''; // reset cache for new conversation

  // Mark active state on inbox list items
  document.querySelectorAll('.inbox-item').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList?.add('active');

  const inboxMain = document.getElementById('inbox-main');
  if (!inboxMain) return;

  // Build avatar using dummy profile picture pattern
  const avatarLetter = partnerName.charAt(0).toUpperCase();
  const avatarColors = ['#DC2626','#7C3AED','#059669','#D97706','#2563EB','#DB2777'];
  const colorIdx = partnerName.charCodeAt(0) % avatarColors.length;
  const avatarBg = avatarColors[colorIdx];

  inboxMain.innerHTML = `
    <div class="chat-header">
      <div class="chat-avatar" style="background:${avatarBg};color:#fff;">${avatarLetter}</div>
      <div>
        <div class="chat-name">${safeText(partnerName)}</div>
        <div class="chat-sub">🟢 Active · Messages expire after 48 hours</div>
      </div>
    </div>
    <div id="chat-messages" class="chat-messages"></div>
    <div class="chat-input-row">
      <input type="text" id="chat-input" placeholder="Type a message…" onkeydown="if(event.key==='Enter') sendChatMessage()">
      <button class="btn btn-primary btn-sm" onclick="sendChatMessage()">Send</button>
    </div>`;

  await refreshChat();

  // Poll every 1.5 seconds for near-instant updates
  chatPollInterval = setInterval(refreshChat, 1500);
}

// ── Safe text helper (avoids XSS in innerHTML) ──
function safeText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
