// ============================================================
// ROKTOKONIKA — Admin Dashboard Logic (admin.js)
// Uses Chart.js for visualizations
// ============================================================

let adminCharts = {};
let rawProfiles  = [];
let rawRequests  = [];
let rawDonations = [];
let rawAppeals   = [];

let currentSortColumn = '';
let currentSortAsc = true;
let adminRequestsPage = 1;
const ADMIN_REQUESTS_PER_PAGE = 20;

// ── Load all data for admin dashboard ──
async function loadAdminData() {
  if (!currentProfile?.is_admin) {
    showToast('Access denied.', 'error');
    showScreen('main-app');
    return;
  }

  showToast('Loading dashboard data...', 'info');

  const [resProfiles, resRequests, resDonations, resAppeals] = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('blood_requests').select('*').order('created_at', { ascending: false }),
    sb.from('donations').select('*'),
    sb.from('blood_appeals').select('*')
  ]);

  if (resProfiles.error || resRequests.error) {
    showToast('Failed to load admin data.', 'error');
    return;
  }

  rawProfiles  = resProfiles.data  || [];
  rawRequests  = resRequests.data  || [];
  rawDonations = resDonations.data || [];
  rawAppeals   = resAppeals.data   || [];

  updateAdminStats(rawProfiles, rawRequests, rawDonations, rawAppeals);
  renderCharts(rawProfiles, rawRequests, rawDonations);
  renderAdminTable(rawProfiles);
  renderAdminRequestsTable(rawRequests);
  showToast('Dashboard loaded!', 'success');
}

// ── Filter Data based on dropdowns ──
function filterAdminData() {
  const monthFilter = document.getElementById('admin-month-filter').value;
  const bloodFilter = document.getElementById('admin-blood-filter').value;
  const genderFilter = document.getElementById('admin-gender-filter').value;

  let fProfiles  = rawProfiles;
  let fRequests  = rawRequests;
  let fDonations = rawDonations;
  let fAppeals   = rawAppeals;

  if (monthFilter) {
    fRequests  = fRequests.filter(r  => r.created_at  && r.created_at.startsWith(monthFilter));
    fDonations = fDonations.filter(d => d.created_at  && d.created_at.startsWith(monthFilter));
    fAppeals   = fAppeals.filter(a   => a.created_at  && a.created_at.startsWith(monthFilter));
  }

  if (bloodFilter) {
    fProfiles  = fProfiles.filter(p  => p.blood_group === bloodFilter);
    fRequests  = fRequests.filter(r  => r.blood_group === bloodFilter);
  }

  if (genderFilter) {
    fProfiles  = fProfiles.filter(p  => p.gender === genderFilter);
    fRequests  = fRequests.filter(r  => r.requester_gender === genderFilter);
  }

  updateAdminStats(fProfiles, fRequests, fDonations, fAppeals);
  renderCharts(fProfiles, fRequests, fDonations);
  renderAdminTable(fProfiles);
  renderAdminRequestsTable(fRequests);
}

// ── Update Top Stat Cards ──
function updateAdminStats(profiles, requests, donations, appeals) {
  const activeDonors = profiles.filter(p => isAvailable(p.last_donation_date)).length;
  const fulfilledReqs = requests.filter(r => r.status === 'fulfilled').length;

  document.getElementById('asc-users').textContent = profiles.length.toLocaleString();
  document.getElementById('asc-requests').textContent = requests.length.toLocaleString();
  document.getElementById('asc-fulfilled').textContent = fulfilledReqs.toLocaleString();
  document.getElementById('asc-donations').textContent = donations.length.toLocaleString();
  document.getElementById('asc-active').textContent = activeDonors.toLocaleString();
  document.getElementById('asc-appeals').textContent = appeals.length.toLocaleString();
}

// ── Destroy old charts before re-rendering ──
function destroyCharts() {
  Object.values(adminCharts).forEach(chart => chart.destroy());
  adminCharts = {};
}

