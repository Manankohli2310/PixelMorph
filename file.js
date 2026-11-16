(() => {
'use strict';

// ===== Config =====
const CONFIG = {
  RESOLUTIONS: { '1080p': [1920, 1080], '720p': [1280, 720], '480p': [854, 480] },
  ICO_SIZES: [16, 32, 48, 64, 128, 256],
  MAX_PIXELS: 16000000,          // iOS Safari canvas limit is ~16.7M
  MAX_FILE_BYTES: 100 * 1024 * 1024,
  ICON_MAX_DIM: 512,
  HIGH_RES: 1000,
  QUALITY: 0.92,
  SVG_FALLBACK: 1024,
  HEIC_URL: 'https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js',
  JSZIP_URL: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
};
const FORMATS = ['avif', 'webp', 'png', 'jpg', 'ico', 'bmp'];
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' };
const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif' };
const ALLOWED_EXT = /\.(jpe?g|png|webp|avif|gif|bmp|ico|tiff?|svg|heic|heif)$/i;

// ===== DOM =====
const $ = (id) => document.getElementById(id);
const dropZone = $('drop-zone'), fileInput = $('fileInput'), controlsCard = $('controls-card');
const fileCountLabel = $('fileCountLabel'), addMoreBtn = $('addMoreBtn'), queueList = $('queueList');
const globalFormatSelect = $('globalFormatSelect'), resolutionSelect = $('resolutionSelect');
const convertButton = $('convertButton'), resetBtn = $('resetBtn'), noticeBox = $('noticeBox');
const loadingOverlay = $('loadingOverlay'), loadingTitle = $('loadingTitle'), loadingText = $('loadingText');
const progressBar = $('progressBar'), cancelBtn = $('cancelBtn');
const thankYouSlide = $('thankYouSlide'), downloadButton = $('downloadButton');
const convertMoreButton = $('convertMoreButton'), successSubtitle = $('successSubtitle');
const resultTitle = $('resultTitle'), successIcon = $('successIcon'), resultNotes = $('resultNotes');
const hamburgerBtn = $('hamburger-btn'), navMenu = $('nav-menu');

// ===== State =====
const state = { queue: [], keys: new Set(), results: [], busy: false, cancelled: false, zipping: false };
let supported = { png: true, jpg: true, bmp: true, ico: true, webp: false, avif: false };

// ===== Helpers =====
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const U = (s) => s.toUpperCase();
const uid = () => Math.random().toString(36).slice(2, 11);
const baseName = (n) => (n.lastIndexOf('.') > 0 ? n.slice(0, n.lastIndexOf('.')) : n);
const fmtBytes = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
const errMsg = (e, fb) => (e && e.message) || fb;

// Yield so the browser can paint; the timeout keeps it working in background tabs.
const yieldToUI = () => new Promise((r) => {
  let done = false;
  const fin = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(fin);
  setTimeout(fin, 50);
});

const scriptCache = new Map();
function loadScript(src) {
  if (!scriptCache.has(src)) {
    scriptCache.set(src, new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => { scriptCache.delete(src); rej(new Error('Could not load a required library (check your connection)')); };
      document.head.appendChild(s);
    }));
  }
  return scriptCache.get(src);
}

