// ============================================================
// ROKTOKONIKA — Core Application Logic  (app.js)
// ============================================================

// ── Supabase ──
const { createClient } = supabase;
const sb = createClient(
  'https://auajakltxqknexfsxqmt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1YWpha2x0eHFrbmV4ZnN4cW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxOTUyMzUsImV4cCI6MjEwNDc3MTIzNX0.TI1NSg5yR2a9Bfo_FMsGuoZ89sRuNeggDLg8UZM39BQ'
);

// ── Dhaka Locations ──
const LOCATIONS = [
  'Adabor','Badda','Banani','Bashundhara','Dhanmondi',
  'Demra','Farmgate','Gulshan','Hazaribagh','Jatrabari',
  'Kafrul','Kalabagan','Khilgaon','Khilkhet','Lalbagh',
  'Mirpur','Mohammadpur','Motijheel','Pallabi','Rampura',
  'Shyamoli','Sutrapur','Tejgaon','Uttara','Wari'
];

// ── Global State ──
let currentUser    = null;
let currentProfile = null;

// ============================================================
// INIT
// ============================================================
window.addEventListener('load', () => {
  populateLocationDropdowns();
  populateMonthFilter();
  initScrollReveal();
  loadLandingStats();

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      if (session) {
        currentUser = session.user;
        await checkProfile();
      } else {
        showScreen('landing-screen');
      }
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      showScreen('landing-screen');
    }
  });
});

// ── Populate location dropdowns ──
function populateLocationDropdowns() {
  const targets = ['#p-location','#req-location','#donor-filter-location'];
  targets.forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    LOCATIONS.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc; opt.textContent = loc;
      el.appendChild(opt);
    });
  });
}

// ── Month filter options ──
function populateMonthFilter() {
  const sel = document.getElementById('admin-month-filter');
  if (!sel) return;
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = label;
    sel.appendChild(opt);
  }
}

// ── Scroll reveal (Intersection Observer) ──
function initScrollReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ── Landing stats counter ──
async function loadLandingStats() {
  const [{ count: donors }, { count: reqs }, { count: fulfilled }] = await Promise.all([
    sb.from('profiles').select('*',{count:'exact',head:true}),
    sb.from('blood_requests').select('*',{count:'exact',head:true}),
    sb.from('blood_requests').select('*',{count:'exact',head:true}).eq('status','fulfilled'),
  ]);
  animateCount('stat-donors', (donors || 0) + 1542);
  animateCount('stat-requests', (reqs || 0) + 845);
  animateCount('stat-fulfilled', (fulfilled || 0) + 520);
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let start = 0;
  const step = Math.ceil(target / 60);
  const tick = () => {
    start = Math.min(start + step, target);
    el.textContent = start.toLocaleString();
    if (start < target) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}


// ============================================================
// SCREEN / TAB MANAGEMENT
// ============================================================
function showScreen(id) {
  ['landing-screen','auth-screen','profile-screen','main-app','admin-screen'].forEach(s => {
    document.getElementById(s).hidden = s !== id;
  });
  if (id === 'landing-screen') { setTimeout(initScrollReveal, 100); }
}

function showTab(name) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  ['dashboard','requests','donors','profile','appeals','inbox'].forEach(n => {
    const el = document.getElementById(`tab-${n}`);
    if (el) el.hidden = n !== name;
  });
  if (name === 'dashboard') { const el = document.getElementById('dash-name'); if(el && currentProfile) el.textContent = currentProfile.name.split(' ')[0]; }
  else if (name === 'requests') loadRequests();
  else if (name === 'donors') loadDonors();
  else if (name === 'profile') renderProfile();
  else if (name === 'appeals') loadAppeals();
  else if (name === 'inbox' && typeof loadInbox === 'function') loadInbox();
}


// ============================================================
// AUTH
// ============================================================
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('login-tab-btn').classList.toggle('active', isLogin);
  document.getElementById('signup-tab-btn').classList.toggle('active', !isLogin);
  document.getElementById('login-form').hidden = !isLogin;
  document.getElementById('signup-form').hidden = isLogin;
}

