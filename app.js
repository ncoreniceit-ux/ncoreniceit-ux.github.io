'use strict';

// ══════════════════════════════════════════════
//  LitRead – app.js  |  Main Application Logic
// ══════════════════════════════════════════════

// ─── PDF.js Setup ────────────────────────────────────────────
const PDFJS_VER = '3.11.174';
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`;

// ─── Storage Keys ────────────────────────────────────────────
const SK = {
  POS:     name => `lr_pos_${name}`,
  NOTES:   name => `lr_notes_${name}`,
  KPI:     'lr_kpi_config',
  LOG:     'lr_reading_log',
  REMIND:  'lr_reminder',
};

// ─── App State ───────────────────────────────────────────────
let pdfDoc      = null;
let curPage     = 1;
let totPages    = 0;
let curScale    = 1.3;
let curFile     = '';
let isRendering = false;
let prevPage    = null;
let swReg       = null;
let selNoteColor = 'yellow';
let transMode   = 'click';    // 'click' | 'parallel'
let viewMode    = 'both';     // 'pdf' | 'both' | 'vi'
let curPageObj  = null;       // keep reference for re-translate on mode switch
let curVP       = null;

// ─── Utilities ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const todayStr = () => new Date().toISOString().slice(0, 10);

function showToast(msg, ms = 3000) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

// ─────────────────────────────────────────────
//  FILE UPLOAD
// ─────────────────────────────────────────────
async function loadPDF(file) {
  if (!file || file.type !== 'application/pdf') {
    showToast('⚠️ Vui lòng chọn file PDF hợp lệ'); return;
  }
  curFile = file.name;
  document.title = `${file.name} – LitRead`;

  const buf = await file.arrayBuffer();
  const arr = new Uint8Array(buf);

  try {
    pdfDoc   = await pdfjsLib.getDocument({ data: arr }).promise;
    totPages = pdfDoc.numPages;
  } catch {
    showToast('❌ Không thể đọc file PDF này'); return;
  }

  // Show reader UI
  $('upload-placeholder').classList.add('hidden');
  $('pdf-pages-container').classList.remove('hidden');
  $('footer').classList.remove('hidden');
  $('sidebar').classList.add('visible');

  // Restore or start from page 1
  const saved = getPosition(curFile) || 1;
  prevPage = null;

  // Render continuous layout wrappers
  const container = $('pdf-pages-container');
  container.innerHTML = '';
  
  const p1 = await pdfDoc.getPage(1);
  const vp1 = p1.getViewport({ scale: curScale });
  
  for (let i = 1; i <= totPages; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'pdf-page-wrapper';
    wrap.id = `page-wrap-${i}`;
    wrap.dataset.page = i;
    wrap.style.width = vp1.width + 'px';
    wrap.style.height = vp1.height + 'px';
    
    const canvas = document.createElement('canvas');
    canvas.id = `canvas-${i}`;
    wrap.appendChild(canvas);

    const tl = document.createElement('div');
    tl.className = 'text-layer';
    tl.id = `text-layer-${i}`;
    wrap.appendChild(tl);

    container.appendChild(wrap);
  }

  renderedPages.clear();
  setupPageObserver();

  curPage = saved;
  updateActiveThumbnail(curPage);
  $('page-info').textContent = `Trang ${curPage} / ${totPages}`;
  
  buildThumbnails();
  updateNotesBadge();
  if (saved > 1) {
    showToast(`📌 Tiếp tục từ trang ${saved}`);
    setTimeout(() => scrollToPage(saved), 100);
  } else {
    $('reader').scrollTo(0,0);
  }
}

// ─────────────────────────────────────────────
//  CONTINUOUS RENDERING
// ─────────────────────────────────────────────
const renderedPages = new Set();
let pageObserver = null;
let curPageObserver = null;
let scrollTimeout = null;

function setupPageObserver() {
  if (pageObserver) pageObserver.disconnect();
  if (curPageObserver) curPageObserver.disconnect();

  pageObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) renderPage(parseInt(e.target.dataset.page));
    });
  }, { root: $('reader'), rootMargin: '800px 0px' });

  curPageObserver = new IntersectionObserver(entries => {
    let maxRatio = 0, maxPage = curPage;
    entries.forEach(e => {
      if (e.isIntersecting && e.intersectionRatio > maxRatio) {
        maxRatio = e.intersectionRatio;
        maxPage = parseInt(e.target.dataset.page);
      }
    });
    if (maxPage !== curPage && maxRatio > 0.1) {
      curPage = maxPage;
      $('page-info').textContent = `Trang ${maxPage} / ${totPages}`;
      savePosition(maxPage);
      trackPageRead(maxPage);
      updateActiveThumbnail(maxPage);
      
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(async () => {
        try {
          curPageObj = await pdfDoc.getPage(maxPage);
          curVP = curPageObj.getViewport({ scale: curScale });
          if (transMode === 'parallel') translatePageParallel(curPageObj, curVP);
        } catch(e) {}
      }, 300);
    }
  }, { root: $('reader'), threshold: [0.1, 0.3, 0.5, 0.7, 0.9] });

  document.querySelectorAll('.pdf-page-wrapper').forEach(w => {
    pageObserver.observe(w);
    curPageObserver.observe(w);
  });
}

async function renderPage(n) {
  if (!pdfDoc || n < 1 || n > totPages || renderedPages.has(n)) return;
  renderedPages.add(n);

  const wrap = $(`page-wrap-${n}`);
  if (!wrap) return;

  try {
    const page = await pdfDoc.getPage(n);
    const vp   = page.getViewport({ scale: curScale });

    wrap.style.width  = vp.width  + 'px';
    wrap.style.height = vp.height + 'px';

    const dpr = window.devicePixelRatio || 1;
    const canvas = $(`canvas-${n}`);
    const ctx = canvas.getContext('2d');
    canvas.width  = Math.floor(vp.width  * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width  = vp.width  + 'px';
    canvas.style.height = vp.height + 'px';
    ctx.scale(dpr, dpr);
    
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    const tl = $(`text-layer-${n}`);
    tl.innerHTML = '';
    tl.style.width  = vp.width  + 'px';
    tl.style.height = vp.height + 'px';

    if (transMode === 'click') {
      buildClickOverlay(page, tl, vp);
    }
    
    // Fallback sync initial page context
    if (n === curPage && !curPageObj) {
      curPageObj = page;
      curVP = vp;
      if (transMode === 'parallel') translatePageParallel(page, vp);
    }
  } catch (e) { console.error('Render page', n, e); }
}

function scrollToPage(n) {
  if (n < 1 || n > totPages) return;
  const wrap = $(`page-wrap-${n}`);
  if (wrap) wrap.scrollIntoView({ behavior: 'smooth' });
}

// ── Click overlay: paragraph detection from getTextContent ──────
function composeTx([a1,b1,c1,d1,e1,f1], [a2,b2,c2,d2,e2,f2]) {
  return [a1*a2+c1*b2, b1*a2+d1*b2, a1*c2+c1*d2, b1*c2+d1*d2,
          a1*e2+c1*f2+e1, b1*e2+d1*f2+f1];
}

// Shared: extract paragraph objects from a PDF page
async function extractParas(page, vp) {
  const tc = await page.getTextContent();
  const mapped = tc.items
    .filter(i => i.str && i.str.length > 0) // kept spaces, removed trim()
    .map(item => {
      const t  = composeTx(vp.transform, item.transform);
      const fz = Math.max(4, Math.hypot(t[0], t[1]));
      const w  = item.width > 0
        ? item.width * Math.abs(vp.transform[0])
        : item.str.length * fz * 0.55;
      return { str: item.str, x: t[4], y: t[5] - fz, w, h: fz };
    })
    .filter(i => i.x > -40 && i.y > -40 && i.x < vp.width + 40);

  if (!mapped.length) return [];
  mapped.sort((a, b) => a.y - b.y || a.x - b.x);

  const lines = [];
  mapped.forEach(item => {
    const last = lines[lines.length - 1];
    if (!last || Math.abs(item.y - last.y) > last.h * 0.75) {
      lines.push({ y: item.y, h: item.h, items: [item] });
    } else {
      if (item.h > last.h) last.h = item.h;
      last.items.push(item);
    }
  });

  const paras = [];
  let para = null;
  lines.forEach(line => {
    // Reconstruct line text properly with spacing heuristic
    let lText = '';
    for (let i = 0; i < line.items.length; i++) {
      const item = line.items[i];
      lText += item.str;
      if (i < line.items.length - 1) {
        const next = line.items[i + 1];
        const gap = next.x - (item.x + item.w);
        if (gap > item.h * 0.25 && !lText.endsWith(' ') && !next.str.startsWith(' ')) {
          lText += ' ';
        }
      }
    }
    line.text = lText.trim();

    const lastLine = para ? para.lines[para.lines.length - 1] : null;
    // Standard line height is ~1.2. A gap > 0.4 from bottom of last line is a paragraph break.
    const gap = lastLine ? line.y - (lastLine.y + lastLine.h) : Infinity;
    
    if (!para || gap > line.h * 0.4) {
      para = { lines: [line], y: line.y, h: line.h };
      paras.push(para);
    } else {
      para.lines.push(line);
      para.h = (line.y + line.h) - para.y;
    }
  });

  // Consolidate full text for each paragraph
  paras.forEach(p => {
    p.text = p.lines.map(l => l.text).join(' ').replace(/\s+/g, ' ');
  });

  return paras;
}

async function buildClickOverlay(page, container, vp) {
  try {
    const paras = await extractParas(page, vp);
    paras.forEach(p => {
      const text = p.text;
      if (!text || text.length < 2) return;
      const all = p.lines.flatMap(l => l.items);
      const x1  = Math.max(0, Math.min(...all.map(i => i.x)));
      const x2  = Math.min(vp.width, Math.max(...all.map(i => i.x + i.w)));
      const y1  = Math.max(0, p.y);
      const y2  = Math.min(vp.height, p.y + p.h + 4);
      if (x2 - x1 < 4 || y2 - y1 < 4) return;
      const div = document.createElement('div');
      div.className = 'click-block';
      div.title = 'Nhấp để dịch';
      div.style.cssText = `left:${x1}px;top:${y1}px;width:${x2-x1}px;height:${y2-y1}px`;
      div.dataset.text = text;
      container.appendChild(div);
    });
  } catch (e) { console.warn('buildClickOverlay failed:', e); }
}

// ── Robust Translation Helper for Long Texts ────────────────
async function safeTranslate(text) {
  if (!text || text.length < 2) return text;

  const doGTXFetch = async (txt) => {
    const q = encodeURIComponent(txt);
    const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${q}`);
    const d = await r.json();
    return d[0].map(item => item[0]).join('');
  };

  if (text.length <= 450) {
    try {
      const tr = await doGTXFetch(text);
      return tr || text;
    } catch { return text; }
  }

  // Split by sentences if too long
  const chunks = [];
  let cur = '';
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  
  for (const s of sentences) {
    if (cur.length + s.length > 450) {
      if (cur) chunks.push(cur.trim());
      cur = s.length > 450 ? s.slice(0, 450) : s;
    } else {
      cur += s;
    }
  }
  if (cur) chunks.push(cur.trim());

  // Translate chunks sequentially to avoid rate limits
  let res = [];
  for (const c of chunks) {
    try {
      const tr = await doGTXFetch(c);
      res.push(tr || c);
    } catch { res.push(c); }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return res.join(' ');
}

