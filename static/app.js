/* ═══════════════════════════════════════════════════════════════════════
   Google Drive File Manager — Client-Side App
   ═══════════════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────────────
const state = {
  user: null,
  currentFolderId: 'root',
  breadcrumb: [{ id: 'root', name: 'My Drive' }],
  files: [],
  nextPageToken: null,
  searching: false,
};

// ──── DOM refs ────
const $ = id => document.getElementById(id);
const loginContainer = $('login-container');
const appContainer = $('app-container');
const fileGrid = $('file-grid');
const breadcrumb = $('breadcrumb');
const loading = $('loading');
const emptyState = $('empty-state');
const loadMoreBtn = $('load-more');
const uploadProgress = $('upload-progress');
const progressFill = $('progress-fill');
const progressText = $('progress-text');
const dropOverlay = $('drop-overlay');

// ──── API helpers ────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (res.status === 401) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

function apiUpload(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path, true);
    xhr.withCredentials = true;
    xhr.upload.onprogress = onProgress;
    xhr.onload = () => {
      if (xhr.status === 401) { window.location.reload(); return; }
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) reject(new Error(data.detail || 'Upload failed'));
        else resolve(data);
      } catch (e) { reject(new Error('Invalid response')); }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

// ──── Auth ────
async function init() {
  try {
    const data = await api('/api/me');
    if (data) {
      state.user = data;
      showApp();
      loadFiles();
    }
  } catch (_) { showLogin(); }
}

function login() { window.location.href = '/auth/login'; }

async function logout() {
  window.location.href = '/auth/logout';
}

function showLogin() {
  loginContainer.classList.remove('hidden');
  appContainer.classList.add('hidden');
}

function showApp() {
  loginContainer.classList.add('hidden');
  appContainer.classList.remove('hidden');
  const info = state.user;
  $('user-avatar').src = info.picture || '';
  $('user-email').textContent = info.email;
  $('user-info').style.display = 'flex';
}

// ──── File list ────
async function loadFiles(pageToken) {
  showLoading(true);
  try {
    const params = `folder_id=${state.currentFolderId}${pageToken ? `&page_token=${pageToken}` : ''}`;
    const data = await api(`/api/files?${params}`);
    if (!data) return;
    if (!pageToken) state.files = data.files;
    else state.files = [...state.files, ...data.files];
    state.nextPageToken = data.nextPageToken || null;
    renderAll();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function loadMore() {
  if (state.nextPageToken) await loadFiles(state.nextPageToken);
}

// ──── Search ────
async function searchFiles() {
  const q = $('search-input').value.trim();
  if (!q) return;
  showLoading(true);
  state.searching = true;
  $('clear-search').style.display = 'inline-flex';
  try {
    const data = await api(`/api/files/search?q=${encodeURIComponent(q)}&folder_id=${state.currentFolderId}`);
    if (!data) return;
    state.files = data.files;
    state.nextPageToken = null;
    renderAll();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function clearSearch() {
  $('search-input').value = '';
  $('clear-search').style.display = 'none';
  state.searching = false;
  loadFiles();
}

// ──── Upload ────
async function uploadFiles(fileList) {
  if (!fileList || !fileList.length) return;
  const total = fileList.length;
  let completed = 0;

  uploadProgress.classList.remove('hidden');
  progressFill.style.width = '0%';

  const files = [];
  for (const file of fileList) files.push(file);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const formData = new FormData();
    formData.append('files', file);
    formData.append('folder_id', state.currentFolderId);

    try {
      progressText.textContent = `กำลังอัปโหลด (${i + 1}/${total}): ${file.name}`;
      await apiUpload('/api/files/upload', formData, (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          progressFill.style.width = `${pct}%`;
        }
      });
      completed++;
    } catch (e) {
      toast(`อัปโหลด ${file.name} ล้มเหลว: ${e.message}`, 'error');
    }
  }

  uploadProgress.classList.add('hidden');
  if (completed > 0) {
    toast(`อัปโหลดสำเร็จ ${completed}/${total} ไฟล์`, 'success');
    loadFiles();
  }
}

// ──── Delete ────
let deleteTarget = null;

function showDeleteConfirm(file) {
  deleteTarget = file;
  $('delete-message').textContent = `คุณต้องการลบ "${file.name}"?`;
  $('delete-confirm-btn').onclick = confirmDelete;
  $('delete-modal').classList.remove('hidden');
}

async function confirmDelete() {
  if (!deleteTarget) return;
  $('delete-modal').classList.add('hidden');
  try {
    await api(`/api/files/${deleteTarget.id}`, { method: 'DELETE' });
    toast(`ลบ "${deleteTarget.name}" สำเร็จ`, 'success');
    state.files = state.files.filter(f => f.id !== deleteTarget.id);
    deleteTarget = null;
    renderAll();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function closeDeleteModal() { $('delete-modal').classList.add('hidden'); deleteTarget = null; }

// ──── Share ────
let shareTargetId = null;
let shareTargetName = '';

function shareFile(fileId, fileName) {
  shareTargetId = fileId;
  shareTargetName = fileName || '';
  $('share-email-input').value = '';
  $('share-link-input').value = '';
  $('share-link-input').parentElement.style.display = 'none';
  $('share-status').textContent = '';
  $('share-email-btn').textContent = 'แชร์';
  $('share-email-btn').disabled = false;
  $('share-modal').classList.remove('hidden');
  $('share-email-input').focus();
}

async function shareToEmail() {
  const email = $('share-email-input').value.trim();
  const btn = $('share-email-btn');
  btn.textContent = 'กำลังแชร์...';
  btn.disabled = true;
  try {
    const data = await api(`/api/files/${shareTargetId}/share`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    $('share-link-input').value = data.link;
    $('share-link-input').parentElement.style.display = 'flex';
    if (email) {
      $('share-status').textContent = `✅ แชร์ "${shareTargetName}" ให้ ${email} แล้ว`;
    } else {
      $('share-status').textContent = '✅ สร้างลิงก์สาธารณะแล้ว';
    }
    btn.textContent = 'แชร์ซ้ำ';
    btn.disabled = false;
  } catch (e) {
    toast(e.message, 'error');
    btn.textContent = 'แชร์';
    btn.disabled = false;
  }
}

function closeShareModal() { $('share-modal').classList.add('hidden'); }

async function copyShareLink() {
  const input = $('share-link-input');
  if (!input.value) return;
  try {
    await navigator.clipboard.writeText(input.value);
    toast('คัดลอกลิงก์แล้ว', 'success');
  } catch (_) {
    input.select();
    document.execCommand('copy');
    toast('คัดลอกลิงก์แล้ว', 'success');
  }
}

// ──── New Folder ────
function showNewFolderModal() { $('new-folder-modal').classList.remove('hidden'); $('folder-name-input').value = ''; $('folder-name-input').focus(); }
function closeNewFolderModal() { $('new-folder-modal').classList.add('hidden'); }

async function confirmCreateFolder() {
  const name = $('folder-name-input').value.trim();
  if (!name) return;
  closeNewFolderModal();
  try {
    await api('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parent_id: state.currentFolderId }),
    });
    toast(`สร้างโฟลเดอร์ "${name}" สำเร็จ`, 'success');
    loadFiles();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ──── Navigation ────
function navigateToFolder(id, name) {
  state.breadcrumb.push({ id, name });
  state.currentFolderId = id;
  state.searching = false;
  $('search-input').value = '';
  $('clear-search').style.display = 'none';
  loadFiles();
}

function navigateBreadcrumb(index) {
  if (index < 0) index = 0;
  state.breadcrumb = state.breadcrumb.slice(0, index + 1);
  state.currentFolderId = state.breadcrumb[index].id;
  state.searching = false;
  $('search-input').value = '';
  $('clear-search').style.display = 'none';
  loadFiles();
}

// ──── Preview ────
function previewFile(file) {
  const mime = (file.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) {
    $('preview-image').src = `/api/files/${file.id}/download`;
    $('preview-info').textContent = file.name;
    $('preview-modal').classList.remove('hidden');
  } else if (mime.includes('pdf')) {
    window.open(`/api/files/${file.id}/download`, '_blank');
  } else {
    toast('ไม่สามารถแสดงตัวอย่างไฟล์นี้ได้', 'error');
  }
}

function closePreviewModal() { $('preview-modal').classList.add('hidden'); $('preview-image').src = ''; }

// ──── Download ────
function downloadFile(fileId, fileName) {
  window.open(`/api/files/${fileId}/download`, '_blank');
}

// ──── Move / Copy ────
let pickerMode = 'move'; // 'move' or 'copy'
let pickerTargetId = null;
let pickerTargetName = '';
let pickerStack = [{ id: 'root', name: 'My Drive' }];

function openFolderPicker(mode, fileId, fileName, oldParentId) {
  pickerMode = mode;
  pickerTargetId = fileId;
  pickerTargetName = fileName;
  pickerStack = [{ id: oldParentId || 'root', name: '...' }];
  $('picker-title').textContent = mode === 'move' ? `ย้าย "${fileName}"` : `คัดลอก "${fileName}"`;
  $('picker-confirm-btn').textContent = mode === 'move' ? 'ย้ายที่นี่' : 'คัดลอกที่นี่';
  $('picker-confirm-btn').dataset.fileId = fileId;
  $('picker-confirm-btn').dataset.oldParentId = oldParentId || '';
  $('folder-picker-modal').classList.remove('hidden');
  loadPickerFolders();
}

async function loadPickerFolders() {
  const folderId = pickerStack[pickerStack.length - 1].id;
  try {
    const data = await api(`/api/files?folder_id=${folderId}&page_size=100`);
    if (!data) return;
    const folders = data.files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const grid = $('picker-grid');
    if (!folders.length) {
      grid.innerHTML = '';
      $('picker-empty').classList.remove('hidden');
    } else {
      $('picker-empty').classList.add('hidden');
      grid.innerHTML = folders.map(f => `
        <div class="picker-folder" onclick="navigatePickerFolder('${f.id}','${escapeHtml(f.name).replace(/'/g, "\\'")}')">
          <span>📁 ${escapeHtml(f.name)}</span>
        </div>
      `).join('');
    }
    renderPickerBreadcrumb();
  } catch (e) { toast(e.message, 'error'); }
}

function navigatePickerFolder(id, name) {
  pickerStack.push({ id, name });
  loadPickerFolders();
}

function renderPickerBreadcrumb() {
  $('picker-breadcrumb').innerHTML = pickerStack.map((item, idx) => {
    const isLast = idx === pickerStack.length - 1;
    if (isLast) return `<span class="current">${escapeHtml(item.name)}</span>`;
    return `<a onclick="pickerStack=pickerStack.slice(0,${idx+1});loadPickerFolders()">${escapeHtml(item.name)}</a><span class="sep">/</span>`;
  }).join('');
}

async function confirmFolderPick() {
  const folderId = pickerStack[pickerStack.length - 1].id;
  const fileId = $('picker-confirm-btn').dataset.fileId;
  const oldParentId = $('picker-confirm-btn').dataset.oldParentId;
  const mode = pickerMode;
  closeFolderPicker();
  try {
    if (mode === 'move') {
      await api(`/api/files/${fileId}/move`, {
        method: 'POST',
        body: JSON.stringify({ folder_id: folderId, old_parent_id: oldParentId }),
      });
      toast(`ย้าย "${pickerTargetName}" สำเร็จ`, 'success');
    } else {
      await api(`/api/files/${fileId}/copy`, {
        method: 'POST',
        body: JSON.stringify({ folder_id: folderId }),
      });
      toast(`คัดลอก "${pickerTargetName}" สำเร็จ`, 'success');
    }
    loadFiles();
  } catch (e) { toast(e.message, 'error'); }
}

function closeFolderPicker() { $('folder-picker-modal').classList.add('hidden'); }

// ──── Rendering ────
function renderAll() {
  renderBreadcrumb();
  renderFileGrid();
  loadMoreBtn.classList.toggle('hidden', !state.nextPageToken || state.searching);
  const empty = !state.files.length;
  emptyState.classList.toggle('hidden', !empty);
  fileGrid.classList.toggle('hidden', empty);
}

function renderBreadcrumb() {
  breadcrumb.innerHTML = state.breadcrumb.map((item, idx) => {
    const isLast = idx === state.breadcrumb.length - 1;
    if (isLast) return `<span class="current">${escapeHtml(item.name)}</span>`;
    return `<a onclick="navigateBreadcrumb(${idx})">${escapeHtml(item.name)}</a><span class="sep">/</span>`;
  }).join('');
}

function renderFileGrid() {
  fileGrid.innerHTML = state.files.map(file => renderFileCard(file)).join('');
}

function renderFileCard(file) {
  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
  const icon = getFileIcon(file);
  const size = isFolder ? '—' : formatSize(file.size);
  const date = formatDate(file.modifiedTime);
  const name = escapeHtml(file.name);
  const cls = `file-card${isFolder ? ' folder-card' : ''}`;
  const onclick = isFolder
    ? `navigateToFolder('${file.id}','${escapeHtml(file.name).replace(/'/g, "\\'")}')`
    : `previewFile(${JSON.stringify(file).replace(/'/g, "\\'").replace(/"/g, '&quot;')})`;

  let actions = '';
  if (!isFolder) {
    actions = `
      <button onclick="event.stopPropagation();shareFile('${file.id}','${name.replace(/'/g, "\\'")}')" title="แชร์">🔗</button>
      <button onclick="event.stopPropagation();openFolderPicker('move','${file.id}','${name.replace(/'/g, "\\'")}','${state.currentFolderId}')" title="ย้าย">📂</button>
      <button onclick="event.stopPropagation();openFolderPicker('copy','${file.id}','${name.replace(/'/g, "\\'")}','${state.currentFolderId}')" title="คัดลอก">📋</button>
      <button onclick="event.stopPropagation();downloadFile('${file.id}','${name}')" title="ดาวน์โหลด">⬇</button>
    `;
  }
  actions += `
    <button onclick="event.stopPropagation();showDeleteConfirm({id:'${file.id}',name:'${name}'})" title="ลบ">🗑</button>
  `;

  return `
    <div class="${cls}" data-id="${file.id}" data-mime="${file.mimeType || ''}" onclick="${onclick}">
      <div class="file-icon">${icon}</div>
      <div class="file-name" title="${name}">${name}</div>
      <div class="file-meta">${size} · ${date}</div>
      <div class="file-actions">${actions}</div>
    </div>
  `;
}

function getFileIcon(file) {
  const mime = (file.mimeType || '').toLowerCase();
  const thumb = file.thumbnailLink || file.iconLink;
  if (thumb && mime.startsWith('image/')) return `<img src="${thumb}" alt="">`;
  if (mime === 'application/vnd.google-apps.folder') return '📁';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.includes('pdf')) return '📄';
  if (mime.startsWith('text/')) return '📝';
  if (mime.includes('spreadsheet') || mime.includes('sheet')) return '📊';
  if (mime.includes('presentation') || mime.includes('slide')) return '📽';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar')) return '📦';
  return '📋';
}

// ──── Utility ────
function formatSize(bytes) {
  if (!bytes || bytes === '0') return '0 B';
  const n = parseInt(bytes, 10);
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return parseFloat((n / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('th-TH', opts);
}

function escapeHtml(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function showLoading(show) { loading.classList.toggle('hidden', !show); }

// ──── Toast ────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ──── Drag & Drop ────
let dragCounter = 0;

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('hidden');
});
document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropOverlay.classList.add('hidden');
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.classList.add('hidden');
  const files = e.dataTransfer.files;
  if (files.length) uploadFiles(files);
});

// ──── Keyboard shortcut ────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePreviewModal(); closeShareModal(); closeDeleteModal(); closeNewFolderModal(); closeFolderPicker();
  }
});

// ──── Init ────
document.addEventListener('DOMContentLoaded', init);