async function login(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  btn.textContent = 'Logging in…'; btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({
    email: document.getElementById('login-email').value,
    password: document.getElementById('login-password').value,
  });
  if (error) {
    document.getElementById('login-err').textContent = error.message;
    btn.textContent = 'Login'; btn.disabled = false;
  }
}

async function signup(e) {
  e.preventDefault();
  const btn = document.getElementById('signup-btn');
  btn.textContent = 'Creating…'; btn.disabled = true;
  const gender = document.querySelector('input[name="signup-gender"]:checked')?.value || 'male';
  const { error } = await sb.auth.signUp({
    email: document.getElementById('signup-email').value,
    password: document.getElementById('signup-password').value,
    options: { data: { gender } }
  });
  if (error) {
    document.getElementById('signup-err').textContent = error.message;
    btn.textContent = 'Create Account'; btn.disabled = false;
  } else {
    showToast('Account created! Please complete your profile.', 'success');
    // Pre-fill gender in profile setup
    document.getElementById('p-gender').value = gender;
  }
}

async function logout() {
  await sb.auth.signOut();
}


// ============================================================
// CHECK PROFILE AFTER LOGIN
// ============================================================
async function checkProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
  if (data) {
    currentProfile = data;
    if (data.is_admin) {
      document.getElementById('admin-nav-btn').hidden = false;
    }
    showScreen('main-app');
    showTab('dashboard');
    loadUnreadAppealsCount();
  } else {
    // Pre-fill gender from signup metadata
    const meta = currentUser.user_metadata;
    if (meta?.gender) document.getElementById('p-gender').value = meta.gender;
    showScreen('profile-screen');
  }
}


// ============================================================
// PROFILE SETUP
// ============================================================
async function saveProfile(e) {
  e.preventDefault();
  const profile = {
    id:                 currentUser.id,
    name:               document.getElementById('p-name').value.trim(),
    blood_group:        document.getElementById('p-blood').value,
    phone:              document.getElementById('p-phone').value.trim(),
    location:           document.getElementById('p-location').value,
    gender:             document.getElementById('p-gender').value,
    last_donation_date: document.getElementById('p-last-donation').value || null,
  };
  const { error } = await sb.from('profiles').insert(profile);
  if (error) { document.getElementById('profile-err').textContent = error.message; return; }
  currentProfile = profile;
  showToast('Welcome to RoktoKonika! 🩸', 'success');
  showScreen('main-app');
  showTab('dashboard');
  loadUnreadAppealsCount();
}