// ── Parallel translation ───────────────────────────────
async function translatePageParallel(page, vp) {
  const panel = $('trans-panel');
  const body  = $('tp-content');
  const status = $('tp-status');

  applyViewMode(viewMode);
  $('tp-page-num').textContent = curPage;
  body.innerHTML = '<div class="tp-full-loading">⏳ Đang phân tích trang...</div>';
  status.textContent = '';

  let paras;
  try { paras = await extractParas(page, vp); } catch { body.innerHTML = '<div class="tp-full-loading">⚠️ Không thể đọc nội dung trang</div>'; return; }

  const texts = paras.map(p => p.text).filter(t => t.length >= 3);

  if (!texts.length) { body.innerHTML = '<div class="tp-full-loading">📋 Trang này không có văn bản</div>'; return; }

  body.innerHTML = '';
  const els = texts.map(() => {
    const d = document.createElement('div');
    d.className = 'tp-para loading';
    d.textContent = 'Đang dịch...';
    body.appendChild(d);
    return d;
  });

  status.textContent = `0 / ${texts.length}`;
  let done = 0;

  // Translate paragraphs in batches
  const BATCH = 2;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const elSlice = els.slice(i, i + BATCH);
    await Promise.all(slice.map(async (txt, j) => {
      const tr = await safeTranslate(txt);
      elSlice[j].textContent = tr && tr !== txt ? tr : txt;
      elSlice[j].classList.remove('loading');
      status.textContent = `${++done} / ${texts.length}`;
    }));
    if (i + BATCH < texts.length) await new Promise(r => setTimeout(r, 400));
  }
  status.textContent = '✅ Hoàn tất';
  setTimeout(() => { status.textContent = ''; }, 2000);
}

