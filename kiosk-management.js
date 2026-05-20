if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();

const messageEl = document.getElementById('message');
const orgSelect = document.getElementById('org-select');
const kioskNameInput = document.getElementById('kiosk-name');
const kioskPinInput = document.getElementById('kiosk-pin');
const createKioskBtn = document.getElementById('create-kiosk-btn');
const refreshOrgsBtn = document.getElementById('refresh-orgs-btn');
const kioskTableBody = document.getElementById('kiosk-table-body');
const kioskCount = document.getElementById('kiosk-count');
const backBtn = document.getElementById('back-btn');

let currentUser = null;
let currentOrgId = null;
let kiosks = {};

function showMessage(text, type = 'info') {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.style.display = 'block';
  clearTimeout(showMessage.timeout);
  showMessage.timeout = setTimeout(() => {
    messageEl.style.display = 'none';
  }, 4000);
}

function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  return new Date(timestamp).toLocaleString();
}

function generateKioskId() {
  return 'KIOSK_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
}

async function hashPin(pin) {
  return 'hash_' + String(pin).split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

async function isSuperAdmin(user) {
  if (!user) return false;
  if (user.uid === 'tcWCQtILJNcahfAQA3qakrUP9Nv1') return true;
  if ((user.email || '').toLowerCase() === 'contact.pasan@gmail.com') return true;
  const token = await user.getIdTokenResult(true);
  return !!(token.claims && token.claims.superadmin === true);
}

async function requireSuperAdmin(user) {
  if (!user) {
    window.location.href = 'index.html';
    return false;
  }
  const allowed = await isSuperAdmin(user);
  if (!allowed) {
    showMessage('Access denied. Superadmin only.', 'error');
    await auth.signOut();
    window.location.href = 'index.html';
  }
  return allowed;
}

async function loadOrganizations() {
  orgSelect.innerHTML = '<option value="">Loading organizations...</option>';
  try {
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};
    const approvedOrgs = Object.entries(users)
      .filter(([_, profile]) => profile && profile.role === 'approved')
      .sort(([, a], [, b]) => String(a.email || '').localeCompare(String(b.email || '')));

    if (approvedOrgs.length === 0) {
      orgSelect.innerHTML = '<option value="">No approved organizations found</option>';
      kioskTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No organizations available.</td></tr>';
      kioskCount.textContent = '0 kiosks';
      return;
    }

    orgSelect.innerHTML = '<option value="">Select organization</option>';
    approvedOrgs.forEach(([uid, profile]) => {
      const option = document.createElement('option');
      option.value = uid;
      option.textContent = `${profile.email || uid}`;
      orgSelect.appendChild(option);
    });
    orgSelect.value = approvedOrgs[0][0];
    currentOrgId = approvedOrgs[0][0];
    await loadKiosks();
  } catch (error) {
    console.error(error);
    showMessage('Failed to load organizations: ' + (error.message || 'unknown error'), 'error');
  }
}

async function loadKiosks() {
  if (!currentOrgId) {
    kioskTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">Select an organization to load kiosks.</td></tr>';
    kioskCount.textContent = '0 kiosks';
    return;
  }
  try {
    const snap = await db.ref(`users/${currentOrgId}/kiosks`).once('value');
    kiosks = snap.val() || {};
    renderKioskTable();
  } catch (error) {
    console.error(error);
    showMessage('Failed to load kiosks: ' + (error.message || 'unknown error'), 'error');
  }
}