// ============================================================
// BLOOD REQUESTS TAB
// ============================================================
async function loadRequests() {
  const list = document.getElementById('requests-list');
  list.innerHTML = '<div class="loading"></div>';
  const bloodFilter = document.getElementById('req-filter-blood').value;
  let query = sb.from('blood_requests').select('*').eq('status','open').order('created_at',{ascending:false});
  if (bloodFilter) query = query.eq('blood_group', bloodFilter);
  const { data: requests, error } = await query;
  if (error || !requests?.length) {
    list.innerHTML = `<div class="empty-state"><div class="emoji">🩸</div><p>${error ? 'Failed to load.' : 'No active blood requests.'}</p></div>`;
    return;
  }
  const ids = requests.map(r => r.id);
  const { data: donations } = await sb.from('donations').select('request_id').in('request_id', ids);
  list.innerHTML = requests.map((req, i) => {
    const count = donations?.filter(d => d.request_id === req.id).length || 0;
    const isOwner = req.requester_id === currentUser.id;
    const isAdmin = currentProfile?.is_admin === true;
    const urgencyClass = (() => {
      const hoursAgo = (Date.now() - new Date(req.created_at)) / 3600000;
      if (hoursAgo < 2) return 'urgency-critical';
      if (hoursAgo < 12) return 'urgency-high';
      return '';
    })();
    // Colorful avatar for requester
    const reqAvatarLetter = (req.requester_name || 'U').charAt(0).toUpperCase();
    const reqAvatarBg = getAvatarColor(req.requester_name);
    return `
    <div class="request-card ${isOwner ? 'is-owner' : ''} ${urgencyClass}" style="animation-delay:${i*0.05}s"
      ${isOwner ? `onclick="openDetailPanel('${req.id}')" title="Click to see matching donors"` : ''}>
      <div class="card-top">
        <div class="card-info">
          <h3>🏥 ${safeText(req.hospital)}</h3>
          <p class="card-poster" style="display:flex;align-items:center;gap:8px;margin-top:4px">
            <span style="width:22px;height:22px;border-radius:50%;background:${reqAvatarBg};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${reqAvatarLetter}</span>
            Posted by <strong>${safeText(req.requester_name)}</strong>${req.requester_gender === 'female' ? ' <span class="gender-tag gender-f">♀</span>' : ' <span class="gender-tag gender-m">♂</span>'}
          </p>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
          <span class="blood-badge">${req.blood_group}</span>
          ${urgencyClass === 'urgency-critical' ? '<span class="urgency-label">🔴 Urgent</span>' : urgencyClass === 'urgency-high' ? '<span class="urgency-label urgency-label-high">🟠 Recent</span>' : ''}
        </div>
      </div>
      <div class="card-meta">
        <span><span class="meta-icon">📍</span>${safeText(req.location)}</span>
        <span><span class="meta-icon">🕐</span>${timeAgo(req.created_at)}</span>
        ${req.hospital_address ? `<span><span class="meta-icon">📌</span>${safeText(req.hospital_address)}</span>` : ''}
      </div>
      ${req.message ? `<div class="card-message">"${safeText(req.message)}"</div>` : ''}
      <div class="card-divider"></div>
      <div class="card-actions">
        ${(isOwner || isAdmin)
          ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;width:100%">
               ${isOwner ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();viewVolunteers('${req.id}')">
                 <span>🙋</span> Volunteers <span class="vol-badge">${count}</span>
               </button>` : ''}
               ${isOwner ? `<button class="btn btn-green btn-sm" onclick="event.stopPropagation();markFulfilled('${req.id}')">
                 <span>✓</span> Mark Fulfilled
               </button>` : ''}
               <button class="btn btn-delete btn-sm" onclick="event.stopPropagation();deleteRequest('${req.id}')" title="${isAdmin && !isOwner ? 'Admin Delete' : 'Delete this request'}">
                 🗑 ${isAdmin && !isOwner ? 'Admin Delete' : 'Delete'}
               </button>
               ${isOwner ? `<span class="owner-hint">Click card to see matching donors →</span>` : ''}
             </div>`
          : `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;width:100%">
               <button class="btn btn-primary btn-sm donate-btn" onclick="openVolunteerModal('${req.id}','${escAttr(req.requester_name)}','${escAttr(req.hospital_address||'')}','${escAttr(req.location)}','${req.requester_id}')">
                 🩸 I Can Donate
               </button>
               <span class="volunteer-count"><span class="vol-count-num">${count}</span> volunteer${count !== 1 ? 's' : ''}</span>
             </div>`
        }
      </div>
    </div>`;
  }).join('');
}

async function createRequest(e) {
  e.preventDefault();
  const { error } = await sb.from('blood_requests').insert({
    requester_id:      currentUser.id,
    requester_name:    currentProfile.name,
    requester_gender:  currentProfile.gender || 'male',
    blood_group:       document.getElementById('req-blood').value,
    hospital:          document.getElementById('req-hospital').value.trim(),
    hospital_address:  document.getElementById('req-hospital-address').value.trim(),
    location:          document.getElementById('req-location').value,
    message:           document.getElementById('req-message').value.trim(),
  });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Blood request posted! 🩸', 'success');
  closeModal('req-modal');
  // Reset form
  ['req-hospital','req-hospital-address','req-message'].forEach(id => document.getElementById(id).value = '');
  loadRequests();
}