function applyViewMode(mode) {
  viewMode = mode;
  const cw = $('pdf-pages-container');
  const tp = $('trans-panel');
  // Sync vs-btn active state
  document.querySelectorAll('.vs-btn').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
  if (mode === 'pdf')  { cw.classList.remove('hidden'); tp.classList.add('hidden'); }
  if (mode === 'vi')   { cw.classList.add('hidden');    tp.classList.remove('hidden'); }
  if (mode === 'both') { cw.classList.remove('hidden'); tp.classList.remove('hidden'); }
  // Reader alignment
  $('reader').style.justifyContent = (mode === 'vi' || transMode === 'parallel') ? 'flex-start' : 'center';
}

// ─────────────────────────────────────────────
//  THUMBNAILS
// ─────────────────────────────────────────────
function buildThumbnails() {
  const list = $('thumb-list');
  list.innerHTML = '';
  for (let i = 1; i <= totPages; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'thumb-item';
    wrap.dataset.page = i;

    const canvas  = document.createElement('canvas');
    const label   = document.createElement('div');
    label.className = 'thumb-label';
    label.textContent = `Trang ${i}`;

    wrap.appendChild(canvas);
    wrap.appendChild(label);
    wrap.addEventListener('click', () => renderPage(i));
    list.appendChild(wrap);
  }

  // Intersection Observer for lazy render
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting && !e.target._rendered) {
        e.target._rendered = true;
        renderThumb(e.target, parseInt(e.target.dataset.page));
      }
    });
  }, { root: $('sidebar'), threshold: 0.1 });

  list.querySelectorAll('.thumb-item').forEach(el => obs.observe(el));
}