// ── Render all Chart.js visualizations ──
function renderAdminTable(users) {
  const tbody = document.getElementById('admin-table-body');
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--muted)">No users match the current filters.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => {
    let statusHTML = isAvailable(u.last_donation_date)
       ? '<span style="color:#059669;font-weight:600;background:#D1FAE5;padding:2px 8px;border-radius:10px;font-size:11px">Available</span>'
       : '<span style="color:#B91C1C;font-weight:600;background:#FEE2E2;padding:2px 8px;border-radius:10px;font-size:11px">Not Eligible</span>';
    
    if (u.is_admin) {
       statusHTML = '<span style="color:#4F46E5;font-weight:600;background:#E0E7FF;padding:2px 8px;border-radius:10px;font-size:11px">Admin</span>';
    }

    const deleteBtn = u.is_admin
      ? '' // Cannot delete admin accounts from panel
      : `<button class="btn btn-delete btn-sm" onclick="adminDeleteUser('${u.id}','${escAttr(u.name)}')">🗑</button>`;

    return `
      <tr>
        <td style="font-weight:600">
          <div style="display:flex;align-items:center;gap:10px">
            ${getAdminAvatar(u.name, 32)}
            ${u.name}
          </div>
        </td>
        <td><span class="blood-badge" style="font-size:11px;padding:3px 8px">${u.blood_group}</span></td>
        <td>${u.gender==='female'?'♀ Female':'♂ Male'}</td>
        <td style="color:var(--muted)">${u.location}</td>
        <td style="color:var(--muted)">${formatDateAdmin(u.last_donation_date)}</td>
        <td>${statusHTML}</td>
        <td>${deleteBtn}</td>
      </tr>
    `;
  }).join('');
}