function renderKioskTable() {
  const entries = Object.entries(kiosks);
  kioskCount.textContent = `${entries.length} kiosk${entries.length === 1 ? '' : 's'}`;
  if (entries.length === 0) {
    kioskTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No kiosks found for this organization.</td></tr>';
    return;
  }
  kioskTableBody.innerHTML = '';
  entries.forEach(([kioskId, kiosk]) => {
    const tr = document.createElement('tr');
    const name = kiosk.name || 'Untitled';
    const status = kiosk.status || 'active';
    const created = formatDate(kiosk.createdAt);
    tr.innerHTML = `
      <td>${name}</td>
      <td><span class="status-pill">${status}</span></td>
      <td>${created}</td>
      <td><code style="font-size:12px; color:#334155;">${kioskId}</code></td>
      <td style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="button button-secondary" data-action="reset" data-id="${kioskId}">Reset PIN</button>
        <button class="button button-danger" data-action="delete" data-id="${kioskId}">Delete</button>
      </td>
    `;
    kioskTableBody.appendChild(tr);
  });
}

async function createKiosk() {
  if (!currentOrgId) {
    showMessage('Select an organization first.', 'error');
    return;
  }
  const name = kioskNameInput.value.trim();
  const pin = kioskPinInput.value.trim();
  if (!name) {
    showMessage('KIOSK name is required.', 'error');
    return;
  }
  if (!/^\d{4,6}$/.test(pin)) {
    showMessage('PIN must be 4-6 digits.', 'error');
    return;
  }

  const kioskId = generateKioskId();
  const kioskUserId = `kiosk_${kioskId}`;
  try {
    const pinHash = await hashPin(pin);
    const updates = {};
    updates[`users/${currentOrgId}/kiosks/${kioskId}`] = {
      id: kioskId,
      name,
      status: 'active',
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: currentUser.uid,
      organizationId: currentOrgId,
      tokensGenerated: 0
    };
    updates[`kioskUsers/${kioskUserId}`] = {
      id: kioskUserId,
      kioskId,
      organizationId: currentOrgId,
      pinHash,
      role: 'kiosk',
      status: 'active',
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    await db.ref().update(updates);
    kioskNameInput.value = '';
    kioskPinInput.value = '';
    showMessage('KIOSK created successfully.', 'success');
    await loadKiosks();
  } catch (error) {
    console.error(error);
    showMessage('Failed to create kiosk: ' + (error.message || 'unknown error'), 'error');
  }
}

async function resetKioskPin(kioskId) {
  const newPin = prompt('Enter new PIN for kiosk (4-6 digits):');
  if (!newPin) return;
  if (!/^\d{4,6}$/.test(newPin)) {
    showMessage('PIN must be 4-6 digits.', 'error');
    return;
  }
  try {
    const pinHash = await hashPin(newPin);
    await db.ref(`kioskUsers/kiosk_${kioskId}`).update({ pinHash });
    showMessage('PIN reset successfully.', 'success');
  } catch (error) {
    console.error(error);
    showMessage('Failed to reset PIN: ' + (error.message || 'unknown error'), 'error');
  }
}

async function deleteKiosk(kioskId) {
  if (!confirm('Delete this kiosk and remove its PIN login?')) return;
  try {
    const updates = {};
    updates[`users/${currentOrgId}/kiosks/${kioskId}`] = null;
    updates[`kioskUsers/kiosk_${kioskId}`] = null;
    await db.ref().update(updates);
    showMessage('KIOSK deleted successfully.', 'success');
    await loadKiosks();
  } catch (error) {
    console.error(error);
    showMessage('Failed to delete kiosk: ' + (error.message || 'unknown error'), 'error');
  }
}

backBtn.addEventListener('click', () => {
  window.location.href = 'admin.html';
});

orgSelect.addEventListener('change', async () => {
  currentOrgId = orgSelect.value || null;
  await loadKiosks();
});

createKioskBtn.addEventListener('click', createKiosk);
refreshOrgsBtn.addEventListener('click', loadOrganizations);

kioskTableBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.action;
  const kioskId = button.dataset.id;
  if (action === 'reset') {
    await resetKioskPin(kioskId);
  }
  if (action === 'delete') {
    await deleteKiosk(kioskId);
  }
});

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  const allowed = await requireSuperAdmin(user);
  if (!allowed) return;
  currentUser = user;
  await loadOrganizations();
});