async function renderThumb(wrap, n) {
  try {
    const page = await pdfDoc.getPage(n);
    const vp   = page.getViewport({ scale: 0.18 });
    const c    = wrap.querySelector('canvas');
    c.width  = vp.width;
    c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    addNoteBadge(wrap, n);
  } catch {}
}

function addNoteBadge(wrap, n) {
  const notes = getNotes().filter(note => note.page === n);
  wrap.querySelector('.thumb-note-badge')?.remove();
  if (notes.length) {
    const badge = document.createElement('div');
    badge.className = 'thumb-note-badge';
    badge.textContent = notes.length;
    wrap.appendChild(badge);
  }
}

function updateActiveThumbnail(n) {
  document.querySelectorAll('.thumb-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.page) === n);
  });
  const active = $('thumb-list').querySelector('.thumb-item.active');
  active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ─────────────────────────────────────────────
//  TRANSLATION  (click-based, no text selection needed)
// ─────────────────────────────────────────────
function initTranslation() {
  $('pdf-pages-container').addEventListener('click', e => {
    const block = e.target.closest('.click-block');
    if (!block) return;
    // Highlight active block
    document.querySelectorAll('.click-block.active').forEach(b => b.classList.remove('active'));
    block.classList.add('active');
    const text = block.dataset.text;
    const rect = block.getBoundingClientRect();
    showTransPopup(text, rect);
    doTranslate(text);
  });
}

function showTransPopup(text, rect) {
  const pop = $('trans-popup');
  $('tp-original').textContent = text;
  $('tp-result').innerHTML = '<span class="tp-loading">⏳ Đang dịch...</span>';
  pop.classList.remove('hidden');

  // Position below selection, keep in viewport
  const popH = 170, popW = 320;
  let top  = rect.bottom + window.scrollY + 8;
  let left = Math.min(rect.left + window.scrollX, window.innerWidth - popW - 16);
  if (top + popH > window.innerHeight) top = rect.top + window.scrollY - popH - 8;
  pop.style.top  = Math.max(8, top) + 'px';
  pop.style.left = Math.max(8, left) + 'px';
  pop.style.bottom = 'auto';
  pop.style.right  = 'auto';
}

async function doTranslate(text) {
  try {
    const tr = await safeTranslate(text);
    $('tp-result').textContent = tr || '(Không thể dịch)';
  } catch {
    $('tp-result').textContent = '⚠️ Lỗi kết nối. Kiểm tra internet.';
  }
}

// ─────────────────────────────────────────────
//  READING POSITION
// ─────────────────────────────────────────────
function savePosition(n) {
  if (!curFile) return;
  localStorage.setItem(SK.POS(curFile), JSON.stringify({ page: n, ts: Date.now() }));
}

function getPosition(name) {
  try {
    const d = JSON.parse(localStorage.getItem(SK.POS(name)));
    return d?.page || null;
  } catch { return null; }
}

// ─────────────────────────────────────────────
//  NOTES
// ─────────────────────────────────────────────
function getNotes() {
  if (!curFile) return [];
  try { return JSON.parse(localStorage.getItem(SK.NOTES(curFile))) || []; }
  catch { return []; }
}

function saveNotes(arr) {
  localStorage.setItem(SK.NOTES(curFile), JSON.stringify(arr));
}

function addNote(page, text, color) {
  const notes = getNotes();
  notes.unshift({ id: Date.now(), page, text, color, ts: new Date().toISOString() });
  saveNotes(notes);
  updateNotesBadge();
  return notes;
}

function deleteNote(id) {
  saveNotes(getNotes().filter(n => n.id !== id));
  updateNotesBadge();
}