// ── Render Blood Requests Management Table ──
function renderAdminRequestsTable(requests) {
  const tbody = document.getElementById('admin-requests-table-body');
  if (!tbody) return;

  if (!requests || !requests.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">No blood requests found.</td></tr>';
    return;
  }

  tbody.innerHTML = requests.map(r => {
    const statusBadge = r.status === 'fulfilled'
      ? '<span style="color:#059669;font-weight:600;background:#D1FAE5;padding:2px 8px;border-radius:10px;font-size:11px">Fulfilled</span>'
      : '<span style="color:#B45309;font-weight:600;background:#FEF3C7;padding:2px 8px;border-radius:10px;font-size:11px">Open</span>';
    return `
      <tr>
        <td style="font-weight:600">${safeText(r.requester_name)}</td>
        <td><span class="blood-badge" style="font-size:11px;padding:3px 8px">${r.blood_group}</span></td>
        <td style="color:var(--muted)">${safeText(r.hospital)}</td>
        <td style="color:var(--muted)">${safeText(r.location)}</td>
        <td>${statusBadge}</td>
        <td style="color:var(--muted);font-size:12px">${formatDateAdmin(r.created_at)}</td>
        <td>
          <button class="btn btn-delete btn-sm" onclick="adminDeleteRequest('${r.id}','${escAttr(r.requester_name)}')">🗑 Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ── Admin: Delete any blood request (bypasses ownership check) ──
async function adminDeleteRequest(requestId, requesterName) {
  if (!confirm(`Delete blood request by ${requesterName}? This cannot be undone.`)) return;
  // Clean up related data first
  await sb.from('donations').delete().eq('request_id', requestId);
  await sb.from('messages').delete().eq('request_id', requestId);
  await sb.from('blood_appeals').delete().eq('request_id', requestId);
  const { error } = await sb.from('blood_requests').delete().eq('id', requestId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Blood request deleted.', 'info');
  rawRequests = rawRequests.filter(r => r.id !== requestId);
  renderAdminRequestsTable(rawRequests);
  updateAdminStats(rawProfiles, rawRequests, rawDonations, rawAppeals);
}

// ── Admin: Delete any user profile ──
async function adminDeleteUser(userId, userName) {
  if (!confirm(`Delete user "${userName}"? This will remove their profile and all associated data. This cannot be undone.`)) return;
  // Remove their requests first
  const userReqs = rawRequests.filter(r => r.requester_id === userId).map(r => r.id);
  for (const rid of userReqs) {
    await sb.from('donations').delete().eq('request_id', rid);
    await sb.from('messages').delete().eq('request_id', rid);
    await sb.from('blood_appeals').delete().eq('request_id', rid);
    await sb.from('blood_requests').delete().eq('id', rid);
  }
  await sb.from('donations').delete().eq('donor_id', userId);
  await sb.from('blood_appeals').delete().eq('to_donor_id', userId);
  await sb.from('blood_appeals').delete().eq('from_user_id', userId);
  await sb.from('messages').delete().eq('sender_id', userId);
  await sb.from('messages').delete().eq('receiver_id', userId);
  const { error } = await sb.from('profiles').delete().eq('id', userId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(`User "${userName}" deleted.`, 'info');
  rawProfiles  = rawProfiles.filter(p => p.id !== userId);
  rawRequests  = rawRequests.filter(r => r.requester_id !== userId);
  renderAdminTable(rawProfiles);
  renderAdminRequestsTable(rawRequests);
  updateAdminStats(rawProfiles, rawRequests, rawDonations, rawAppeals);
}

// ── Generate colored avatar for admin tables ──
function getAdminAvatar(name, size = 36) {
  const colors = ['#DC2626','#7C3AED','#059669','#D97706','#2563EB','#DB2777','#0891B2'];
  const bg = colors[(name || 'U').charCodeAt(0) % colors.length];
  const letter = (name || 'U').charAt(0).toUpperCase();
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size*0.4)}px;flex-shrink:0">${letter}</div>`;
}


// --- Charts Helper functions
function getMonthData(items, dateField) {
  const counts = {};
  items.forEach(item => {
    if (!item[dateField]) return;
    const d = new Date(item[dateField]);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    counts[key] = (counts[key] || 0) + 1;
  });
  
  // Get last 6 months keys
  const labels = [];
  let d = new Date();
  d.setDate(1); // Set to 1st to avoid month jump issues
  for(let i=5; i>=0; i--) {
     const temp = new Date(d.getFullYear(), d.getMonth() - i, 1);
     const key = `${temp.getFullYear()}-${String(temp.getMonth() + 1).padStart(2, '0')}`;
     labels.push(key);
  }
  
  return labels.map(k => ({ label: getMonthShortName(k), count: counts[k] || 0 }));
}

function getMonthShortName(yyyyMm) {
   const [y, m] = yyyyMm.split('-');
   const d = new Date(parseInt(y), parseInt(m)-1, 1);
   return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function renderCharts(profiles, requests, donations) {
  destroyCharts();
  
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.color = '#64748B';

  // 1. Requests Over Time (Line)
  const reqTrend = getMonthData(requests, 'created_at');
  adminCharts.requestsTimeline = new Chart(document.getElementById('chart-requests-timeline'), {
    type: 'line',
    data: {
      labels: reqTrend.map(d => d.label),
      datasets: [{
        label: 'Blood Requests',
        data: reqTrend.map(d => d.count),
        borderColor: '#DC2626',
        backgroundColor: 'rgba(220, 38, 38, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#B91C1C'
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
               scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  // 2. Gender Ratio (Doughnut)
  let male = 0, female = 0;
  profiles.forEach(p => p.gender === 'female' ? female++ : male++);
  adminCharts.gender = new Chart(document.getElementById('chart-gender'), {
    type: 'doughnut',
    data: {
      labels: ['Male', 'Female'],
      datasets: [{
        data: [male, female],
        backgroundColor: ['#3B82F6', '#EC4899'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '70%', 
               plugins: { legend: { position: 'bottom' } } }
  });

  // 3. Donations Per Month (Bar)
  const donTrend = getMonthData(donations, 'created_at');
  adminCharts.donationsMonth = new Chart(document.getElementById('chart-donations-month'), {
    type: 'bar',
    data: {
      labels: donTrend.map(d => d.label),
      datasets: [{
        label: 'Donations Volunteered',
        data: donTrend.map(d => d.count),
        backgroundColor: '#059669',
        borderRadius: 4
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
               scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  // 4. Blood Groups (Horizontal Bar)
  const bgCounts = {};
  profiles.forEach(p => bgCounts[p.blood_group] = (bgCounts[p.blood_group]||0)+1);
  const bgLabels = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
  adminCharts.bloodgroups = new Chart(document.getElementById('chart-bloodgroups'), {
    type: 'bar',
    data: {
      labels: bgLabels,
      datasets: [{
        label: 'Registered Users',
        data: bgLabels.map(bg => bgCounts[bg] || 0),
        backgroundColor: '#EF4444',
        borderRadius: 4
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } },
               scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  // 5. Request Status (Pie)
  let open = 0, fulfilled = 0;
  requests.forEach(r => r.status === 'fulfilled' ? fulfilled++ : open++);
  adminCharts.status = new Chart(document.getElementById('chart-status'), {
    type: 'pie',
    data: {
      labels: ['Open', 'Fulfilled'],
      datasets: [{
        data: [open, fulfilled],
        backgroundColor: ['#F59E0B', '#10B981'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  // 6. Top Locations (Bar)
  const locCounts = {};
  profiles.forEach(p => locCounts[p.location] = (locCounts[p.location]||0)+1);
  const sortedLocs = Object.entries(locCounts).sort((a,b) => b[1]-a[1]).slice(0, 5); // top 5
  adminCharts.locations = new Chart(document.getElementById('chart-locations'), {
    type: 'bar',
    data: {
      labels: sortedLocs.map(l => l[0]),
      datasets: [{
        label: 'Users',
        data: sortedLocs.map(l => l[1]),
        backgroundColor: '#8B5CF6',
        borderRadius: 4
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
               scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

// ── Table Utilities ──
function sortTable(column) {
  if (currentSortColumn === column) {
    currentSortAsc = !currentSortAsc;
  } else {
    currentSortColumn = column;
    currentSortAsc = true;
  }

  const sorted = [...rawProfiles].sort((a, b) => {
    let valA = a[column] || '';
    let valB = b[column] || '';
    
    // Sort strings case-insensitive
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    
    if (valA < valB) return currentSortAsc ? -1 : 1;
    if (valA > valB) return currentSortAsc ? 1 : -1;
    return 0;
  });

  // Need to respect filters if active, but simpler to just re-apply filters & sort
  // For simplicity, we just sort the raw dataset and re-trigger filter chain.
  rawProfiles = sorted;
  filterAdminData();
}

function formatDateAdmin(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function exportCSV() {
  const headers = ['Name', 'Email', 'Blood Group', 'Gender', 'Phone', 'Location', 'Last Donation Date', 'Is Admin'];
  let csv = headers.join(',') + '\n';
  
  // Use currently filtered data from table essentially. Use rawProfiles but filtered.
  const bloodFilter = document.getElementById('admin-blood-filter').value;
  const genderFilter = document.getElementById('admin-gender-filter').value;
  
  let toExport = rawProfiles;
  if (bloodFilter) toExport = toExport.filter(p => p.blood_group === bloodFilter);
  if (genderFilter) toExport = toExport.filter(p => p.gender === genderFilter);

  toExport.forEach(p => {
    const row = [
      `"${p.name || ''}"`,
      `""`, // email not loaded in profiles by default unless fetched via auth admin api, skip for basic export
      p.blood_group || '',
      p.gender || '',
      `"${p.phone || ''}"`,
      `"${p.location || ''}"`,
      p.last_donation_date || 'Never',
      p.is_admin ? 'Yes' : 'No'
    ];
    csv += row.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `roktokonika_donors_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