async function markFulfilled(requestId) {
  if (!confirm('Mark this request as fulfilled? This cannot be undone.')) return;
  const { error } = await sb.from('blood_requests').update({ status: 'fulfilled' }).eq('id', requestId).eq('requester_id', currentUser.id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Request marked as fulfilled! 🎉', 'success');
  loadRequests();
}

async function deleteRequest(requestId) {
  if (!confirm('Delete this blood request? This action cannot be undone.')) return;
  // Delete associated donations and messages first
  await sb.from('donations').delete().eq('request_id', requestId);
  await sb.from('messages').delete().eq('request_id', requestId);
  await sb.from('blood_appeals').delete().eq('request_id', requestId);
  // Admin can delete any request; regular users can only delete their own
  let query = sb.from('blood_requests').delete().eq('id', requestId);
  if (!currentProfile?.is_admin) {
    query = query.eq('requester_id', currentUser.id);
  }
  const { error } = await query;
  if (error) { showToast('Error deleting request: ' + error.message, 'error'); return; }
  showToast('Request deleted successfully.', 'info');
  loadRequests();
}

async function viewVolunteers(requestId) {
  const { data, error } = await sb.from('donations').select('*').eq('request_id', requestId).order('created_at');
  const list = document.getElementById('vol-list');
  if (error || !data?.length) {
    list.innerHTML = '<div class="empty-state"><div class="emoji">🙋</div><p>No volunteers yet.</p></div>';
  } else {
    list.innerHTML = data.map(d => `
      <div class="vol-item">
        <p style="font-weight:700;font-size:15px">${d.donor_name}</p>
        <p>📞 ${d.donor_phone}</p>
        <p style="font-size:12px;color:var(--muted)">${timeAgo(d.created_at)}</p>
      </div>`).join('');
  }
  openModal('volunteers-modal');
}


// ============================================================
// VOLUNTEER MODAL (Map + Chat)
// ============================================================
function openVolunteerModal(requestId, requesterName, hospitalAddress, reqLocation, requesterId) {
  document.getElementById('vol-modal-title').textContent = `Donate for ${requesterName}'s request`;
  document.getElementById('vol-modal-subtitle').textContent = `📍 ${reqLocation}`;
  document.getElementById('chat-avatar').textContent = requesterName.charAt(0).toUpperCase();
  document.getElementById('chat-with-name').textContent = requesterName;
  document.getElementById('hospital-address-input').value = hospitalAddress || '';
  openModal('volunteer-modal');

  // Init map after modal is visible
  setTimeout(() => {
    initMap('donation-map', currentProfile.location, hospitalAddress, reqLocation);
  }, 150);

  // Init chat (with correct receiver = requester)
  initChat(requestId, requesterId);

  // Register volunteer (ignore duplicate)
  sb.from('donations').insert({
    request_id: requestId,
    donor_id:   currentUser.id,
    donor_name: currentProfile.name,
    donor_phone: currentProfile.phone,
  }).then(({ error }) => {
    if (error?.code === '23505') return; // Already volunteered — that's fine
    if (!error) showToast('You\'ve volunteered! The requester can now see your info. 🙏', 'success');
  });
}


// ============================================================
// REQUEST DETAIL PANEL (owner → see matching donors)
// ============================================================
async function openDetailPanel(requestId) {
  const panel = document.getElementById('request-detail-panel');
  const overlay = document.getElementById('panel-overlay');
  const content = document.getElementById('detail-panel-content');
  content.innerHTML = '<div class="loading"></div>';
  panel.hidden = false;
  overlay.hidden = false;

  // Fetch the request
  const { data: req } = await sb.from('blood_requests').select('*').eq('id', requestId).single();
  if (!req) { content.innerHTML = '<p>Request not found.</p>'; return; }

  // Fetch all eligible donors
  const { data: allDonors } = await sb.from('profiles').select('*').neq('id', currentUser.id);
  const eligible = (allDonors || []).filter(d => isAvailable(d.last_donation_date));

  // Sort: Tier 1 = blood group + location, Tier 2 = blood group only
  //       Within each tier: female first if requester is female
  const isFemalePriority = req.requester_gender === 'female';
  const tier1 = eligible.filter(d => d.blood_group === req.blood_group && d.location === req.location);
  const tier2 = eligible.filter(d => d.blood_group === req.blood_group && d.location !== req.location);
  const sort = arr => isFemalePriority
    ? [...arr.filter(d => d.gender === 'female'), ...arr.filter(d => d.gender !== 'female')]
    : arr;
  const sorted = [...sort(tier1), ...sort(tier2)];

  content.innerHTML = `
    <div style="margin-bottom:20px;padding:16px;background:var(--red-ghost);border-radius:var(--radius);border:1.5px solid var(--red-pale)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><h4 style="font-size:15px;font-weight:700">🏥 ${req.hospital}</h4><p style="font-size:13px;color:var(--muted)">📍 ${req.location} · 🕐 ${timeAgo(req.created_at)}</p></div>
        <span class="blood-badge">${req.blood_group}</span>
      </div>
      ${req.message ? `<p style="font-size:13px;margin-top:10px;color:var(--text2)">${req.message}</p>` : ''}
    </div>
    ${isFemalePriority ? '<div style="font-size:12px;color:#9D174D;background:#FDF2F8;padding:8px 12px;border-radius:6px;margin-bottom:14px;font-weight:600">♀ Female donors are shown first for your safety.</div>' : ''}
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px">${sorted.length} eligible donor(s) found for <strong>${req.blood_group}</strong>:</p>
    <div>
      ${sorted.length === 0 ? '<div class="empty-state"><div class="emoji">😔</div><p>No eligible donors found matching this request.</p></div>' :
        sorted.map(d => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;gap:10px">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="donor-avatar" style="width:40px;height:40px;font-size:16px">${d.name.charAt(0).toUpperCase()}</div>
              <div>
                <p style="font-weight:700;font-size:14px">${d.name} <span class="donor-gender ${d.gender === 'female' ? 'gender-f' : 'gender-m'}">${d.gender === 'female' ? '♀' : '♂'}</span></p>
                <p style="font-size:12px;color:var(--muted)">📍 ${d.location} · 📞 ${d.phone}</p>
                ${d.last_donation_date ? `<p style="font-size:11px;color:var(--muted)">Last donated: ${formatDate(d.last_donation_date)}</p>` : '<p style="font-size:11px;color:var(--green)">Never donated</p>'}
              </div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="openSendAppealModal('${d.id}','${escHtml(d.name)}','${req.id}')">📣 Appeal</button>
          </div>`).join('')}
    </div>`;
}

function closeDetailPanel() {
  document.getElementById('request-detail-panel').hidden = true;
  document.getElementById('panel-overlay').hidden = true;
}


// ============================================================
// DONORS TAB
// ============================================================
async function loadDonors() {
  const list = document.getElementById('donors-list');
  list.innerHTML = '<div class="loading"></div>';
  const blood    = document.getElementById('donor-filter-blood').value;
  const location = document.getElementById('donor-filter-location').value;
  const gender   = document.getElementById('donor-filter-gender').value;

  let query = sb.from('profiles').select('*').neq('id', currentUser.id);
  if (blood)    query = query.eq('blood_group', blood);
  if (location) query = query.eq('location', location);
  if (gender)   query = query.eq('gender', gender);

  const { data, error } = await query;
  if (error) { list.innerHTML = '<div class="empty-state"><p>Failed to load donors.</p></div>'; return; }
  const available = (data || []).filter(d => isAvailable(d.last_donation_date));
  if (!available.length) {
    list.innerHTML = '<div class="empty-state"><div class="emoji">👤</div><p>No eligible donors match your filters.</p></div>';
    return;
  }
  list.innerHTML = `<div class="donors-grid">
    ${available.map((d, i) => {
      const avatarBg = getAvatarColor(d.name);
      const avatarLetter = d.name.charAt(0).toUpperCase();
      return `
      <div class="donor-card" style="animation-delay:${i*0.04}s">
        <div class="donor-avatar" style="background:${avatarBg};color:#fff">${avatarLetter}</div>
        <div class="blood-badge" style="font-size:12px;padding:3px 12px;margin-bottom:8px">${d.blood_group}</div>
        <p class="donor-name">${d.name}</p>
        <span class="donor-gender ${d.gender==='female'?'gender-f':'gender-m'}">${d.gender==='female'?'♀ Female':'♂ Male'}</span>
        <p class="donor-location">📍 ${d.location}</p>
        <p class="donor-phone">📞 ${d.phone}</p>
        <p class="donor-last">${d.last_donation_date ? 'Last donated: '+formatDate(d.last_donation_date) : 'Never donated'}</p>
        <span class="badge-available">✓ Available</span>
        <div style="margin-top:10px">
          <button class="btn btn-primary btn-sm w-full" onclick="openSendAppealModal('${d.id}','${escHtml(d.name)}',null)">📣 Send Blood Appeal</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}


// ============================================================
// BLOOD APPEALS — Send
// ============================================================
let pendingAppealDonorId = null;
let pendingAppealDonorName = '';
let pendingAppealRequestId = null;

async function openSendAppealModal(donorId, donorName, requestId) {
  pendingAppealDonorId = donorId;
  pendingAppealDonorName = donorName;
  pendingAppealRequestId = requestId;
  document.getElementById('appeal-to-name').textContent = donorName;

  const container = document.getElementById('my-open-requests-list');

  if (requestId) {
    // Direct link from request detail panel — send immediately
    container.innerHTML = '';
    closeDetailPanel();
    await sendBloodAppeal(donorId, requestId);
    return;
  }

  // Load user's open requests to pick from
  container.innerHTML = '<div class="loading"></div>';
  openModal('appeal-send-modal');
  const { data } = await sb.from('blood_requests').select('*').eq('requester_id', currentUser.id).eq('status','open');
  if (!data?.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:20px">You have no open blood requests.<br>Post a request first.</p>';
    return;
  }
  container.innerHTML = data.map(r => `
    <div class="my-req-item" onclick="sendBloodAppeal('${pendingAppealDonorId}','${r.id}')">
      <span>🏥 ${r.hospital} · <strong>${r.blood_group}</strong> · ${r.location}</span>
      <span class="blood-badge" style="font-size:11px;padding:3px 8px">${r.blood_group}</span>
    </div>`).join('');
}

async function sendBloodAppeal(donorId, requestId) {
  closeModal('appeal-send-modal');
  const { error } = await sb.from('blood_appeals').insert({
    from_user_id: currentUser.id,
    to_donor_id:  donorId,
    request_id:   requestId,
  });
  if (error?.code === '23505') { showToast('You already sent an appeal to this donor for this request.', 'info'); return; }
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(`Blood Appeal sent to ${pendingAppealDonorName}! 📣`, 'success');
}


// ============================================================
// BLOOD APPEALS — Inbox
// ============================================================
async function loadAppeals() {
  const list = document.getElementById('appeals-list');
  list.innerHTML = '<div class="loading"></div>';

  const { data, error } = await sb
    .from('blood_appeals')
    .select('*, from_profile:from_user_id(name,phone,blood_group,location,gender), request:request_id(hospital,blood_group,location,hospital_address)')
    .eq('to_donor_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error || !data?.length) {
    list.innerHTML = '<div class="empty-state"><div class="emoji">📭</div><p>No blood appeals yet.</p></div>';
    return;
  }

  // Mark all as read
  await sb.from('blood_appeals').update({ read_at: new Date().toISOString() })
    .eq('to_donor_id', currentUser.id).is('read_at', null);
  document.getElementById('appeals-badge').hidden = true;

  list.innerHTML = data.map(a => {
    const p = a.from_profile;
    const r = a.request;
    const unread = !a.read_at;
    return `
    <div class="appeal-card ${unread ? 'unread' : ''}">
      <div class="appeal-top">
        <div>
          <h4>📣 ${p?.name || 'Someone'} needs ${r?.blood_group || '?'} blood</h4>
          <p>${p?.gender === 'female' ? '♀ Female' : '♂ Male'} · 📍 ${p?.location || '—'} · 📞 ${p?.phone || '—'}</p>
        </div>
        <span class="blood-badge">${r?.blood_group || '?'}</span>
      </div>
      <div class="appeal-meta">🏥 ${r?.hospital || '—'} · 📍 ${r?.location || '—'} · 🕐 ${timeAgo(a.created_at)}</div>
      ${a.status === 'pending' ? `
      <div class="appeal-actions">
        <button class="btn btn-primary btn-sm" onclick="respondAppeal('${a.id}','accepted','${a.from_user_id}','${a.request_id}','${escHtml(r?.hospital_address||'')}','${escHtml(r?.location||'')}','${escHtml(p?.name||'')}')">✓ Accept & Chat</button>
        <button class="btn btn-danger btn-sm" onclick="respondAppeal('${a.id}','declined',null,null,null,null,null)">✕ Decline</button>
      </div>` : `<span class="badge-${a.status === 'accepted' ? 'available' : 'not-available'}">${a.status === 'accepted' ? '✓ Accepted' : '✕ Declined'}</span>`}
    </div>`;
  }).join('');
}

async function respondAppeal(appealId, status, requesterId, requestId, hospitalAddress, reqLocation, requesterName) {
  const { error } = await sb.from('blood_appeals').update({ status }).eq('id', appealId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  if (status === 'accepted' && requesterId) {
    showToast('Appeal accepted! Opening chat & map…', 'success');
    document.getElementById('vol-modal-title').textContent = `Donate for ${requesterName}'s request`;
    document.getElementById('vol-modal-subtitle').textContent = reqLocation ? `📍 ${reqLocation}` : '';
    document.getElementById('chat-avatar').textContent = (requesterName || '?').charAt(0).toUpperCase();
    document.getElementById('chat-with-name').textContent = requesterName || 'Requester';
    document.getElementById('hospital-address-input').value = hospitalAddress || '';
    openModal('volunteer-modal');
    setTimeout(() => initMap('donation-map', currentProfile.location, hospitalAddress, reqLocation), 150);
    // requesterId is the person who NEEDS blood; we chat with them
    initChat(requestId, requesterId);
  } else {
    showToast('Appeal declined.', 'info');
  }
  loadAppeals();
}

async function loadUnreadAppealsCount() {
  const { count } = await sb.from('blood_appeals')
    .select('*',{count:'exact',head:true})
    .eq('to_donor_id', currentUser.id)
    .is('read_at', null)
    .eq('status', 'pending');
  const badge = document.getElementById('appeals-badge');
  if (count > 0) { badge.textContent = count; badge.hidden = false; }
  else badge.hidden = true;
}


// ============================================================
// PROFILE TAB
// ============================================================
function renderProfile() {
  const p = currentProfile;
  const initial = p.name.charAt(0).toUpperCase();
  const avatarBg = getAvatarColor(p.name);
  const canDonate = isAvailable(p.last_donation_date);
  document.getElementById('profile-view').innerHTML = `
    <div class="profile-card">
      <div class="profile-head">
        <div class="profile-avatar" style="background:${avatarBg};color:#fff;font-size:28px">${initial}</div>
        <div>
          <h3>${p.name}</h3>
          <p>${currentUser.email}</p>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">${p.gender === 'female' ? '♀ Female' : '♂ Male'}</p>
          ${p.is_admin ? '<p style="font-size:12px;background:#E0E7FF;color:#4F46E5;padding:2px 10px;border-radius:100px;display:inline-block;margin-top:4px;font-weight:700">⚡ Admin</p>' : ''}
        </div>
      </div>
      <div class="info-grid">
        <div class="info-item"><label>Blood Group</label><p><span class="blood-badge" style="font-size:13px;padding:4px 14px">${p.blood_group}</span></p></div>
        <div class="info-item"><label>Location</label><p>📍 ${p.location}</p></div>
        <div class="info-item"><label>Phone</label><p>📞 ${p.phone}</p></div>
        <div class="info-item"><label>Last Donation</label><p>${p.last_donation_date ? formatDate(p.last_donation_date) : 'Never donated'}</p></div>
        <div class="info-item"><label>Donation Status</label><p>${canDonate ? '<span class="badge-available">✓ Available to Donate</span>' : '<span class="badge-not-available">⏳ Not Yet Eligible</span>'}</p></div>
        <div class="info-item"><label>Gender</label><p>${p.gender === 'female' ? '♀ Female' : '♂ Male'}</p></div>
      </div>
      <div class="profile-actions">
        <button class="btn btn-outline btn-sm" onclick="toggleEditProfileForm()">✏️ Edit Profile</button>
        ${canDonate ? '<button class="btn btn-primary btn-sm" onclick="markDonatedToday()">🩸 I Donated Today</button>' : ''}
      </div>
    </div>
    <div id="edit-profile-form" class="profile-card" hidden>
      <h3 style="font-size:16px;margin-bottom:18px;font-weight:700">Edit Profile</h3>
      <div class="form-row">
        <div class="form-group"><label>Full Name</label><input type="text" id="edit-name" value="${p.name}"></div>
        <div class="form-group"><label>Phone</label><input type="tel" id="edit-phone" value="${p.phone}"></div>
      </div>
      <div class="form-group"><label>Location</label><select id="edit-location">${LOCATIONS.map(l => `<option ${l===p.location?'selected':''}>${l}</option>`).join('')}</select></div>
      <div style="display:flex;gap:10px;margin-top:6px">
        <button class="btn btn-primary btn-sm" onclick="updateProfile()">Save Changes</button>
        <button class="btn btn-outline btn-sm" onclick="toggleEditProfileForm()">Cancel</button>
      </div>
    </div>`;
}

function toggleEditProfileForm() {
  const f = document.getElementById('edit-profile-form');
  if (f) f.hidden = !f.hidden;
}

async function updateProfile() {
  const updates = {
    name:     document.getElementById('edit-name').value.trim(),
    phone:    document.getElementById('edit-phone').value.trim(),
    location: document.getElementById('edit-location').value,
  };
  const { error } = await sb.from('profiles').update(updates).eq('id', currentUser.id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  currentProfile = { ...currentProfile, ...updates };
  showToast('Profile updated!', 'success');
  renderProfile();
}

async function markDonatedToday() {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await sb.from('profiles').update({ last_donation_date: today }).eq('id', currentUser.id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  currentProfile.last_donation_date = today;
  showToast('Donation recorded! Thank you for saving a life! 🙏', 'success');
  renderProfile();
}


// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id)  { document.getElementById(id).hidden = false; }
function closeModal(id) {
  document.getElementById(id).hidden = true;
  // Stop chat polling when volunteer modal closes
  if (id === 'volunteer-modal' && typeof stopChatPolling === 'function') stopChatPolling();
}
function overlayClick(event, modalId) { if (event.target.id === modalId) closeModal(modalId); }


// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function isAvailable(lastDonationDate) {
  if (!lastDonationDate) return true;
  return (Date.now() - new Date(lastDonationDate).getTime()) / 86400000 >= 120;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function timeAgo(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

// Escapes a string for safe use inside HTML attributes (single-quoted)
function escAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Alias for backward compat
function escHtml(str) { return escAttr(str); }

// ── Deterministic avatar color from name ──
function getAvatarColor(name) {
  const palette = [
    '#DC2626','#7C3AED','#059669','#D97706',
    '#2563EB','#DB2777','#0891B2','#65A30D',
    '#EA580C','#6D28D9'
  ];
  let hash = 0;
  const s = String(name || 'U');
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.classList.remove('show'); }, 3500);
}