function updateNotesBadge() {
  const n = getNotes().length;
  const badge = $('notes-badge');
  badge.textContent = n;
  badge.classList.toggle('hidden', n === 0);

  // Refresh thumb badges
  document.querySelectorAll('.thumb-item').forEach(wrap => {
    addNoteBadge(wrap, parseInt(wrap.dataset.page));
  });
}

function renderNotesPanel() {
  const notes  = getNotes();
  const filter = $('notes-filter').value;
  const shown  = filter === 'all' ? notes : notes.filter(n => String(n.page) === filter);

  // Rebuild filter options
  const pages = [...new Set(notes.map(n => n.page))].sort((a, b) => a - b);
  const old   = $('notes-filter').value;
  $('notes-filter').innerHTML = '<option value="all">Tất cả trang</option>' +
    pages.map(p => `<option value="${p}">Trang ${p}</option>`).join('');
  $('notes-filter').value = old;

  const list = $('notes-list');
  if (!shown.length) {
    list.innerHTML = '<div class="empty-state">📝 Chưa có ghi chú nào</div>';
    return;
  }
  list.innerHTML = shown.map(n => `
    <div class="note-card ${n.color}" data-id="${n.id}">
      <div class="note-meta">
        <span class="note-page-badge">Trang ${n.page}</span>
        <span class="note-date">${fmtDate(n.ts)}</span>
      </div>
      <div class="note-text">${escHtml(n.text)}</div>
      <div class="note-actions">
        <button class="note-del-btn" data-id="${n.id}">🗑 Xoá</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.note-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = parseInt(e.currentTarget.dataset.id);
      deleteNote(id);
      renderNotesPanel();
    });
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─────────────────────────────────────────────
//  KPI / READING LOG
// ─────────────────────────────────────────────
function getKPI() {
  try { return JSON.parse(localStorage.getItem(SK.KPI)) || { daily: 20, weekly: 100 }; }
  catch { return { daily: 20, weekly: 100 }; }
}

function saveKPI(cfg) { localStorage.setItem(SK.KPI, JSON.stringify(cfg)); }

function getLog() {
  try { return JSON.parse(localStorage.getItem(SK.LOG)) || {}; }
  catch { return {}; }
}

function saveLog(log) { localStorage.setItem(SK.LOG, JSON.stringify(log)); }

function trackPageRead(n) {
  if (prevPage !== null && prevPage !== n) {
    const log = getLog();
    const d   = todayStr();
    log[d] = (log[d] || 0) + 1;
    saveLog(log);
  }
  prevPage = n;
}

function getWeekDates() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function calcStreak() {
  const log = getLog();
  const cfg = getKPI();
  let streak = 0, d = new Date();
  for (let i = 0; i < 365; i++) {
    const key = d.toISOString().slice(0, 10);
    if ((log[key] || 0) >= cfg.daily) streak++;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function renderKPIPanel() {
  const log   = getLog();
  const cfg   = getKPI();
  const week  = getWeekDates();
  const today = todayStr();

  const todayCount  = log[today]  || 0;
  const weekCount   = week.reduce((s, d) => s + (log[d] || 0), 0);
  const streak      = calcStreak();

  const dailyPct   = Math.min(100, Math.round(todayCount  / cfg.daily   * 100));
  const weeklyPct  = Math.min(100, Math.round(weekCount   / cfg.weekly  * 100));
  const circumf    = 2 * Math.PI * 45;
  const ringOffset = circumf * (1 - dailyPct / 100);

  const dayNames = ['CN','T2','T3','T4','T5','T6','T7'];
  const maxBar   = Math.max(...week.map(d => log[d] || 0), cfg.daily, 1);

  const bars = week.map(d => {
    const v    = log[d] || 0;
    const h    = Math.round((v / maxBar) * 100);
    const isT  = d === today;
    const meta = new Date(d);
    const name = isT ? 'Hôm nay' : dayNames[meta.getDay()];
    const cls  = isT ? 'today' : (v >= cfg.daily ? 'goal-met' : '');
    return `<div class="kpi-bar-wrap">
      <div class="kpi-bar ${cls}" style="height:${h}%" title="${v} trang"></div>
      <span class="kpi-bar-label">${name}</span>
    </div>`;
  }).join('');

  $('kpi-body').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-card-title">Hôm nay</div>
      <div class="kpi-today-row">
        <div class="kpi-ring-wrap">
          <svg class="kpi-ring" width="100" height="100" viewBox="0 0 100 100">
            <circle class="kpi-ring-bg" cx="50" cy="50" r="45"/>
            <circle class="kpi-ring-prog" cx="50" cy="50" r="45"
              stroke-dasharray="${circumf.toFixed(1)}"
              stroke-dashoffset="${ringOffset.toFixed(1)}"/>
          </svg>
          <div class="kpi-ring-text">
            <span class="kpi-ring-num">${todayCount}</span>
            <span class="kpi-ring-sub">/ ${cfg.daily} trang</span>
          </div>
        </div>
        <div class="kpi-streak">
          <div class="kpi-streak-num">🔥 ${streak}</div>
          <div class="kpi-streak-label">ngày liên tiếp</div>
        </div>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-card-title">Tuần này</div>
      <div class="kpi-prog-wrap">
        <div class="kpi-prog-head">
          <span>${weekCount} / ${cfg.weekly} trang</span>
          <span>${weeklyPct}%</span>
        </div>
        <div class="kpi-prog-bar"><div class="kpi-prog-fill" style="width:${weeklyPct}%"></div></div>
      </div>
      <div class="kpi-chart">${bars}</div>
    </div>

    <button class="btn-set-goal" id="btn-open-goal">🎯 Đặt mục tiêu</button>
  `;

  $('btn-open-goal').addEventListener('click', () => {
    const cfg = getKPI();
    $('inp-daily').value  = cfg.daily;
    $('inp-weekly').value = cfg.weekly;
    openModal('modal-goal');
  });
}

// ─────────────────────────────────────────────
//  SERVICE WORKER & REMINDERS
// ─────────────────────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js');
  } catch (e) { console.warn('SW registration failed:', e); }
}