function canvasToBlob(canvas, type, q) {
  return new Promise((res, rej) => canvas.toBlob(
    (b) => (b ? res(b) : rej(new Error('Browser could not encode this image (it may be too large)'))), type, q));
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function uniqueName(name, used) {
  let candidate = name, n = 1;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  while (used.has(candidate.toLowerCase())) candidate = `${stem} (${n++})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

// ===== Format support probe =====
async function probeFormats() {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  for (const [k, m] of [['jpg', MIME.jpg], ['webp', MIME.webp], ['avif', MIME.avif]]) {
    try {
      const b = await new Promise((r) => c.toBlob(r, m, 0.8));
      supported[k] = !!b && b.type === m;
    } catch (_) { supported[k] = false; }
  }
  document.querySelectorAll('#globalFormatSelect option').forEach((o) => {
    if (FORMATS.includes(o.value) && !supported[o.value]) {
      o.disabled = true;
      o.textContent += ' — not supported by this browser';
    }
  });
}
const supportReady = probeFormats();

// ===== Themed dropdowns (replace native <select> popups) =====
// The native <select> stays in the DOM (hidden) as the source of truth, so the rest
// of the code keeps using select.value and "change" events unchanged.
let openDropdown = null;
function enhanceSelect(select, opts = {}) {
  const wrap = el('div', 'cs' + (opts.compact ? ' cs-compact' : ''));
  const trigger = el('button', 'cs-trigger');
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const label = el('span', 'cs-label');
  const chevron = el('span', 'cs-chevron');
  chevron.setAttribute('aria-hidden', 'true');
  trigger.append(label, chevron);
  select.parentNode.insertBefore(wrap, select);
  wrap.append(trigger, select);
  select.classList.add('cs-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const lab = select.id && document.querySelector(`label[for="${select.id}"]`);
  if (lab) {
    lab.id = lab.id || select.id + '-label';
    trigger.setAttribute('aria-labelledby', lab.id);
    lab.addEventListener('click', () => trigger.focus());
  } else {
    trigger.setAttribute('aria-label', opts.label || 'Select option');
  }

  const sync = () => {
    const o = select.options[select.selectedIndex];
    label.textContent = o ? o.textContent : '';
  };
  // Keep the visible label in sync when code sets select.value directly
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v); sync(); }
  });
  sync();

  let menu = null, items = [], active = -1;
  const api = { close: () => close(), refresh: sync };

  function onDocDown(e) { if (menu && !menu.contains(e.target) && !trigger.contains(e.target)) close(); }
  function onScroll(e) { if (menu && !menu.contains(e.target)) close(); }

  function position() {
    const r = trigger.getBoundingClientRect();
    menu.style.minWidth = r.width + 'px';
    const wanted = Math.min(menu.scrollHeight, 280);
    const below = window.innerHeight - r.bottom, above = r.top;
    const up = below < wanted + 12 && above > below;
    menu.style.maxHeight = Math.max(100, Math.min(280, (up ? above : below) - 12)) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = up ? '' : r.bottom + 6 + 'px';
    menu.style.bottom = up ? window.innerHeight - r.top + 6 + 'px' : '';
  }

  function setActive(i) {
    active = i;
    items.forEach((it, k) => it.classList.toggle('is-active', k === i));
    if (items[i]) {
      trigger.setAttribute('aria-activedescendant', items[i].id);
      items[i].scrollIntoView({ block: 'nearest' });
    }
  }

  function move(dir) {
    const n = items.length;
    let i = active;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!select.options[i].disabled) { setActive(i); return; }
    }
  }

  function choose(i) {
    const changed = select.selectedIndex !== i;
    select.selectedIndex = i;
    sync();
    close();
    trigger.focus();
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function open() {
    if (select.disabled) return;
    if (openDropdown && openDropdown !== api) openDropdown.close();
    menu = el('div', 'cs-menu');
    menu.id = 'cs-menu-' + uid();
    menu.setAttribute('role', 'listbox');
    trigger.setAttribute('aria-controls', menu.id);
    items = Array.from(select.options).map((o, i) => {
      const it = el('div', 'cs-option');
      it.id = `${menu.id}-${i}`;
      it.setAttribute('role', 'option');
      it.appendChild(el('span', 'cs-option-text', o.textContent));
      if (o.disabled) {
        it.classList.add('is-disabled');
        it.setAttribute('aria-disabled', 'true');
        it.title = 'Not supported by this browser';
      }
      if (i === select.selectedIndex) { it.classList.add('is-selected'); it.setAttribute('aria-selected', 'true'); }
      it.addEventListener('mousemove', () => { if (!o.disabled && active !== i) setActive(i); });
      it.addEventListener('click', (e) => { e.stopPropagation(); if (!o.disabled) choose(i); });
      menu.appendChild(it);
      return it;
    });
    document.body.appendChild(menu);
    position();
    wrap.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    setActive(select.selectedIndex);
    openDropdown = api;
    document.addEventListener('mousedown', onDocDown, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
  }

  function close() {
    if (!menu) return;
    menu.remove();
    menu = null;
    wrap.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    document.removeEventListener('mousedown', onDocDown, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', onScroll, true);
    if (openDropdown === api) openDropdown = null;
  }

  trigger.addEventListener('click', () => (menu ? close() : open()));
  trigger.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });
  trigger.addEventListener('keydown', (e) => {
    const k = e.key;
    if (!menu) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(k)) { e.preventDefault(); open(); }
      return;
    }
    if (k === 'Escape') { e.preventDefault(); close(); }
    else if (k === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (k === 'Home') { e.preventDefault(); active = -1; move(1); }
    else if (k === 'End') { e.preventDefault(); active = 0; move(-1); }
    else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (active >= 0 && !select.options[active].disabled) choose(active);
    } else if (k === 'Tab') close();
  });

  select._dropdown = api;
  return api;
}

// ===== Navigation =====
if (hamburgerBtn && navMenu) {
  const closeMenu = () => { hamburgerBtn.classList.remove('active'); navMenu.classList.remove('active'); };
  hamburgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hamburgerBtn.classList.toggle('active');
    navMenu.classList.toggle('active');
  });
  document.addEventListener('click', (e) => {
    if (!navMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) closeMenu();
  });
  navMenu.querySelectorAll('a').forEach((l) => l.addEventListener('click', closeMenu));
}

// ===== UI state =====
function showLoading(title, text, cancellable) {
  loadingTitle.textContent = title;
  loadingText.textContent = text;
  setProgress(0, 1);
  cancelBtn.classList.toggle('hidden', !cancellable);
  cancelBtn.disabled = false;
  cancelBtn.textContent = 'Cancel';
  loadingOverlay.classList.remove('hidden');
}
const hideLoading = () => loadingOverlay.classList.add('hidden');
function setProgress(done, total) {
  progressBar.style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
}
function showNotices(msgs) {
  noticeBox.replaceChildren();
  if (!msgs.length) { noticeBox.classList.add('hidden'); return; }
  msgs.slice(0, 8).forEach((m) => noticeBox.appendChild(el('div', 'notice-line', m)));
  if (msgs.length > 8) noticeBox.appendChild(el('div', 'notice-line', `…and ${msgs.length - 8} more`));
  noticeBox.classList.remove('hidden');
}
function updateControls() {
  const ready = state.queue.filter((i) => i.status === 'ready').length;
  const failed = state.queue.length - ready;
  convertButton.disabled = state.busy || ready === 0;
  addMoreBtn.disabled = state.busy;
  resetBtn.disabled = state.busy;
  fileCountLabel.textContent = `${state.queue.length} file(s) queued` + (failed ? ` (${failed} unreadable)` : '');
}

// ===== Queue rows (built with textContent, reused between renders) =====
function refreshPill(item) {
  const p = item.el.pill;
  if (item.status === 'failed') {
    p.className = 'queue-error';
    p.textContent = '⚠ ' + item.error;
    return;
  }
  const same = item.format === item.aiFormat;
  p.className = 'ai-recommend-pill' + (same ? '' : ' manual');
  p.textContent = same
    ? `✨ Recommended: ${U(item.format)} (${item.aiReason})`
    : `Manual: ${U(item.format)} (recommended ${U(item.aiFormat)})`;
}

function buildRow(item) {
  const row = el('div', 'queue-item' + (item.status === 'failed' ? ' failed' : ''));
  const wrap = el('div', 'queue-thumb-wrap');
  const img = el('img', 'queue-thumb');
  img.alt = 'Preview';
  img.onerror = () => { img.onerror = null; img.src = 'favicon.ico'; };
  img.src = item.previewUrl || 'favicon.ico';

  const details = el('div', 'queue-details');
  const name = el('span', 'queue-name', item.name);
  name.title = item.name;
  const badges = el('div', 'queue-badges');
  badges.appendChild(el('span', 'badge-tag', item.name.split('.').pop()));
  if (item.isHeic) {
    const h = el('span', 'badge-tag', 'APPLE HEIC');
    h.style.cssText = 'background: rgba(14,165,233,.2); color: #38bdf8;';
    badges.appendChild(h);
  }
  badges.appendChild(el('span', 'badge-tag', fmtBytes(item.size)));
  const pill = el('span');
  details.append(name, badges, pill);
  wrap.append(img, details);

  const controls = el('div', 'queue-controls');
  let select = null;
  if (item.status === 'ready') {
    select = el('select', 'queue-select');
    FORMATS.forEach((f) => {
      const o = el('option', null, U(f));
      o.value = f;
      o.disabled = !supported[f];
      select.appendChild(o);
    });
    select.value = item.format;
    select.addEventListener('change', () => { item.format = select.value; refreshPill(item); });
    controls.appendChild(select);
    enhanceSelect(select, { compact: true, label: `Output format for ${item.name}` });
  }
  const rm = el('button', 'queue-remove-btn', '×');
  rm.title = 'Remove file';
  rm.addEventListener('click', (e) => { e.stopPropagation(); removeItem(item.id); });
  controls.appendChild(rm);

  row.append(wrap, controls);
  item.el = { row, pill, select };
  refreshPill(item);
}

function renderQueue() {
  queueList.replaceChildren(...state.queue.map((i) => i.el.row));
  updateControls();
}

function removeItem(id) {
  if (state.busy) return;
  const idx = state.queue.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const [it] = state.queue.splice(idx, 1);
  if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
  state.keys.delete(it.key);
  if (!state.queue.length) resetState();
  else { it.el.row.remove(); updateControls(); }
}

globalFormatSelect.addEventListener('change', () => {
  const v = globalFormatSelect.value;
  state.queue.forEach((item) => {
    if (item.status !== 'ready') return;
    item.format = v === 'ai' ? item.aiFormat : v;
    if (item.el.select) item.el.select.value = item.format;
    refreshPill(item);
  });
});

// ===== Decoding =====
async function decode(blob) {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch (_) { /* fall back to <img> (SVG, older browsers) */ }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("This browser can't read this image"));
      i.src = url;
    });
    let w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) w = h = CONFIG.SVG_FALLBACK;   // SVG without intrinsic size
    return { source: img, width: w, height: h, close() {} };
  } finally { URL.revokeObjectURL(url); }
}

// ===== Smart recommendation (rule-based) =====
function recommend(name, isHeic, w, h, hasAlpha) {
  if (isHeic) return { format: 'jpg', reason: 'Apple photo, universal compatibility' };
  const square = Math.abs(w / h - 1) <= 0.05;
  const small = Math.max(w, h) <= CONFIG.ICON_MAX_DIM;
  if (square && small && (hasAlpha || /icon|logo|favicon/i.test(name))) {
    return { format: 'ico', reason: 'Small square icon / logo' };
  }
  if (hasAlpha) return { format: supported.webp ? 'webp' : 'png', reason: 'Transparency preserved' };
  if (Math.max(w, h) >= CONFIG.HIGH_RES && supported.avif) return { format: 'avif', reason: 'High-res photo, best compression' };
  return supported.webp ? { format: 'webp', reason: 'Efficient web format' } : { format: 'jpg', reason: 'Universal compatibility' };
}

async function inspect(item) {
  const bmp = await decode(item.blob);
  try {
    let hasAlpha = false;
    if (item.blob.type !== 'image/jpeg') {
      const c = document.createElement('canvas');
      c.width = c.height = 80;
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp.source, 0, 0, 80, 80);
      try {
        const d = ctx.getImageData(0, 0, 80, 80).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] < 240) { hasAlpha = true; break; }
      } catch (_) { hasAlpha = item.blob.type === 'image/png'; }
      c.width = 0;
    }
    return recommend(item.name, item.isHeic, bmp.width, bmp.height, hasAlpha);
  } finally { bmp.close(); }
}

// ===== Incoming files =====
function validateIncoming(file, key) {
  const okType = (file.type && file.type.startsWith('image/')) || ALLOWED_EXT.test(file.name);
  if (!okType) return 'skipped, not an image';
  if (file.size === 0) return 'skipped, file is empty';
  if (file.size > CONFIG.MAX_FILE_BYTES) return `skipped, larger than ${fmtBytes(CONFIG.MAX_FILE_BYTES)}`;
  if (state.keys.has(key)) return 'skipped, already in the queue';
  return null;
}

async function createItem(file, key) {
  const isHeic = /\.(heic|heif)$/i.test(file.name) || /image\/(heic|heif)/.test(file.type);
  const item = {
    id: uid(), key, name: file.name, size: file.size, blob: file, isHeic, previewUrl: '',
    status: 'ready', error: '', format: 'png', aiFormat: 'png', aiReason: ''
  };
  try {
    if (isHeic) {
      try {
        await loadScript(CONFIG.HEIC_URL);
        if (!window.heic2any) throw new Error('HEIC decoder unavailable');
        const res = await window.heic2any({ blob: file, toType: 'image/png' });
        item.blob = Array.isArray(res) ? res[0] : res;
      } catch (e) {
        throw new Error('HEIC: ' + errMsg(e, 'could not decode this file'));
      }
    }
    item.previewUrl = URL.createObjectURL(item.blob);
    const rec = await inspect(item);
    item.aiFormat = rec.format;
    item.aiReason = rec.reason;
    item.format = globalFormatSelect.value === 'ai' ? rec.format : globalFormatSelect.value;
  } catch (e) {
    item.status = 'failed';
    item.error = errMsg(e, "Can't read this image");
  }
  buildRow(item);
  return item;
}

async function handleIncomingFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length || state.busy) return;
  state.busy = true;
  updateControls();
  showLoading('Processing Files...', 'Analyzing images…', false);
  const msgs = [];
  try {
    await supportReady;
    for (let n = 0; n < files.length; n++) {
      const file = files[n];
      setProgress(n, files.length);
      loadingText.textContent = `Reading ${n + 1} of ${files.length}: ${file.name}`;
      await yieldToUI();
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      const problem = validateIncoming(file, key);
      if (problem) { msgs.push(`${file.name}: ${problem}`); continue; }
      state.keys.add(key);
      const item = await createItem(file, key);
      if (/\.gif$/i.test(file.name) || file.type === 'image/gif') msgs.push(`${file.name}: only the first frame of an animated GIF is converted`);
      if (item.status === 'failed') msgs.push(`${file.name}: ${item.error}`);
      state.queue.push(item);
    }
  } finally {
    state.busy = false;
    hideLoading();
  }
  showNotices(msgs);
  if (state.queue.length) {
    renderQueue();
    dropZone.style.display = 'none';
    controlsCard.style.display = 'block';
  }
  updateControls();
}

// ===== Encoders =====
function encodeBmp(canvas) {                       // 24-bit uncompressed BMP
  const w = canvas.width, h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const rowSize = Math.ceil((w * 3) / 4) * 4, imgSize = rowSize * h;
  const buf = new ArrayBuffer(54 + imgSize), dv = new DataView(buf), px = new Uint8Array(buf);
  px[0] = 0x42; px[1] = 0x4d;
  dv.setUint32(2, 54 + imgSize, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, imgSize, true);
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    let s = (h - 1 - y) * w * 4, d = 54 + y * rowSize;
    for (let x = 0; x < w; x++) { px[d++] = data[s + 2]; px[d++] = data[s + 1]; px[d++] = data[s]; s += 4; }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

async function encodeIco(bmp) {                    // multi-size ICO, PNG-compressed entries, letterboxed
  const maxDim = Math.max(bmp.width, bmp.height);
  let sizes = CONFIG.ICO_SIZES.filter((s) => s <= maxDim);
  if (sizes.length < 2) sizes = [16, 32];
  const pngs = [];
  for (const s of sizes) {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const k = Math.min(s / bmp.width, s / bmp.height);
    const dw = Math.max(1, Math.round(bmp.width * k)), dh = Math.max(1, Math.round(bmp.height * k));
    ctx.drawImage(bmp.source, (s - dw) / 2, (s - dh) / 2, dw, dh);
    const b = await canvasToBlob(c, 'image/png');
    pngs.push(new Uint8Array(await b.arrayBuffer()));
    c.width = 0;
  }
  const headLen = 6 + 16 * sizes.length;
  const total = pngs.reduce((a, p) => a + p.length, headLen);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint16(2, 1, true);
  dv.setUint16(4, sizes.length, true);
  let off = headLen;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    dv.setUint8(e, s >= 256 ? 0 : s);
    dv.setUint8(e + 1, s >= 256 ? 0 : s);
    dv.setUint16(e + 4, 1, true);
    dv.setUint16(e + 6, 32, true);
    dv.setUint32(e + 8, pngs[i].length, true);
    dv.setUint32(e + 12, off, true);
    out.set(pngs[i], off);
    off += pngs[i].length;
  });
  return new Blob([out], { type: 'image/x-icon' });
}

// ===== Conversion =====
function targetSize(w, h, mode) {
  let tw = w, th = h, note = '';
  const r = CONFIG.RESOLUTIONS[mode];
  if (r) { const s = Math.min(r[0] / w, r[1] / h, 1); tw = Math.round(w * s); th = Math.round(h * s); }
  if (tw * th > CONFIG.MAX_PIXELS) {
    const s = Math.sqrt(CONFIG.MAX_PIXELS / (tw * th));
    tw = Math.floor(tw * s); th = Math.floor(th * s);
    note = 'downscaled to fit browser canvas limits';
  }
  return { tw: Math.max(1, tw), th: Math.max(1, th), note };
}

async function convertItem(item, mode) {
  const bmp = await decode(item.blob);
  try {
    if (item.format === 'ico') {
      return { blob: await encodeIco(bmp), ext: 'ico', note: mode !== 'original' ? 'ICO ignores the resolution setting' : '' };
    }
    const { tw, th, note } = targetSize(bmp.width, bmp.height, mode);
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image too large for this browser');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (item.format === 'jpg' || item.format === 'bmp') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th); }
    ctx.drawImage(bmp.source, 0, 0, tw, th);
    try {
      if (item.format === 'bmp') return { blob: encodeBmp(canvas), ext: 'bmp', note };
      const blob = await canvasToBlob(canvas, MIME[item.format], CONFIG.QUALITY);
      const ext = EXT_BY_MIME[blob.type] || 'png';
      const notes = [note];
      if (ext !== item.format) notes.push(`${U(item.format)} unavailable, saved as ${U(ext)}`);
      return { blob, ext, note: notes.filter(Boolean).join('; ') };
    } finally { canvas.width = canvas.height = 0; }
  } finally { bmp.close(); }
}

async function runConversion() {
  if (state.busy) return;
  const ready = state.queue.filter((i) => i.status === 'ready');
  if (!ready.length) return;
  state.busy = true;
  state.cancelled = false;
  updateControls();
  showLoading('Converting Images...', '', true);
  const mode = resolutionSelect.value;
  const used = new Set(), results = [], failures = [], notes = [];
  try {
    for (let i = 0; i < ready.length; i++) {
      if (state.cancelled) break;
      const item = ready[i];
      setProgress(i, ready.length);
      loadingText.textContent = `Converting ${i + 1} of ${ready.length}: ${item.name} ➔ ${U(item.format)}...`;
      await yieldToUI();
      try {
        const r = await convertItem(item, mode);
        results.push({ name: uniqueName(`${baseName(item.name)}.${r.ext}`, used), blob: r.blob });
        if (r.note) notes.push(`${item.name}: ${r.note}`);
      } catch (e) {
        failures.push(`${item.name}: ${errMsg(e, 'conversion failed')}`);
      }
    }
  } finally {
    state.busy = false;
    hideLoading();
  }
  if (state.cancelled) { showNotices(['Conversion cancelled.']); updateControls(); return; }
  state.results = results;
  showResult(results, failures, notes);
  updateControls();
}

function showResult(results, failures, notes) {
  const unreadable = state.queue.filter((i) => i.status === 'failed').length;
  const failTotal = failures.length + unreadable;
  const parts = [];
  if (results.length) parts.push(`${results.length} converted`);
  if (failTotal) parts.push(`${failTotal} failed`);
  successSubtitle.textContent = parts.join(', ') + '.';
  resultTitle.textContent = results.length ? 'Conversion Successful!' : 'Conversion Failed';
  successIcon.textContent = results.length ? '✓' : '!';
  resultNotes.replaceChildren(...[...failures, ...notes].slice(0, 10).map((t) => el('li', null, t)));
  resultNotes.classList.toggle('hidden', !resultNotes.children.length);
  downloadButton.classList.toggle('hidden', !results.length);
  downloadButton.disabled = false;
  downloadButton.textContent = results.length === 1 ? `Download ${results[0].name}` : 'Download All as ZIP';
  thankYouSlide.classList.remove('hidden');
}

async function handleDownload() {
  const results = state.results;
  if (!results.length || state.zipping) return;
  if (results.length === 1) { saveBlob(results[0].blob, results[0].name); return; }
  state.zipping = true;
  downloadButton.disabled = true;
  const label = downloadButton.textContent;
  try {
    await loadScript(CONFIG.JSZIP_URL);
    const zip = new window.JSZip();
    results.forEach((r) => zip.file(r.name, r.blob));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (m) => {
      downloadButton.textContent = `Zipping… ${Math.round(m.percent)}%`;
    });
    saveBlob(blob, 'pixelmorph-converted-images.zip');
  } catch (e) {
    alert('Could not create the ZIP: ' + errMsg(e, 'unknown error'));
  } finally {
    state.zipping = false;
    downloadButton.disabled = false;
    downloadButton.textContent = label;
  }
}

// ===== Reset =====
function resetState() {
  state.queue.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
  state.queue = [];
  state.keys.clear();
  state.results = [];
  fileInput.value = '';
  queueList.replaceChildren();
  showNotices([]);
  controlsCard.style.display = 'none';
  dropZone.style.display = 'block';
  updateControls();
}

// ===== Events =====
dropZone.addEventListener('click', () => { if (!state.busy) fileInput.click(); });
addMoreBtn.addEventListener('click', () => { if (!state.busy) fileInput.click(); });

['dragenter', 'dragover'].forEach((n) => dropZone.addEventListener(n, (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#10b981';
  dropZone.style.background = 'rgba(16, 185, 129, 0.08)';
}));
['dragleave', 'drop'].forEach((n) => dropZone.addEventListener(n, (e) => {
  e.preventDefault();
  dropZone.style.borderColor = 'rgba(16, 185, 129, 0.24)';
  dropZone.style.background = 'var(--card-bg)';
}));
dropZone.addEventListener('drop', (e) => handleIncomingFiles(e.dataTransfer.files));
controlsCard.addEventListener('drop', (e) => handleIncomingFiles(e.dataTransfer.files));

// Stop the browser from navigating away (and losing the queue) on stray drops
['dragover', 'drop'].forEach((n) => window.addEventListener(n, (e) => e.preventDefault()));

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []);
  fileInput.value = '';                            // lets the same file be picked again
  handleIncomingFiles(files);
});

convertButton.addEventListener('click', runConversion);
cancelBtn.addEventListener('click', () => {
  state.cancelled = true;
  cancelBtn.disabled = true;
  cancelBtn.textContent = 'Cancelling…';
});
downloadButton.addEventListener('click', handleDownload);
resetBtn.addEventListener('click', () => { if (!state.busy) resetState(); });
convertMoreButton.addEventListener('click', () => { thankYouSlide.classList.add('hidden'); resetState(); });

enhanceSelect(globalFormatSelect);
enhanceSelect(resolutionSelect);
updateControls();
})();