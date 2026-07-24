/* ═══════════════════════════════════════════════════════════════════════
   Google Drive File Manager — Client-Side App
   ═══════════════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────────────
const state = {
  user: null,
  currentFolderId: 'root',
  breadcrumb: [{ id: 'root', name: 'ไฟล์ของฉัน' }],
  files: [],
  nextPageToken: null,
  searching: false,
  showingTrash: false,
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
const fileListHeader = $('file-list-header');

// ──── API helpers ────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (res.status === 401) { showLogin(); return null; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
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
}

// ──── Sidebar navigation ────
function navigateToRoot() {
  state.showingTrash = false;
  state.searching = false;
  state.breadcrumb = [{ id: 'root', name: 'ไฟล์ของฉัน' }];
  state.currentFolderId = 'root';
  $('search-input').value = '';
  $('clear-search').style.display = 'none';
  updateSidebarActive();
  loadFiles();
}

function updateSidebarActive() {
  $('nav-my-drive').classList.toggle('active', !state.showingTrash);
  $('nav-trash').classList.toggle('active', state.showingTrash);
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
  const files = [...fileList];

  const maxBytes = window.MAX_UPLOAD_BYTES || 100 * 1024 * 1024;
  const ok = files.filter(f => f.size <= maxBytes);
  const oversized = files.filter(f => f.size > maxBytes);
  oversized.forEach(f => toast(`"${f.name}" เกินขนาดสูงสุด ${Math.round(maxBytes/1024/1024)}MB`, 'error'));

  if (!ok.length) return;

  const total = ok.length;
  const totalBytes = ok.reduce((s, f) => s + f.size, 0);
  let uploadedBytes = 0;
  let completed = 0;

  uploadProgress.classList.remove('hidden');
  progressFill.style.width = '0%';

  const uploadOne = (file) => new Promise((resolve) => {
    const formData = new FormData();
    formData.append('files', file);
    formData.append('folder_id', state.currentFolderId);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload', true);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = ((uploadedBytes + e.loaded) / totalBytes) * 100;
        progressFill.style.width = `${Math.round(pct)}%`;
      }
    };
    xhr.onload = () => {
      uploadedBytes += file.size;
      completed++;
      if (xhr.status === 401) { window.location.reload(); return; }
      if (xhr.status >= 400) {
        try {
          const d = JSON.parse(xhr.responseText);
          toast(`อัปโหลด ${file.name} ล้มเหลว: ${d.detail || 'Upload failed'}`, 'error');
        } catch (_) { toast(`อัปโหลด ${file.name} ล้มเหลว`, 'error'); }
      }
      resolve();
    };
    xhr.onerror = () => { uploadedBytes += file.size; completed++; toast(`อัปโหลด ${file.name} ล้มเหลว: Network error`, 'error'); resolve(); };
    xhr.send(formData);
    progressText.textContent = `กำลังอัปโหลด (${completed}/${total}): ${file.name}`;
  });

  const concurrency = 3;
  for (let i = 0; i < ok.length; i += concurrency) {
    await Promise.all(ok.slice(i, i + concurrency).map(uploadOne));
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
  $('delete-message').textContent = `ย้าย "${file.name}" ไปที่ถังขยะ?`;
  $('delete-confirm-btn').onclick = confirmDelete;
  $('delete-modal').classList.remove('hidden');
}

async function confirmDelete() {
  if (!deleteTarget) return;
  $('delete-modal').classList.add('hidden');
  try {
    await api(`/api/files/${deleteTarget.id}`, { method: 'DELETE' });
    toast(`ลบ "${deleteTarget.name}" แล้ว`, 'success');
    state.files = state.files.filter(f => f.id !== deleteTarget.id);
    deleteTarget = null;
    renderAll();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function closeDeleteModal() { $('delete-modal').classList.add('hidden'); deleteTarget = null; }

function showPermanentDeleteConfirm(file) {
  deleteTarget = file;
  $('delete-message').textContent = `ลบ "${file.name}" ถาวร? (ไม่สามารถกู้คืนได้)`;
  $('delete-confirm-btn').onclick = confirmPermanentDelete;
  $('delete-modal').classList.remove('hidden');
}

async function confirmPermanentDelete() {
  if (!deleteTarget) return;
  $('delete-modal').classList.add('hidden');
  try {
    await api(`/api/files/${deleteTarget.id}/permanent`, { method: 'DELETE' });
    toast(`ลบ "${deleteTarget.name}" ถาวรแล้ว`, 'success');
    state.files = state.files.filter(f => f.id !== deleteTarget.id);
    deleteTarget = null;
    renderAll();
  } catch (e) { toast(e.message, 'error'); }
}

// ──── Rename ────
let renameTarget = null;

function renameFile(fileId, fileName) {
  renameTarget = { id: fileId, name: fileName };
  $('rename-input').value = fileName;
  $('rename-modal').classList.remove('hidden');
  $('rename-input').focus();
  $('rename-input').select();
}

function closeRenameModal() { $('rename-modal').classList.add('hidden'); renameTarget = null; }

async function confirmRename() {
  if (!renameTarget) return;
  const name = $('rename-input').value.trim();
  if (!name) { toast('กรุณากรอกชื่อ', 'error'); return; }
  if (name === renameTarget.name) { closeRenameModal(); return; }
  closeRenameModal();
  try {
    await api(`/api/files/${renameTarget.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    toast('เปลี่ยนชื่อสำเร็จ', 'success');
    loadFiles();
  } catch (e) { toast(e.message, 'error'); }
}

// ──── Trash ────
async function toggleTrash() {
  state.showingTrash = !state.showingTrash;
  updateSidebarActive();
  if (state.showingTrash) {
    state.breadcrumb = [{ id: 'root', name: 'ถังขยะ' }];
    $('search-input').value = '';
    $('clear-search').style.display = 'none';
    showLoading(true);
    try {
      const data = await api('/api/trash');
      if (!data) return;
      state.files = data.files;
      state.nextPageToken = null;
      renderAll();
    } catch (e) { toast(e.message, 'error'); }
    finally { showLoading(false); }
  } else {
    navigateToRoot();
  }
}

async function restoreFile(fileId) {
  try {
    await api(`/api/files/${fileId}/restore`, { method: 'POST' });
    toast('กู้คืนไฟล์แล้ว', 'success');
    state.files = state.files.filter(f => f.id !== fileId);
    renderAll();
  } catch (e) { toast(e.message, 'error'); }
}

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
  $('share-email-btn').textContent = 'ส่ง';
  $('share-email-btn').disabled = false;
  $('share-modal').classList.remove('hidden');
  $('share-email-input').focus();
}

async function shareToEmail() {
  const email = $('share-email-input').value.trim();
  if (!email && !confirm('ไม่กรอกอีเมล = สร้างลิงก์สาธารณะ\n\nต้องการดำเนินการต่อ?')) return;
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
      $('share-status').textContent = `แชร์ "${shareTargetName}" ให้ ${email} แล้ว`;
    } else {
      $('share-status').textContent = 'สร้างลิงก์สาธารณะแล้ว';
    }
    btn.textContent = 'แชร์ซ้ำ';
    btn.disabled = false;
  } catch (e) {
    toast(e.message, 'error');
    btn.textContent = 'ส่ง';
    btn.disabled = false;
  }
}

function closeShareModal() { $('share-modal').classList.add('hidden'); }

async function copyShareLink() {
  const input = $('share-link-input');
  if (!input.value) return;
  try {
    await navigator.clipboard.writeText(input.value);
    toast('คัดลอกแล้ว', 'success');
  } catch (_) {
    input.select();
    document.execCommand('copy');
    toast('คัดลอกแล้ว', 'success');
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
    toast(`สร้าง "${name}" แล้ว`, 'success');
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
  const name = file.name || '';
  const ext = name.split('.').pop().toLowerCase();
  const url = `/api/files/${file.id}/download`;
  const modal = $('preview-modal');
  const img = $('preview-image');
  const info = $('preview-info');
  const content = modal.querySelector('.preview-content');

  // Clear previous dynamic content
  const existing = content.querySelector('.preview-video, .preview-audio, .preview-text');
  if (existing) existing.remove();

  img.style.display = 'none';
  info.textContent = file.name;

  if (mime.startsWith('image/')) {
    img.src = url;
    img.style.display = 'block';
    modal.classList.remove('hidden');
  } else if (mime.includes('pdf')) {
    window.open(url, '_blank');
  } else if (mime.startsWith('video/') || ['mp4','webm','ogg','mov','avi','mkv'].includes(ext)) {
    const v = document.createElement('video');
    v.className = 'preview-video';
    v.src = url;
    v.controls = true;
    v.autoplay = true;
    content.insertBefore(v, info);
    modal.classList.remove('hidden');
  } else if (mime.startsWith('audio/') || ['mp3','wav','ogg','flac','aac','m4a'].includes(ext)) {
    const a = document.createElement('audio');
    a.className = 'preview-audio';
    a.src = url;
    a.controls = true;
    a.autoplay = true;
    content.insertBefore(a, info);
    content.style.background = '#1a1a2e';
    modal.classList.remove('hidden');
  } else if (mime.startsWith('text/') || ['json','js','ts','py','java','c','cpp','h','css','html','xml','yaml','yml','toml','ini','cfg','conf','md','txt','csv','log','sh','bat','ps1','sql','rb','go','rs','swift','kt','scala','r','mat','m','ipynb'].includes(ext)) {
    fetch(url).then(r => r.text()).then(text => {
      const pre = document.createElement('pre');
      pre.className = 'preview-text';
      pre.textContent = text;
      content.insertBefore(pre, info);
      content.style.background = '#1e293b';
      modal.classList.remove('hidden');
    }).catch(() => toast('ไม่สามารถโหลดไฟล์ได้', 'error'));
  } else if (mime.includes('spreadsheet') || mime.includes('excel') || ['xls','xlsx','csv'].includes(ext)) {
    window.open(`https://docs.google.com/spreadsheets/d/${file.id}/edit`, '_blank');
  } else if (mime.includes('document') || mime.includes('word') || ['doc','docx'].includes(ext)) {
    window.open(`https://docs.google.com/document/d/${file.id}/edit`, '_blank');
  } else if (mime.includes('presentation') || ['ppt','pptx'].includes(ext)) {
    window.open(`https://docs.google.com/presentation/d/${file.id}/edit`, '_blank');
  } else {
    downloadFile(file.id);
    toast('ไฟล์นี้เปิดในตัวดูโดยตรงไม่ได้ กำลังดาวน์โหลด...', 'info');
  }
}

function closePreviewModal() {
  const modal = $('preview-modal');
  const content = modal.querySelector('.preview-content');
  const dynamic = content.querySelector('.preview-video, .preview-audio, .preview-text');
  if (dynamic) dynamic.remove();
  content.style.background = '';
  $('preview-image').src = '';
  $('preview-image').style.display = 'none';
  modal.classList.add('hidden');
}

// ──── Download ────
function downloadFile(fileId) {
  window.open(`/api/files/${fileId}/download`, '_blank');
}

// ──── Move / Copy ────
let pickerMode = 'move';
let pickerTargetId = null;
let pickerTargetName = '';
let pickerStack = [{ id: 'root', name: 'ไฟล์ของฉัน' }];

function openFolderPicker(mode, fileId, fileName, oldParentId) {
  pickerMode = mode;
  pickerTargetId = fileId;
  pickerTargetName = fileName;
  pickerStack = [{ id: oldParentId || 'root', name: '...' }];
  $('picker-title').textContent = mode === 'move' ? `ย้าย "${fileName}"` : `คัดลอก "${fileName}"`;
  $('picker-confirm-btn').textContent = mode === 'move' ? 'ย้าย' : 'คัดลอก';
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
        <div class="picker-folder" onclick="navigatePickerFolder(${ej(f.id)},${ej(f.name)})">
          ${folderSvg()} ${escapeHtml(f.name)}
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
      toast(`ย้าย "${pickerTargetName}" แล้ว`, 'success');
    } else {
      await api(`/api/files/${fileId}/copy`, {
        method: 'POST',
        body: JSON.stringify({ folder_id: folderId }),
      });
      toast(`คัดลอก "${pickerTargetName}" แล้ว`, 'success');
    }
    loadFiles();
  } catch (e) { toast(e.message, 'error'); }
}

function closeFolderPicker() { $('folder-picker-modal').classList.add('hidden'); }

// ──── SVG Icons ────
function folderSvg() {
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>';
}

function getFileIconSvg(file) {
  const mime = (file.mimeType || '').toLowerCase();
  if (mime === 'application/vnd.google-apps.folder') return folderSvg();
  if (mime.startsWith('image/')) return '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ea4335"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
  if (mime.startsWith('video/')) return '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ea4335"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>';
  if (mime.includes('pdf')) return '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ea4335"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>';
  if (mime.startsWith('text/')) return '<svg width="20" height="20" viewBox="0 0 24 24" fill="#4285f4"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
  if (mime.includes('spreadsheet') || mime.includes('sheet')) return '<svg width="20" height="20" viewBox="0 0 24 24" fill="#0f9d58"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 2v3H5V5h14zm-9 5h4v4h-4v-4zM5 10h4v4H5v-4zm0 9v-3h4v3H5zm6 0v-3h4v3h-4zm8 0h-4v-3h4v3zm0-5h-4v-4h4v4z"/></svg>';
  if (mime.includes('presentation') || mime.includes('slide')) return '<svg width="20" height="20" viewBox="0 0 24 24" fill="#f4b400"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 15h10v2H7v-2zm0-4h10v2H7v-2zm0-4h10v2H7V7z"/></svg>';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar')) return '<svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10h-2v-2h2v2zm0-4h-2V8h2v4z"/></svg>';
  if (mime.startsWith('audio/')) return '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ea4335"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>';
}

// ──── Rendering ────
function renderAll() {
  renderBreadcrumb();
  renderFileList();
  const isTrashOrSearch = state.searching || state.showingTrash;
  loadMoreBtn.classList.toggle('hidden', !state.nextPageToken || isTrashOrSearch);
  const empty = !state.files.length;
  emptyState.classList.toggle('hidden', !empty);
  $('file-list').classList.toggle('hidden', empty);
  if (fileListHeader) fileListHeader.classList.toggle('hidden', empty);
}

function renderBreadcrumb() {
  if (state.showingTrash) {
    breadcrumb.innerHTML = '<span class="current">ถังขยะ</span>';
    return;
  }
  breadcrumb.innerHTML = state.breadcrumb.map((item, idx) => {
    const isLast = idx === state.breadcrumb.length - 1;
    if (isLast) return `<span class="current">${escapeHtml(item.name)}</span>`;
    return `<a onclick="navigateBreadcrumb(${idx})">${escapeHtml(item.name)}</a><span class="sep">›</span>`;
  }).join('');
}

function renderFileList() {
  fileGrid.innerHTML = state.files.map(file => renderFileRow(file)).join('');
}

function renderFileRow(file) {
  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
  const icon = getFileIconSvg(file);
  const size = isFolder ? '' : formatSize(file.size);
  const date = formatDate(file.modifiedTime);
  const name = escapeHtml(file.name);
  const fid = ej(file.id);
  const fname = ej(file.name);
  const onclick = isFolder
    ? (state.showingTrash ? '' : `navigateToFolder(${fid},${fname})`)
    : `previewFile(${ej(file)})`;

  const enterKey = isFolder
    ? (state.showingTrash ? '' : `onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();navigateToFolder(${fid},${fname})}"`)
    : `onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();previewFile(${ej(file)})}"`;

  let actions = '';
  if (state.showingTrash) {
    actions = `
      <button aria-label="กู้คืน" onclick="event.stopPropagation();restoreFile(${fid})" title="กู้คืน">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 109-9"/><polyline points="3 3 3 8 8 8"/></svg>
      </button>
      <button aria-label="ลบถาวร" onclick="event.stopPropagation();showPermanentDeleteConfirm(${ej({id:file.id,name:file.name})})" title="ลบถาวร">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      </button>`;
  } else {
    actions = `
      <button aria-label="เพิ่มเติม" onclick="event.stopPropagation();toggleKebab(this)" title="เพิ่มเติม">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
      </button>`;

    const kebabItems = isFolder
      ? `<button onclick="renameFile(${fid},${fname})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          เปลี่ยนชื่อ
        </button>`
      : `<button onclick="renameFile(${fid},${fname})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          เปลี่ยนชื่อ
        </button>
        <button onclick="shareFile(${fid},${fname})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          แชร์
        </button>
        <button onclick="openFolderPicker('move',${fid},${fname},${ej(state.currentFolderId)})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          ย้าย
        </button>
        <button onclick="openFolderPicker('copy',${fid},${fname},${ej(state.currentFolderId)})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          คัดลอก
        </button>
        <button onclick="downloadFile(${fid})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          ดาวน์โหลด
        </button>`;
    actions += `<div class="kebab-menu"><div class="kebab-dropdown">${kebabItems}
      <button onclick="showDeleteConfirm(${ej({id:file.id,name:file.name})})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        ลบ
      </button>
    </div></div>`;
  }

  return `
    <div class="file-row" data-id="${escapeHtml(file.id)}" data-mime="${escapeHtml(file.mimeType || '')}" onclick="${onclick}" tabindex="0" ${enterKey}>
      <div class="file-name-cell">
        <span class="file-icon-cell">${icon}</span>
        <span class="file-name-text" title="${name}">${name}</span>
      </div>
      <span class="file-owner">ฉัน</span>
      <span class="file-date">${date}</span>
      <span class="file-size">${size}</span>
      <div class="file-actions-cell">${actions}</div>
    </div>`;
}

// ──── Kebab ────
function toggleKebab(btn) {
  const dd = btn.closest('.file-actions-cell').querySelector('.kebab-dropdown');
  const wasOpen = dd.classList.contains('open');
  document.querySelectorAll('.kebab-dropdown.open').forEach(d => d.classList.remove('open'));
  if (!wasOpen) dd.classList.add('open');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.kebab-menu')) {
    document.querySelectorAll('.kebab-dropdown.open').forEach(d => d.classList.remove('open'));
  }
});

// ──── Utility ────
function formatSize(bytes) {
  if (!bytes || bytes === '0') return '—';
  const n = parseInt(bytes, 10);
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(k)), sizes.length - 1);
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
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const ej = (v) => escapeHtml(JSON.stringify(v));

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
document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (!e.dataTransfer.types.includes('Files')) return;
  dragCounter++;
  dropOverlay.classList.remove('hidden');
});
document.addEventListener('dragover', (e) => {
  e.preventDefault();
});
document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.add('hidden'); }
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.add('hidden');
  const files = e.dataTransfer.files;
  if (files.length) uploadFiles(files);
});

// ──── Keyboard shortcuts ────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePreviewModal(); closeShareModal(); closeDeleteModal(); closeNewFolderModal(); closeFolderPicker(); closeRenameModal();
    return;
  }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (document.querySelector('.modal:not(.hidden)')) return;
  if (e.key === '/' || (e.ctrlKey && e.key === 'k')) { e.preventDefault(); $('search-input').focus(); }
  else if (e.key === 'n') { showNewFolderModal(); }
  else if (e.key === 'u') { document.getElementById('file-input').click(); }
});

// Focus trap
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const modal = document.querySelector('.modal:not(.hidden)');
  if (!modal) return;
  const focusable = modal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// ──── Init ────
document.addEventListener('DOMContentLoaded', init);