function swSend(type, payload = {}) {
  return new Promise(resolve => {
    if (!navigator.serviceWorker.controller) { resolve({ ok: false }); return; }
    const ch = new MessageChannel();
    ch.port1.onmessage = e => resolve(e.data);
    navigator.serviceWorker.controller.postMessage({ type, payload }, [ch.port2]);
  });
}

function getReminder() {
  try { return JSON.parse(localStorage.getItem(SK.REMIND)) || { enabled: false, time: '21:00', days: ['T2','T3','T4','T5','T6'] }; }
  catch { return { enabled: false, time: '21:00', days: ['T2','T3','T4','T5','T6'] }; }
}

function saveReminder(cfg) {
  localStorage.setItem(SK.REMIND, JSON.stringify(cfg));
  swSend('SET_REMINDER', cfg);
}

async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

function renderSettingsPanel() {
  const r = getReminder();
  const days = ['T2','T3','T4','T5','T6','T7','CN'];

  $('settings-body').innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">Nhắc lịch đọc sách</div>

      <div class="toggle-row">
        <label for="toggle-remind">Bật nhắc nhở</label>
        <input type="checkbox" class="toggle" id="toggle-remind" ${r.enabled ? 'checked' : ''}>
      </div>

      <div class="settings-field">
        <label>Thời gian nhắc</label>
        <input type="time" id="inp-remind-time" value="${r.time}">
      </div>

      <div class="settings-field">
        <label>Ngày trong tuần</label>
        <div class="day-pills" id="day-pills">
          ${days.map(d => `<button class="day-pill ${r.days.includes(d) ? 'active' : ''}" data-day="${d}">${d}</button>`).join('')}
        </div>
      </div>

      <button class="btn-save-reminder" id="btn-save-remind">💾 Lưu cài đặt nhắc nhở</button>
      <button class="btn-test-notif" id="btn-test-notif">🔔 Gửi thông báo thử ngay</button>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Cài app lên điện thoại</div>
      <div class="install-guide">
        <div class="install-tabs">
          <div class="install-tab active" data-tab="android">Android</div>
          <div class="install-tab" data-tab="ios">iOS</div>
        </div>
        <div class="install-steps active" id="steps-android">
          <div class="install-step"><div class="step-num">1</div><span>Mở trang web bằng <strong>Chrome</strong> trên Android</span></div>
          <div class="install-step"><div class="step-num">2</div><span>Nhấn Menu <strong>⋮</strong> ở góc phải trên</span></div>
          <div class="install-step"><div class="step-num">3</div><span>Chọn <strong>"Thêm vào Màn hình chính"</strong></span></div>
          <div class="install-step"><div class="step-num">4</div><span>Mở app từ Home Screen → Nhắc nhở sẽ hoạt động ngầm ✅</span></div>
        </div>
        <div class="install-steps" id="steps-ios">
          <div class="install-step"><div class="step-num">1</div><span>Mở trang bằng <strong>Safari</strong> trên iOS 16.4+</span></div>
          <div class="install-step"><div class="step-num">2</div><span>Nhấn biểu tượng <strong>Chia sẻ ↑</strong></span></div>
          <div class="install-step"><div class="step-num">3</div><span>Chọn <strong>"Add to Home Screen"</strong></span></div>
          <div class="install-step"><div class="step-num">4</div><span>Mở app từ Home Screen → Cấp quyền Notification ✅</span></div>
        </div>
      </div>
    </div>
  `;

  // Day pill toggle
  $('day-pills').addEventListener('click', e => {
    const pill = e.target.closest('.day-pill');
    if (pill) pill.classList.toggle('active');
  });

  // Install tabs
  $('settings-body').querySelectorAll('.install-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $('settings-body').querySelectorAll('.install-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.dataset.tab;
      $('steps-android').classList.toggle('active', id === 'android');
      $('steps-ios').classList.toggle('active', id === 'ios');
    });
  });

  // Save reminder
  $('btn-save-remind').addEventListener('click', async () => {
    const granted = await requestNotifPermission();
    if (!granted) { showToast('⚠️ Cần cấp quyền thông báo'); return; }

    const days = [...$('day-pills').querySelectorAll('.day-pill.active')].map(p => p.dataset.day);
    const cfg  = {
      enabled: $('toggle-remind').checked,
      time:    $('inp-remind-time').value,
      days,
      key:     'reminder',
    };
    saveReminder(cfg);
    showToast('✅ Đã lưu cài đặt nhắc nhở');
  });

  // Test notification
  $('btn-test-notif').addEventListener('click', async () => {
    const granted = await requestNotifPermission();
    if (!granted) { showToast('⚠️ Cần cấp quyền thông báo'); return; }
    swSend('TEST_NOTIFICATION');
    showToast('📨 Đã gửi thông báo thử');
  });
}

// ─────────────────────────────────────────────
//  PANELS
// ─────────────────────────────────────────────
function openPanel(id) {
  closeAllPanels();
  $(`panel-${id}`).classList.remove('hidden');
  $('panel-overlay').classList.remove('hidden');
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  $(`btn-${id}`)?.classList.add('active');

  if (id === 'notes')    renderNotesPanel();
  if (id === 'kpi')      renderKPIPanel();
  if (id === 'settings') renderSettingsPanel();
}

function closeAllPanels() {
  ['notes','kpi','settings'].forEach(id => $(`panel-${id}`).classList.add('hidden'));
  $('panel-overlay').classList.add('hidden');
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
}

// ─────────────────────────────────────────────
//  MODALS
// ─────────────────────────────────────────────
function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

// ─────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────
function initEvents() {

  // File upload
  $('file-input').addEventListener('change', e => loadPDF(e.target.files[0]));

  // Drag & Drop
  const reader = $('reader');
  reader.addEventListener('dragover', e => { e.preventDefault(); $('upload-placeholder').classList.add('drag-over'); });
  reader.addEventListener('dragleave', () => $('upload-placeholder').classList.remove('drag-over'));
  reader.addEventListener('drop', e => {
    e.preventDefault();
    $('upload-placeholder').classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) loadPDF(f);
  });

  // Navigation
  $('btn-prev').addEventListener('click', () => scrollToPage(curPage - 1));
  $('btn-next').addEventListener('click', () => scrollToPage(curPage + 1));
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') scrollToPage(curPage + 1);
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   scrollToPage(curPage - 1);
  });

  // Zoom
  $('btn-zoom-in').addEventListener('click',  () => changeZoom(0.15));
  $('btn-zoom-out').addEventListener('click', () => changeZoom(-0.15));

  // Translation mode toggle: Click ↔ Song song
  $('btn-mode-click').addEventListener('click', () => {
    if (transMode === 'click') return;
    transMode = 'click';
    $('btn-mode-click').classList.add('active');
    $('btn-mode-parallel').classList.remove('active');
    $('trans-panel').classList.add('hidden');
    $('pdf-pages-container').classList.remove('hidden');
    $('reader').style.justifyContent = 'center';
    
    // Rebuild overlays for currently rendered pages
    document.querySelectorAll('.pdf-page-wrapper').forEach(async w => {
      const n = parseInt(w.dataset.page);
      if (renderedPages.has(n)) {
        const p = await pdfDoc.getPage(n);
        const vp = p.getViewport({ scale: curScale });
        buildClickOverlay(p, $(`text-layer-${n}`), vp);
      }
    });
  });

  $('btn-mode-parallel').addEventListener('click', () => {
    if (transMode === 'parallel') return;
    transMode = 'parallel';
    $('btn-mode-parallel').classList.add('active');
    $('btn-mode-click').classList.remove('active');
    
    // Remove all click blocks
    document.querySelectorAll('.text-layer').forEach(tl => tl.innerHTML = '');
    
    if (curPageObj && curVP) {
      translatePageParallel(curPageObj, curVP);
    } else {
      showToast('⚠️ Hãy mở file PDF trước');
      transMode = 'click';
      $('btn-mode-click').classList.add('active');
      $('btn-mode-parallel').classList.remove('active');
    }
  });

  // View-split buttons inside trans-panel
  $('view-split-group').addEventListener('click', e => {
    const btn = e.target.closest('.vs-btn');
    if (!btn) return;
    applyViewMode(btn.dataset.view);
  });

  // Tool buttons
  $('btn-notes').addEventListener('click', () => {
    if (!$('panel-notes').classList.contains('hidden')) closeAllPanels();
    else openPanel('notes');
  });
  $('btn-kpi').addEventListener('click', () => {
    if (!$('panel-kpi').classList.contains('hidden')) closeAllPanels();
    else openPanel('kpi');
  });
  $('btn-settings').addEventListener('click', () => {
    if (!$('panel-settings').classList.contains('hidden')) closeAllPanels();
    else openPanel('settings');
  });

  // Panel close buttons
  document.querySelectorAll('.panel-close-btn').forEach(btn => {
    btn.addEventListener('click', closeAllPanels);
  });
  $('panel-overlay').addEventListener('click', closeAllPanels);

  // Notes filter
  $('notes-filter').addEventListener('change', renderNotesPanel);

  // Add note (footer & panel)
  const openNoteModal = () => {
    if (!pdfDoc) { showToast('⚠️ Hãy mở file PDF trước'); return; }
    $('note-page-num').textContent = curPage;
    $('note-text').value = '';
    selNoteColor = 'yellow';
    document.querySelectorAll('.cdot').forEach(c => c.classList.toggle('active', c.dataset.color === 'yellow'));
    openModal('modal-note');
  };
  $('btn-add-note').addEventListener('click', openNoteModal);
  $('btn-new-note').addEventListener('click', openNoteModal);

  // Note color picker
  document.querySelectorAll('.cdot').forEach(btn => {
    btn.addEventListener('click', () => {
      selNoteColor = btn.dataset.color;
      document.querySelectorAll('.cdot').forEach(c => c.classList.toggle('active', c === btn));
    });
  });

  // Save note
  $('btn-save-note').addEventListener('click', () => {
    const text = $('note-text').value.trim();
    if (!text) { showToast('⚠️ Ghi chú không thể trống'); return; }
    addNote(curPage, text, selNoteColor);
    closeModal('modal-note');
    showToast('✅ Đã lưu ghi chú');
    if (!$('panel-notes').classList.contains('hidden')) renderNotesPanel();
  });
  $('btn-cancel-note').addEventListener('click',      () => closeModal('modal-note'));
  $('btn-close-note-modal').addEventListener('click', () => closeModal('modal-note'));

  // Save KPI goal
  $('btn-save-goal').addEventListener('click', () => {
    const daily  = Math.max(1, parseInt($('inp-daily').value)  || 20);
    const weekly = Math.max(1, parseInt($('inp-weekly').value) || 100);
    saveKPI({ daily, weekly });
    closeModal('modal-goal');
    showToast('✅ Đã lưu mục tiêu đọc sách');
    renderKPIPanel();
  });
  $('btn-cancel-goal').addEventListener('click',       () => closeModal('modal-goal'));
  $('btn-close-goal-modal').addEventListener('click',  () => closeModal('modal-goal'));

  // Translation popup
  $('btn-close-trans').addEventListener('click', () => $('trans-popup').classList.add('hidden'));
  $('btn-copy-trans').addEventListener('click', () => {
    const text = $('tp-result').textContent;
    navigator.clipboard.writeText(text).then(() => showToast('📋 Đã sao chép bản dịch'));
  });
}

async function changeZoom(delta) {
  if (!pdfDoc) return;
  curScale = Math.min(3, Math.max(0.5, curScale + delta));
  $('zoom-label').textContent = Math.round(curScale * 100) + '%';
  
  // Clear and re-render all observed wrappers
  renderedPages.clear();
  const p1 = await pdfDoc.getPage(1);
  const vp1 = p1.getViewport({ scale: curScale });
  
  document.querySelectorAll('.pdf-page-wrapper').forEach(w => {
    w.style.width = vp1.width + 'px';
    w.style.height = vp1.height + 'px';
    const canvas = w.querySelector('canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    pageObserver.unobserve(w);
    pageObserver.observe(w);
  });
  
  if (transMode === 'parallel' && curPageObj) {
    curVP = curPageObj.getViewport({ scale: curScale });
    translatePageParallel(curPageObj, curVP);
  }
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
async function init() {
  initEvents();
  initTranslation();
  await registerSW();

  // Restore reminder settings to SW if any
  const rem = getReminder();
  if (rem.enabled) swSend('SET_REMINDER', { ...rem, key: 'reminder' });
}

init();
