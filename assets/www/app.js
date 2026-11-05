/* 课程入口 · 本地优先的课程入口导航器 */
(function () {
'use strict';

/* ================= 基础工具 ================= */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const app = $('#app');
const ESC = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => n < 10 ? '0' + n : '' + n;
const nowISO = () => isoAt(new Date());
const isoAt = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
const DEFAULT_BEFORE_CLASS_HOURS = 10;
const DEFAULT_NIGHT_FROM = 22;   // 22:00 之后算深夜
const DEFAULT_NIGHT_TO = 6;      // 06:00 之前算深夜
const DEFAULT_NIGHT_HOUR = 21;   // 深夜时改成前一天 21:00
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function fmtDT(iso) {
  if (!iso) return '未设置';
  const d = new Date(iso);
  if (isNaN(d)) return '未设置';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function fmtDay(iso) {
  if (!iso) return '未设置';
  const d = new Date(iso);
  if (isNaN(d)) return '未设置';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}
function dayDiff(iso) {
  const d = new Date(iso); if (isNaN(d)) return 999;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const n = new Date(); const b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((a - b) / 864e5);
}
function relText(iso) {
  if (!iso) return '无截止时间';
  const d = new Date(iso); if (isNaN(d)) return '无截止时间';
  const ms = d.getTime() - Date.now();
  if (ms < 0) {
    const h = Math.floor(-ms / 36e5);
    return h < 24 ? '已逾期 ' + Math.max(1, h) + ' 小时' : '已逾期 ' + Math.floor(h / 24) + ' 天';
  }
  if (ms < 36e5) return '还有 ' + Math.max(1, Math.round(ms / 6e4)) + ' 分钟';
  if (ms < 864e5) return '还有 ' + Math.round(ms / 36e5) + ' 小时';
  return '还有 ' + Math.floor(ms / 864e5) + ' 天';
}
function urgency(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return '';
  const ms = d.getTime() - Date.now();
  if (ms < 0) return 'late';
  if (ms < 864e5) return 'soon';
  return '';
}
function dayLabel(iso) {
  const diff = dayDiff(iso);
  if (diff === -1) return '昨天';
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === 2) return '后天';
  if (diff > 2 && diff < 7) return WEEK[new Date(iso).getDay()];
  return fmtDay(iso);
}
function colorOf(str) {
  const colors = ['#4F46E5', '#0F9D8A', '#D97706', '#DB2777', '#2563EB', '#7C3AED', '#0891B2'];
  let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 997;
  return colors[h % colors.length];
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 2200);
}
function go(hash) { closeSheet(); location.hash = hash; }
function copyText(t) { Bridge.copy(t); if (!isNative) toast('已复制'); }
function download(name, content, mime) {
  const r = Bridge.save(name, content, mime);
  if (r && r.indexOf('ERR:') === 0) { toast('保存失败：' + r.slice(4)); return; }
  toast('已保存到 ' + (r || '下载目录'));
}

/* ================= 本地存储 ================= */
const KEY = 'cnav.db.v1';
  // OCR 默认 Key：占位用 helloworld（OCR.space 公共演示 Key，限流频繁）；请到「我的 → 截图文字识别」填自己的免费 Key。
  const SHARED_OCR_KEY = 'helloworld';
const DEFAULT_SETTINGS = { cloud: false, endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', key: '', lead: 60, reminders: true, classLead: 20, classReminders: true, ocr: true, ocrEndpoint: 'https://api.ocr.space/parse/image', ocrKey: SHARED_OCR_KEY, ocrLang: 'chs', ocrConsent: false, semesterStart: '2026-09-14', sourceMemory: {}, sourceLast: null, aiAsk: true, theme: 'light' };
let DB = loadDB();
function loadDB() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { v: 1, courses: [], pending: [], ledger: [], imports: [], classAlarmIds: [], taskAlarmIds: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
    const d = JSON.parse(raw);
    if (!Array.isArray(d.courses)) d.courses = []; if (!Array.isArray(d.pending)) d.pending = [];
    if (!Array.isArray(d.ledger)) d.ledger = []; if (!Array.isArray(d.imports)) d.imports = [];
    d.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
    // 没有自定义 Key 的用户回落到 helloworld（公共演示 Key，易限流），保留自定义 Key。
    d.settings.ocrKey = String(d.settings.ocrKey || '').trim();
    if (!d.settings.ocrKey || d.settings.ocrKey === 'helloworld') d.settings.ocrKey = SHARED_OCR_KEY;
    d.settings.sourceMemory = d.settings.sourceMemory || {};
    if (!Array.isArray(d.classAlarmIds)) d.classAlarmIds = [];
    if (!Array.isArray(d.taskAlarmIds)) d.taskAlarmIds = [];
    return d;
  } catch (e) {
    return { v: 1, courses: [], pending: [], ledger: [], imports: [], classAlarmIds: [], taskAlarmIds: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
  }
}
function saveDB() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { diagLog('error', '本地存储写入失败', { message: e.message }); toast('本地存储空间不足'); } }
function applyTheme() {
  const dark = DB.settings.theme === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', dark ? '#0F1117' : '#F4F5FA');
  try { if (Bridge && Bridge.setNight) Bridge.setNight(dark); } catch (e) {}
}

/* ================= 诊断日志（排障用，不含原文/Key/群号） ================= */
const DIAG_KEY = 'cnav.diag.v1';
function readDiag() {
  try { const a = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function diagLog(type, msg, extra) {
  try {
    const a = readDiag();
    a.unshift({ at: nowISO(), type: String(type || 'log'), msg: String(msg || '').slice(0, 600), hash: (location.hash || '').slice(0, 80), extra: extra || null });
    localStorage.setItem(DIAG_KEY, JSON.stringify(a.slice(0, 120)));
  } catch (e) {}
}
window.addEventListener('error', ev => {
  diagLog('error', ev.message || '脚本错误', { file: ev.filename || '', line: ev.lineno || 0, col: ev.colno || 0, stack: ev.error && ev.error.stack ? String(ev.error.stack).slice(0, 1200) : '' });
});
window.addEventListener('unhandledrejection', ev => {
  const r = ev.reason;
  diagLog('error', (r && (r.message || r)) || '未处理的 Promise 拒绝', { stack: r && r.stack ? String(r.stack).slice(0, 1200) : '' });
});
function diagTXT() {
  let native = {};
  try { native = JSON.parse(Bridge.info()); } catch (e) {}
  const d = readDiag();
  const tasks = allTasks().slice();
  const sessions = (DB.courses || []).reduce((n, c) => n + ((c.sessions || []).length), 0);
  const platforms = (DB.courses || []).reduce((n, c) => n + ((c.platforms || []).length), 0);
  const lines = [];
  lines.push('课程入口 诊断日志');
  lines.push('生成时间：' + nowISO());
  lines.push('应用版本：' + (native.app || '1.8.0') + '（versionCode 30）');
  lines.push('运行环境：' + (isNative ? 'Android WebView' : '浏览器预览'));
  lines.push('设备/系统：' + (native.model || '未知') + ' / SDK ' + (native.sdk || 0));
  lines.push('通知权限：' + (native.notifyGranted ? '已授权' : '未授权') + '　精确闹钟：' + (native.exactAlarm ? '可用' : '不可用/未知'));
  lines.push('屏幕：' + screen.width + '×' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x　语言：' + (navigator.language || ''));
  lines.push('网络：' + (navigator.onLine ? '在线' : '离线') + '　UA：' + String(navigator.userAgent || '').slice(0, 300));
  lines.push('');
  lines.push('— 功能开关 —');
  lines.push('云端识别：' + (DB.settings.cloud ? '开' : '关') + '　在线问答：' + (askOnlineReady() ? '开（已配 Key）' : (DB.settings.aiAsk === false ? '关' : '未配 Key')) + '　截图 OCR：' + (DB.settings.ocr ? '开' : '关') + '（同意：' + (DB.settings.ocrConsent ? '是' : '否') + '）');
  lines.push('作业提醒：' + (DB.settings.reminders ? '开' : '关') + '，提前 ' + DB.settings.lead + ' 分钟；上课提醒：' + (DB.settings.classReminders === false ? '关' : '开') + '，提前 ' + DB.settings.classLead + ' 分钟');
  lines.push('学期第 1 周周一：' + DB.settings.semesterStart + '　当前第 ' + semesterWeekOf(new Date()) + ' 周');
  lines.push('');
  lines.push('— 数据概览 —');
  lines.push('课程 ' + DB.courses.length + ' 门 / 平台入口 ' + platforms + ' 个 / 上课时段 ' + sessions + ' 个 / 待办 ' + tasks.length + ' 项（未完成 ' + pendingTasks().length + '）');
  lines.push('台账 ' + DB.ledger.length + ' 条 / 导入记录 ' + (DB.imports || []).length + ' 条 / 预排上课闹钟 ' + (DB.classAlarmIds || []).length + ' 个');
  try { lines.push('本地数据大小：约 ' + Math.round((JSON.stringify(DB).length + JSON.stringify(readDiag()).length) / 1024) + ' KB'); } catch (e) {}
  lines.push('');
  lines.push('— 课程摘要（不含原文/入口链接/群号） —');
  if (!DB.courses.length) lines.push('（无课程）');
  DB.courses.slice(0, 50).forEach((c, i) => {
    lines.push((i + 1) + '. ' + String(c.course || '未命名').slice(0, 40) + '｜教师 ' + String(c.teacher || '—').slice(0, 20) + '｜平台 ' + (c.platforms || []).length + '｜时段 ' + (c.sessions || []).length + '｜待办 ' + (c.tasks || []).length + '｜来源 ' + String(c.source || '—').slice(0, 30));
  });
  lines.push('');
  lines.push('— 最近操作（' + d.length + ' 条，最多 120 条） —');
  if (!d.length) lines.push('（暂无）');
  d.forEach(x => {
    lines.push('[' + x.at + '] ' + x.type + ' · ' + x.msg + (x.hash ? ' · ' + x.hash : ''));
    if (x.extra && x.extra.stack) lines.push('  ' + String(x.extra.stack).replace(/\n/g, '\n  ').slice(0, 1200));
  });
  lines.push('');
  lines.push('说明：本文件由用户主动导出，不含 API Key、原始通知、群号/群名、入口链接或学生信息。');
  return lines.join('\n');
}
function exportDiag() {
  diagLog('export', '导出诊断日志');
  download('课程入口-诊断日志-' + nowISO().replace(/[-:T]/g, '').slice(0, 12) + '.txt', diagTXT(), 'text/plain');
}

/* ================= 原生桥 ================= */
const isNative = typeof window.Android !== 'undefined' && !!window.Android;
const Bridge = isNative ? window.Android : {
  info: () => JSON.stringify({ sdk: 0, model: '浏览器预览', app: '1.8.0', notifyGranted: false, exactAlarm: false }),
  setNight: () => {},
  copy: t => { try { navigator.clipboard.writeText(t); } catch (e) {} },
  open: u => { try { window.open(u, '_blank'); return true; } catch (e) { return false; } },
  share: t => { if (navigator.share) navigator.share({ text: t }); },
  save: (name, content) => { try { const b = new Blob([content], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); return '浏览器下载'; } catch (e) { return 'ERR:' + e.message; } },
  pickFile: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.ics,.json,text/*'; i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => window.NativeCB.onFilePicked(JSON.stringify({ name: f.name, text: r.result })); r.readAsText(f); }; i.click(); },
  notifyAt: () => {}, cancel: () => {}, notifyNow: () => {}, requestNotifyPermission: () => toast('浏览器预览无法发送系统通知'), alarms: () => '[]',
  pickImage: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.style.display = 'none'; document.body.appendChild(i); i.onchange = () => { const f = i.files[0]; if (!f) { i.remove(); return; } const r = new FileReader(); r.onload = () => { window.NativeCB.onImagePicked(JSON.stringify({ name: f.name, dataUrl: r.result })); i.remove(); }; r.readAsDataURL(f); }; i.click(); },
  pickPdf: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/pdf,.pdf'; i.style.display = 'none'; document.body.appendChild(i); i.onchange = () => { const f = i.files[0]; if (!f) { i.remove(); return; } const r = new FileReader(); r.onload = () => { window.NativeCB.onPdfPicked(JSON.stringify({ name: f.name, dataUrl: r.result })); i.remove(); }; r.readAsDataURL(f); }; i.click(); },
  ocr: () => toast('浏览器预览不支持在线 OCR，请用 APK 或在设置里粘贴文字'),
  httpPost: () => setTimeout(() => window.NativeCB.onHttpResult(JSON.stringify({ ok: false, error: '浏览器预览不支持云端请求' })), 50)
};

diagLog('app', '启动', { native: isNative });

window.NativeCB = {
  onFilePicked(payload) {
    let p; try { p = JSON.parse(payload); } catch (e) { return; }
    if (p.error) { toast('读取文件失败'); return; }
    if (UI.pickMode === 'ics') { importICS(p.text, p.name); }
    else if (UI.pickMode === 'backup') { importBackup(p.text); }
    UI.pickMode = '';
  },
  onHttpResult(payload) {
    let p; try { p = JSON.parse(payload); } catch (e) { toast('云端返回解析失败'); UI.httpMode = 'cloud'; return; }
    if (UI.httpMode === 'ask') askDone(p);
    else cloudDone(p);
  },
  onImagePicked(payload) {
    let p; try { p = JSON.parse(payload); } catch (e) { return; }
    if (p.error || !p.dataUrl) { toast('读取图片失败'); return; }
    const target = UI.ocr && UI.ocr.target === 'timetable' ? 'timetable' : (UI.ocr && UI.ocr.target === 'task' ? 'task' : 'notice');
    // 换图时保留用户已输入/已识别的文字，避免手输内容被清空
    const draft = UI.ocr && UI.ocr.dataUrl ? (UI.ocr.text || '') : (($('#pasteText') || {}).value || '');
    UI.ocr = { dataUrl: p.dataUrl, name: p.name || '截图', path: p.path || '', text: draft, raw: '', overlay: null, busy: false, target: target, source_app: null };
    if (target === 'task') {
      if (DB.settings.ocr) {
        toast('截图已选，开始识别…');
        setTimeout(() => startOcr(), 80);
      } else {
        toast('在线 OCR 已关闭，可在设置里开启');
      }
      return;
    }
    UI.importTab = target === 'timetable' ? 'timetable' : 'notice';
    renderImport();
    if (DB.settings.ocr) {
      toast('截图已选，开始识别…');
      setTimeout(() => startOcr(), 80);
    } else {
      toast('在线 OCR 已关闭，可在设置里开启');
    }
  },
  onOcrResult(payload) {
    let p; try { p = JSON.parse(payload); } catch (e) { toast('OCR 返回解析失败'); return; }
    UI.ocr.busy = false; UI.ocr.tempSharedKey = false;
    if (UI.ocr.target === 'task') {
      if (!p.ok) {
        if (retryWithSharedKey(p.error)) return;
        diagLog('ocr', '任务识别失败', { error: String(p.error || '').slice(0, 200) });
        ocrFailSheet(p.error || 'OCR 识别失败', 'task');
        return;
      }
      UI.ocr.text = cleanOcrText(p.text);
      if (!UI.ocr.text) { toast('没有识别到文字，请换一张更清晰的截图'); return; }
      ledgerAdd({ stage: '任务截图识别', tool: 'OCR · ' + (p.service || '在线 OCR'), prompt: '识别课程任务截图中的文字，只加入当前课程', input: '[截图] ' + (UI.ocr.name || ''), output: UI.ocr.text.slice(0, 4000), human: '识别后直接保存，可编辑' });
      addTasksToCourse(UI.taskCid, UI.ocr.text, '截图 OCR');
      return;
    }
    if (!p.ok) {
      if (retryWithSharedKey(p.error)) return;
      diagLog('ocr', '识别失败', { target: UI.ocr.target, error: String(p.error || '').slice(0, 200) });
      renderImport();
      ocrFailSheet(p.error || 'OCR 识别失败', UI.ocr.target);
      return;
    }
    UI.ocr.text = cleanOcrText(p.text);
    UI.ocr.raw = UI.ocr.text;
    UI.ocr.source_app = detectSourceApp(UI.ocr, UI.ocr.text);
    UI.ocr.overlay = p.overlay && p.overlay.lines && p.overlay.lines.length ? p.overlay : null;
    diagLog('ocr', '识别完成', { target: UI.ocr.target, chars: UI.ocr.text.length, service: p.service || 'OCR' });
    renderImport();
    ledgerAdd({ stage: '截图导入', tool: 'OCR · ' + (p.service || '在线 OCR'), prompt: '识别课程通知截图中的文字', input: '[截图] ' + (UI.ocr.name || ''), output: UI.ocr.text.slice(0, 4000), human: '可修改识别文字', reviewer: '用户' });
    if (UI.ocr.target === 'timetable' && UI.ocr.overlay) {
      toast('已识别，正在还原课表版式…');
      Parser.parseTimetableImage(UI.ocr.text, UI.ocr.overlay, UI.ocr.dataUrl, '截图 OCR').then(list => {
        if (list && list.length) { startBatch(list, '截图 OCR', UI.ocr.source_app); return; }
        toast('这张图没还原成表格，请检查文字后点“用这张课表生成课程”');
      });
    } else if (UI.ocr.text) {
      const parsed = Parser.extract(UI.ocr.text, '截图 OCR');
      parsed.source = '截图 OCR';
      parsed.tool = 'OCR + 本地规则引擎';
      handleNoticeParsed(parsed, UI.ocr.text, UI.ocr.source_app);
    } else {
      toast('没有识别到文字，可换一张更清晰的截图');
    }
  },
  onPdfPicked(payload) {
    let p; try { p = JSON.parse(payload); } catch (e) { return; }
    if (p.error || !p.dataUrl) { toast('读取 PDF 失败'); return; }
    parsePdfFile(p.dataUrl, p.name || '课表.pdf');
  },
  onNotifyPermission(ok) {
    toast(ok ? '通知权限已开启' : '未获得通知权限，可在系统设置里开启');
    if (ok) syncReminders();
  }
};

/* ================= 台账 ================= */
function ledgerAdd(e) {
  DB.ledger.unshift({
    id: uid('lg'), at: nowISO(), tool: e.tool || '本地规则引擎', stage: e.stage || '',
    prompt: e.prompt || '', input: (e.input || '').slice(0, 4000), output: (e.output || '').slice(0, 6000),
    human: e.human || '', reviewer: e.reviewer || '用户', app: '课程入口 1.8.0'
  });
  if (DB.ledger.length > 300) DB.ledger.length = 300;
  saveDB();
}

/* ================= 路由 ================= */
let UI = { tab: 'home', filter: 'all', importTab: 'notice', ask: [], marks: {}, editor: null, batch: null, pickMode: '', cloudBusy: false, httpMode: 'cloud', askBusy: false, askPending: null, editingTask: null, pdfBusy: false, taskCid: null, ocr: { dataUrl: '', name: '', text: '', busy: false, target: 'notice' } };
const ROUTES = { home: 1, todos: 1, import: 1, ask: 1, me: 1, course: 1, confirm: 1, edit: 1, new: 1, batch: 1, ledger: 1, cloud: 1, ocr: 1 };
function currentRoute() {
  const h = (location.hash || '#/home').replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  return { name: parts[0] || 'home', arg: parts[1] || '' };
}
function router() {
  const r = currentRoute();
  if (!ROUTES[r.name]) { go('#/home'); return; }
  UI.tab = ['home', 'todos', 'import', 'ask', 'me'].includes(r.name) ? r.name : '';
  if (r.name === 'confirm') {
    const p = DB.pending.find(x => x.id === r.arg);
    if (!p) { toast('这条待确认记录不存在'); go('#/home'); return; }
    UI.editor = { mode: 'confirm', pid: p.id, data: JSON.parse(JSON.stringify(p.parsed)) };
    UI.current = p;
  } else if (r.name === 'new') {
    if (!UI.editor || UI.editor.mode !== 'manual') UI.editor = { mode: 'manual', data: blankCourse() };
  } else if (r.name === 'edit' || r.name === 'course') {
    const c = DB.courses.find(x => x.id === r.arg);
    if (!c) { toast('课程不存在'); go('#/home'); return; }
    UI.current = c;
    if (r.name === 'edit') UI.editor = { mode: 'edit', cid: c.id, data: JSON.parse(JSON.stringify(c)) };
  }
  if (r.name === 'home') renderHome();
  else if (r.name === 'todos') renderTodos();
  else if (r.name === 'import') renderImport();
  else if (r.name === 'ask') renderAsk();
  else if (r.name === 'me') renderMe();
  else if (r.name === 'confirm') renderConfirm();
  else if (r.name === 'course') renderCourse();
  else if (r.name === 'edit') renderEditorPage('编辑课程');
  else if (r.name === 'new') renderEditorPage('新建课程');
  else if (r.name === 'batch') renderBatch();
  else if (r.name === 'ledger') renderLedger();
  else if (r.name === 'cloud') renderCloud();
  else if (r.name === 'ocr') renderOcr();
  setNav(r.name);
  window.scrollTo(0, 0);
}
function setNav(name) {
  const show = ['home', 'todos', 'import', 'ask', 'me'].includes(name);
  document.body.classList.toggle('nonav', !show);
  $$('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === (UI.tab || name)));
}
window.addEventListener('hashchange', router);

/* ================= 查询辅助 ================= */
function allTasks() {
  const out = [];
  DB.courses.forEach(c => (c.tasks || []).forEach(t => out.push({ c, t })));
  return out;
}
function pendingTasks() { return allTasks().filter(x => x.t.status !== '已完成'); }
function nextTask(c) {
  return (c.tasks || []).filter(t => t.status !== '已完成' && t.deadline).sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0];
}
function courseById(id) { return DB.courses.find(c => c.id === id); }
function normName(s) { return String(s || '').toLowerCase().replace(/[\s《》【】()（）·\-—_]/g, ''); }
function groupLink(g) {
  if (!g) return '';
  const l = String(g.link || '').trim();
  if (l) return l;
  const v = String(g.value || '').trim();
  return /^(https?:\/\/|dingtalk:\/\/)/i.test(v) ? v : '';
}
function isDingGroup(g) { return /钉钉/.test(String((g && g.type) || '')); }
function entries(c) {
  const list = (c.platforms || []).map(p => ({ cid: c.id, pid: p.id, name: p.name, purpose: p.purpose, type: p.entry_type, value: p.entry_value, fallback: p.fallback || '复制' }));
  if (c.group_info && (c.group_info.value || groupLink(c.group_info))) {
    const g = c.group_info, link = groupLink(g), ding = isDingGroup(g);
    list.push({ cid: c.id, pid: 'group', name: g.type || '群', purpose: '群内通知', type: 'group', value: link || g.value, link: link, direct: !!link, dingtalk: ding, fallback: link ? '复制链接' : (ding ? '打开钉钉' : '复制群号') });
  }
  return list;
}
function platformInfo(name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const list = (window.Parser && Parser.PLATFORMS) || [];
  return list.find(p => p.name === raw || (p.aliases || []).some(a => a.toLowerCase() === raw.toLowerCase())) || null;
}
function samePlatform(a, b) {
  const pa = platformInfo(a), pb = platformInfo(b);
  return (pa && pb) ? pa.name === pb.name : String(a || '') === String(b || '');
}
function entryForTask(c, t) {
  const list = entries(c);
  const wanted = (t && t.platform) || '';
  if (wanted) {
    let en = list.find(e => samePlatform(e.name, wanted)) || null;
    const info = platformInfo(wanted);
    if (en && !en.value && !/(group|article)/.test(en.type || '') && info && info.url) {
      en = Object.assign({}, en, { value: info.url, type: info.type || 'web', fallback: '复制链接' });
    }
    if (!en && info && info.url) {
      en = { cid: c.id, pid: 'default', name: info.name, purpose: '提交作业', type: info.type || 'web', value: info.url, fallback: '复制链接' };
    }
    return en;
  }
  return list.find(e => /提交|作业/.test(e.purpose)) || list[0] || null;
}
function taskJumpSheet(c, t) {
  const en = entryForTask(c, t);
  const info = platformInfo(t.platform);
  const pname = (en && en.name) || (info && info.name) || t.platform || '对应平台';
  const url = en && en.value ? en.value : '';
  UI.jump = { cid: c.id, tid: t.id, name: pname, entry: en };
  const meta = '<div class="card" style="padding:14px;margin-bottom:12px">' +
    '<div class="rowline" style="padding:0 0 9px"><div class="rl"><b>' + ESC(t.name) + '</b><span>' + ESC(c.course) + (t.deadline ? ' · ' + fmtDT(t.deadline) : ' · 未设截止时间') + '</span></div></div>' +
    '<div class="rowline" style="padding:9px 0 0;border-bottom:0"><div class="rl"><b>' + ESC(pname) + '</b><span>' + (url ? '将打开该平台的网页或 App，登录后自己找到这门课' : '这个平台没有统一的网页入口，通常会通过 App 或小程序打开') + '</span></div></div></div>';
  const body = meta + '<div class="notice warn"><svg><use href="#i-shield"/></svg><div>确认后才会离开课程入口跳到第三方平台；本应用不登录、不读取平台页面。</div></div>';
  let foot = '<button class="btn ghost" data-act="close-sheet">取消</button>';
  if (url) foot += '<button class="btn primary" data-act="task-jump-go">打开 ' + ESC(pname) + '</button>';
  else if (t.platform) foot += '<button class="btn soft" data-act="task-copy-platform">复制平台名</button>';
  else foot += '<button class="btn primary" data-act="task-jump-course">去课程详情</button>';
  openSheet('跳转到' + ESC(pname) + '？', body, foot);
}

/* ================= 首页 ================= */
function renderHome() {
  const pend = pendingTasks().sort((a, b) => {
    const da = a.t.deadline ? new Date(a.t.deadline) : new Date(8640000000000000);
    const db = b.t.deadline ? new Date(b.t.deadline) : new Date(8640000000000000);
    return da - db;
  });
  const soon = pend.filter(x => x.t.deadline && new Date(x.t.deadline).getTime() >= Date.now() && new Date(x.t.deadline).getTime() <= Date.now() + 7 * 864e5);
  const today = new Date();
  const dateStr = (today.getMonth() + 1) + '月' + today.getDate() + '日 · ' + WEEK[today.getDay()];
  const heroTitle = pend.length
    ? (soon.length ? '有 <em>' + soon.length + '</em> 件快到期' : '还有 <em>' + pend.length + '</em> 件待办')
    : '课程入口，<em>一碰就到</em>';
  const sub = pend.length ? '按截止时间排好了，先做最急的那件' : '粘贴一条课程通知，自动生成入口和待办';

  const urgent = pend.filter(x => x.t.deadline).slice(0, 3);
  let urgentHTML = '';
  if (urgent.length) {
    urgentHTML = '<div class="section" data-search-section><div class="section-head"><h2>最近截止</h2><a class="more" href="#/todos">全部待办</a></div>' +
      '<div class="card listcard">' + urgent.map(({ c, t }) => {
        const u = urgency(t.deadline);
        const d = new Date(t.deadline);
        const ds = (c.course + ' ' + t.name + ' ' + (t.platform || '')).toLowerCase();
        return '<div class="deadline-row" data-search="' + ESC(ds) + '" data-act="open-task" data-cid="' + c.id + '" data-tid="' + t.id + '">' +
          '<div class="when ' + u + '"><b>' + (u === 'late' ? '逾期' : d.getDate()) + '</b><span>' + (u === 'late' ? relText(t.deadline) : (d.getMonth() + 1) + '月·' + WEEK[d.getDay()]) + '</span></div>' +
          '<div class="info"><div class="n">' + ESC(t.name) + '</div><div class="s">' + ESC(c.course) + ' · ' + ESC(t.platform || '未设入口') + ' · ' + fmtDT(t.deadline) + '</div></div>' +
          '<svg style="width:16px;height:16px;color:#A3A9BC"><use href="#i-arrow"/></svg></div>';
      }).join('') + '</div></div>';
  }

  let coursesHTML = '';
  if (!DB.courses.length) {
    coursesHTML = '<div class="card empty" style="margin-top:6px"><div class="art"><svg><use href="#i-doc"/></svg></div>' +
      '<h3>还没有课程入口</h3><p>把群里的课程通知复制进来，AI 会认出课程、平台和截止时间，自动保存；不满意可撤销。</p>' +
      '<div class="actions"><button class="btn primary" data-act="go-import">粘贴通知</button>' +
      '<button class="btn ghost" data-act="demo">载入示例</button></div></div>';
  } else {
    coursesHTML = DB.courses.map(c => {
      const nt = nextTask(c);
      const u = nt ? urgency(nt.deadline) : '';
      const chips = (c.platforms || []).slice(0, 3).map(p => '<span class="chip"><span class="dot"></span>' + ESC(p.name) + '</span>').join('');
      const search = (c.course + ' ' + (c.teacher || '') + ' ' + (c.platforms || []).map(p => p.name + p.purpose).join(' ') + ' ' + (c.tasks || []).map(t => t.name).join(' ')).toLowerCase();
      return '<a class="card course-card" href="#/course/' + c.id + '" data-search="' + ESC(search) + '">' +
        '<span class="accent" style="background:' + colorOf(c.course) + '"></span>' +
        '<div class="course-top"><div class="cname">' + ESC(c.course) + '</div><div class="teacher">' + ESC(c.teacher || '') + '</div></div>' +
        '<div class="course-meta">' + chips + ((c.source_app && c.source_app.key !== 'screenshot' && c.source_app.key !== 'text') ? '<span class="chip ghost">' + ESC(c.source_app.name) + '</span>' : '') + ((c.sessions || []).length ? '<span class="chip teal">' + c.sessions.length + ' 个时段</span>' : (c.schedule ? '<span class="chip ghost">' + ESC(c.schedule) + '</span>' : '')) + '</div>' +
        '<div class="course-foot"><div class="due ' + u + '"><svg style="width:13px;height:13px"><use href="#i-clock"/></svg>' +
        (nt ? '<b>' + ESC(nt.name) + '</b><span>' + relText(nt.deadline) + '</span>' : '<span style="color:#0F9D8A">没有未完成待办</span>') +
        '</div><span class="linkbtn">查看</span></div></a>';
    }).join('');
  }

  app.innerHTML = '<div class="page">' +
    '<div class="hello"><div class="date">' + dateStr + '</div><h1>' + heroTitle + '</h1>' +
    '<div class="searchbar"><svg><use href="#i-search"/></svg><input id="homeSearch" placeholder="搜课程、作业、平台…" autocomplete="off"></div></div>' +
    '<div class="wrap">' + (UI.lastImport ? '<div class="notice warn" style="margin:14px 0 0"><svg><use href="#i-flag"/></svg><div>刚刚自动导入「' + ESC(UI.lastImport.label) + '」，已保存。 <button class="linkbtn" data-act="undo-import">撤销这次导入</button></div></div>' : '') + (DB.pending.length ? '<a class="notice warn" href="#/confirm/' + DB.pending[DB.pending.length - 1].id + '" style="margin:14px 0 0"><svg><use href="#i-flag"/></svg><div>有 ' + DB.pending.length + ' 条识别结果还没确认，点这里继续核对。</div></a>' : '') + '<div class="stats">' +
    '<button type="button" class="stat" data-act="stat-todos" data-k="open" aria-label="查看未完成待办"><b>' + pend.length + '</b><span>未完成待办</span></button>' +
    '<button type="button" class="stat warn" data-act="stat-todos" data-k="week" aria-label="查看 7 天内截止"><b>' + soon.length + '</b><span>7 天内截止</span></button>' +
    '<button type="button" class="stat good" data-act="stat-courses" aria-label="跳到我的课程"><b>' + DB.courses.length + '</b><span>课程入口</span></button></div>' +
    urgentHTML +
    '<div id="searchNoResult" class="card empty" style="display:none;margin-top:14px;padding:20px"><h3 style="font-size:15px">没有匹配的课程或待办</h3><p>换个关键词试试，或直接点下面的「导入」添加通知。</p><button class="btn primary" data-act="go-import">去导入</button></div>' +
    '<div class="section" id="myCourses" data-search-section><div class="section-head"><h2>我的课程</h2>' + (DB.courses.length ? '<a class="more" href="#/import">+ 导入</a>' : '') + '</div>' +
    (DB.courses.length ? '<div class="hintline">点卡片查看平台入口和待办</div>' : '') + (DB.courses.length ? '<div class="course-grid">' + coursesHTML + '</div>' : coursesHTML) + '</div>' +
    '<div style="height:10px"></div></div></div>';

  const si = $('#homeSearch');
  if (si) {
    si.addEventListener('input', () => {
      const q = si.value.trim().toLowerCase();
      $$('[data-search]').forEach(el => { el.style.display = !q || el.dataset.search.indexOf(q) >= 0 ? '' : 'none'; });
      // 没有匹配项的区块先收起，避免留下空白标题
      $$('.section[data-search-section]').forEach(sec => {
        const rows = sec.querySelectorAll('[data-search]');
        const any = Array.prototype.some.call(rows, el => el.style.display !== 'none');
        sec.style.display = !q || any ? '' : 'none';
      });
      const no = $('#searchNoResult');
      if (no) no.style.display = q && !$$('[data-search]').some(el => el.style.display !== 'none') ? '' : 'none';
    });
  }
}

/* ================= 待办 ================= */
function renderTodos() {
  const all = allTasks();
  const filter = UI.filter;
  let items = all.filter(x => filter === 'all' || (filter === 'open' ? x.t.status !== '已完成' : x.t.status === '已完成'));
  if (filter === 'week') {
    const now = Date.now(), end = now + 7 * 864e5;
    items = all.filter(x => x.t.status !== '已完成' && x.t.deadline && new Date(x.t.deadline).getTime() >= now && new Date(x.t.deadline).getTime() <= end);
  }
  items.sort((a, b) => {
    const da = a.t.deadline ? new Date(a.t.deadline) : null;
    const db = b.t.deadline ? new Date(b.t.deadline) : null;
    if (da && db) return da - db;
    if (da) return -1;
    if (db) return 1;
    return a.c.course.localeCompare(b.c.course);
  });
  const groups = {};
  const order = [];
  items.forEach(x => {
    let k = '无截止时间';
    if (x.t.deadline) {
      const diff = dayDiff(x.t.deadline);
      if (diff < 0) k = '已逾期';
      else if (diff === 0) k = '今天';
      else if (diff === 1) k = '明天';
      else if (diff < 7) k = '本周内';
      else k = '更晚';
    }
    if (!groups[k]) { groups[k] = []; order.push(k); }
    groups[k].push(x);
  });

  let body = '';
  if (!items.length) {
    body = '<div class="card empty"><div class="art"><svg><use href="#i-check"/></svg></div><h3>' +
      (filter === 'done' ? '还没有完成的待办' : (filter === 'week' ? '这 7 天没有要交的' : '暂时没有待办')) + '</h3><p>' +
      (filter === 'done' ? '完成任务后会出现在这里，方便回看。' : (filter === 'week' ? '往后 7 天没有截止任务，可以去全部待办看看。' : '导入课程通知后，作业和截止时间会自动聚到这里。')) +
      '</p><div class="actions"><button class="btn primary" data-act="go-import">去导入</button></div></div>';
  } else {
    body = order.map(k => {
      if (!groups[k].length) return '';
      return '<div class="section" style="margin-top:16px"><div class="section-head"><h2>' + k + ' <span class="pill-num">' + groups[k].length + '</span></h2></div>' +
        '<div class="card listcard">' + groups[k].map(({ c, t }) => {
          const u = urgency(t.deadline);
          const done = t.status === '已完成';
          return '<div class="task-line ' + (done ? 'done' : '') + '" data-cid="' + c.id + '" data-tid="' + t.id + '">' +
            '<button class="cb" data-act="toggle-task" data-cid="' + c.id + '" data-tid="' + t.id + '" aria-label="完成"><svg><use href="#i-check"/></svg></button>' +
            '<div class="tt" data-act="task-jump" data-cid="' + c.id + '" data-tid="' + t.id + '"><b>' + ESC(t.name) + '</b><span class="' + u + '">' + ESC(c.course) + ' · ' + (t.deadline ? fmtDT(t.deadline) + '（' + relText(t.deadline) + '）' : '未设截止时间') + (t.deadline_default ? ' · ' + (t.deadline_label || '默认课前10小时') : '') + '</span></div>' +
            (done ? '<span class="chip teal">已完成</span>' :
              '<button class="icon-btn plain" data-act="toggle-remind" data-cid="' + c.id + '" data-tid="' + t.id + '" title="提醒"><svg style="color:' + (t.remind === false ? '#C3C7D4' : '#4F46E5') + '"><use href="#i-bell"/></svg></button>' +
              '<button class="btn xs soft" data-act="task-jump" data-cid="' + c.id + '" data-tid="' + t.id + '">去提交</button>') +
            '</div>';
        }).join('') + '</div></div>';
    }).join('');
  }

  app.innerHTML = '<div class="page">' +
    '<div class="topbar"><div class="t">待办</div><div class="spacer"></div><span class="small">' + pendingTasks().length + ' 项未完成</span></div>' +
    '<div class="wrap"><div class="filterbar">' +
    [['all', '全部'], ['open', '未完成'], ['week', '7 天内'], ['done', '已完成']].map(([k, l]) => '<button class="' + (UI.filter === k ? 'on' : '') + '" data-act="filter" data-k="' + k + '">' + l + '</button>').join('') +
    '</div>' + body +
    '<div class="notice mt18" style="margin-bottom:18px"><svg><use href="#i-bell"/></svg><div>提醒由本机系统通知发出，默认提前 ' + leadText(DB.settings.lead) + '。截止时间来自通知原文，请以老师发布为准。</div></div>' +
    '</div></div>';
}
function leadText(m) {
  m = +m || 0;
  if (m >= 1440) return (m / 1440) + ' 天';
  if (m >= 60) return (m / 60) + ' 小时';
  return m + ' 分钟';
}
function tasksOf(c) { return (c.tasks || []).slice().sort((a, b) => { const x = a.deadline ? new Date(a.deadline).getTime() : Infinity; const y = b.deadline ? new Date(b.deadline).getTime() : Infinity; return x - y; }); }

/* ================= 导入 ================= */
function renderImport() {
  if (UI.importTab !== 'notice' && UI.importTab !== 'timetable') UI.importTab = 'notice';
  UI.ocr.target = UI.importTab === 'timetable' ? 'timetable' : 'notice';
  const cloudOn = DB.settings.cloud && DB.settings.key;
  app.innerHTML = '<div class="page">' +
    '<div class="topbar"><div class="t">导入课程信息</div><div class="spacer"></div><span class="chip ' + (UI.importTab === 'notice' && UI.ocr.dataUrl ? 'amber' : 'teal') + '" id="impChip"><svg><use href="#i-shield"/></svg><span id="impChipText">' + (UI.importTab === 'timetable' ? '课表导入' : (UI.ocr.dataUrl ? '在线 OCR' : '通知导入')) + '</span></span></div>' +
    '<div class="wrap">' +
    '<div class="seg">' +
    [['notice', '通知'], ['timetable', '课表']].map(([k, l]) =>
      '<button class="' + (UI.importTab === k ? 'on' : '') + '" data-act="import-tab" data-k="' + k + '">' + l + '</button>').join('') +
    '</div>' +
    '<div class="tab-pane" data-pane="notice">' +
      '<div class="card import-card"><h3>导入通知</h3><p>粘贴群里的通知，或选一张截图自动识别；两种方式共用下面的文字框。</p>' +
      '<div class="form-row mt12"><button class="btn soft" style="flex:1" data-act="pick-ocr-image"><svg><use href="#i-doc"/></svg>' + (UI.ocr.dataUrl ? '更换截图' : '选择截图') + '</button>' +
      '<button class="btn ghost" style="flex:1" data-act="sample">填入示例</button></div>' +
      (UI.ocr.dataUrl ? '<div class="ocr-mini"><img src="' + ESC(UI.ocr.dataUrl) + '" alt="截图"><div><b>' + ESC(UI.ocr.name || '截图') + '</b><span>' + (UI.ocr.busy ? '识别中…' : (UI.ocr.text ? '已识别，可直接改文字' : '等待识别')) + '</span></div><button class="linkbtn" data-act="clear-ocr">移除</button></div>' : '') +
      '<textarea class="textarea mt12" id="pasteText" style="min-height:' + (UI.ocr.dataUrl ? '135' : '150') + 'px" placeholder="例如：\n【课程通知】《大学英语》王老师：请于11月20日23:59前在学习通提交Unit5读书报告，逾期不候。">' + ESC(UI.ocr.dataUrl ? (UI.ocr.text || '') : '') + '</textarea>' +
      '<div class="form-row mt12"><button class="btn primary" style="flex:2" data-act="parse-paste">识别并直接保存</button>' +
      (UI.ocr.dataUrl ? '<button class="btn ghost" style="flex:1" data-act="ocr-run">重新识别</button>' : '') + '</div>' +
      (cloudOn ? '<button class="btn soft block mt12" data-act="cloud-parse"><svg><use href="#i-spark"/></svg>云端 AI 增强识别（可选）</button>' : '') +
      '</div>' +
      (UI.ocr.dataUrl ? '<div class="notice warn"><svg><use href="#i-shield"/></svg><div>截图会在选图后自动发到 OCR 服务；原图不写入课程数据，识别完只保留文字。 <button class="linkbtn" data-act="goto" data-href="#/ocr">OCR 设置</button></div></div>' : '<div class="notice"><svg><use href="#i-shield"/></svg><div>不登录、不爬取任何平台。粘贴或识图后直接保存为卡片和待办，可随时在课程详情里修改。</div></div>') +
    '</div>' +
    '<div class="tab-pane" data-pane="timetable" style="display:none">' +
      '<div class="card import-card"><h3>粘贴课表文本</h3><p>支持“周一 1-2节 大学英语 王老师 教一201”这类一行一节课的格式。</p>' +
      '<textarea class="textarea" id="ttText" style="min-height:130px" placeholder="周一 1-2节 高等数学 李明 教二305\n周三 3-4节 大学英语 王老师 教一201"></textarea>' +
      '<button class="btn primary block mt12" data-act="parse-timetable">解析课表</button>' +
      '<p class="tip">节次时间按常见作息换算（第1-2节 08:00-09:40），并生成课前提醒；作业仍以通知为准。导入后可在课程详情查看每节课时间和地点。</p></div>' +
      '<div class="file-btn mt12" data-act="pick-timetable-image"><div class="fi"><svg><use href="#i-doc"/></svg></div><div><b>选择课表截图（JPG / PNG）</b><span>从教务系统或班级群保存的课表图片，识别后自动保存</span></div></div>' +
      '<div class="file-btn mt12" data-act="pick-pdf"><div class="fi"><svg><use href="#i-doc"/></svg></div><div><b>选择课表 PDF（含单双周）</b><span>教务系统导出的 PDF，本地读取文字，能保留“单/双周”</span></div></div>' +
      '<div class="notice mt12"><svg><use href="#i-shield"/></svg><div>图片会在线 OCR 成文字；表格课表会按颜色块和行列自动还原。只上传你选中的这一张图，原图不写入课程数据。PDF 只在本机解析，不上传。</div></div>' +
    '</div>' +
    '</div></div>';
  switchImportTab(UI.importTab);
}

function switchImportTab(t) {
  const pt = $('#pasteText');
  if (pt && UI.ocr.dataUrl) UI.ocr.text = pt.value;
  UI.importTab = t;
  $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.k === t));
  $$('.tab-pane').forEach(p => { p.style.display = p.dataset.pane === t ? '' : 'none'; });
  const chip = $('#impChip'), ct = $('#impChipText');
  if (chip && ct) {
    chip.className = 'chip ' + (t === 'notice' && UI.ocr.dataUrl ? 'amber' : 'teal');
    ct.textContent = t === 'timetable' ? '课表导入' : (UI.ocr.dataUrl ? '在线 OCR' : '通知导入');
  }
}

/* ================= 截图 OCR ================= */
function ocrServiceHost() {
  try { return new URL(DB.settings.ocrEndpoint).host; } catch (e) { return DB.settings.ocrEndpoint || 'OCR 服务'; }
}
function ocrFailSheet(err, target) {
  const raw = String(err || '');
  let title = '识别失败', msg = '没有拿到识别结果。可以换一张更清晰的截图，或直接粘贴文字。', hint = '';
  if (/429|rate limit|E584/i.test(raw)) {
    const pub = String((DB.settings && DB.settings.ocrKey) || '').trim() === SHARED_OCR_KEY;
    title = 'OCR 免费额度用完了';
    msg = pub
      ? '<b>不是截图或识别规则的问题。</b>当前用的是 OCR.space 的公共演示 Key <b>helloworld</b>，所有用户共用，今天被限流了（HTTP 429）。'
      : '你的 OCR Key 今日额度用完了（HTTP 429），等额度恢复或换一个 Key。';
    hint = pub ? '换成自己的免费 Key；填一次后只保存在本机。' : '在“我的 → 截图文字识别”里换 Key 或明天再试。';
  } else if (/401|403|apikey|api key|unauthorized/i.test(raw)) {
    title = 'OCR Key 无效';
    msg = 'OCR 服务拒绝了当前 Key，可能是 Key 写错、过期，或该接口不支持这个 Key。';
    hint = '在“我的 → 截图文字识别”里换一个可用的 Key。';
  } else if (/timeout|timed out|network|failed to connect|ENOTFOUND|ECONN/i.test(raw)) {
    title = 'OCR 网络连接失败';
    msg = '连不上 OCR 服务，可能是网络不稳定或服务暂时不可用。';
    hint = '稍后重试，或改用系统识屏把文字粘贴进来。';
  } else {
    msg = ESCHTML(raw.slice(0, 220)) || msg;
  }
  openSheet(title,
    '<p style="font-size:13.5px;line-height:1.75">' + msg + '</p>' +
    (hint ? '<div class="notice warn"><svg><use href="#i-shield"/></svg><div>' + hint + '</div></div>' : '') +
    '<p class="tip">错误码：' + ESCHTML(raw.slice(0, 120)) + '</p>',
    '<button class="btn ghost" data-act="ocr-use-paste">改用粘贴</button><button class="btn primary" data-act="ocr-goto-key">去填 Key</button>');
}
function ESCHTML(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function retryWithSharedKey(err) {
  const msg = String(err || '');
  const invalid = /401|403|E555|api key not valid|apikey/i.test(msg);
  if (!invalid) return false;
  const cur = String((DB.settings && DB.settings.ocrKey) || '').trim();
  if (cur === SHARED_OCR_KEY) return false;
  if (UI.ocr.tempSharedKey) return false; // 默认 Key 也被拒，不再重试
  UI.ocr.tempSharedKey = true; // 只对本次请求改用默认 Key，不覆盖用户设置
  diagLog('ocr', '当前 Key 被拒，本次用默认 Key 重试', { error: msg.slice(0, 200), keyLen: cur.length });
    toast('当前 OCR Key 被拒，本次改用默认 Key 重试');
  UI.ocr.busy = false;
  setTimeout(() => doOcr(), 180);
  return true;
}
function startOcr() {
  if (!UI.ocr.dataUrl) { toast('先选择一张截图'); return; }
  if (!DB.settings.ocr) { toast('在线 OCR 已关闭，可在设置里开启'); return; }
  if (!DB.settings.ocrKey) { toast('先在“截图文字识别”里填 API Key'); return; }
  if (!DB.settings.ocrConsent) {
    const pub = DB.settings.ocrKey === 'helloworld' || DB.settings.ocrKey === SHARED_OCR_KEY;
    openSheet('把这张截图发去识别？', '<p style="font-size:13.5px;line-height:1.8">接下来会把<b>当前这一张截图</b>发送到 <b>' + ESC(ocrServiceHost()) + '</b> 做文字识别。<br><br>截图可能包含姓名、学号、群号等个人信息；服务商可能保存图片。你也可以取消，改用系统识屏或直接粘贴文字。</p>' +
      (pub ? '<div class="notice warn"><svg><use href="#i-shield"/></svg><div>当前使用公共演示 Key（helloworld），额度有限；只上传课程通知截图，不要上传与课程无关的隐私图片。若提示额度用完，可在「我的 → 截图文字识别」填自己的免费 Key。</div></div>' : '') +
      '<div class="notice warn"><svg><use href="#i-shield"/></svg><div>只发送这一张图，不发送课程卡片、待办或历史记录。</div></div>',
      '<button class="btn ghost" data-act="close-sheet">取消</button><button class="btn primary" data-act="ocr-consent-yes">同意并识别</button>');
    return;
  }
  doOcr();
}
function doOcr() {
  if (UI.ocr.busy) { toast('正在识别中，请稍等'); return; }
  UI.ocr.busy = true;
  const btn = $('#ocrRun');
  if (btn) { btn.disabled = true; btn.textContent = '识别中…'; }
  const comma = UI.ocr.dataUrl.indexOf(',');
  const b64 = comma >= 0 ? UI.ocr.dataUrl.slice(comma + 1) : UI.ocr.dataUrl;
  const key = UI.ocr.tempSharedKey ? SHARED_OCR_KEY : String(DB.settings.ocrKey || '').trim();
  try { Bridge.ocr(b64, 'image/jpeg', DB.settings.ocrEndpoint, key, DB.settings.ocrLang); }
  catch (e) { UI.ocr.busy = false; toast('无法调用 OCR：' + e.message); if (UI.ocr.target !== 'task') renderImport(); }
}

function detectSourceApp(meta, text) {
  meta = meta || {};
  const t = String(text || '');
  // 文本线索优先于文件名：钉钉截图常被命名为 qq.jpg / Screenshot_*.jpg
  if (/钉钉|DingTalk/i.test(t)) return { key: 'dingtalk', name: '钉钉群', confidence: 0.93 };
  if (/小小鼓励|团队更凝聚|群内鼓励/.test(t)) return { key: 'dingtalk', name: '钉钉群', confidence: 0.9 };
  if (/内部群/.test(t) && !/QQ群|qq群|QQ\s*群/i.test(t)) return { key: 'dingtalk', name: '钉钉群', confidence: 0.88 };
  if (/QQ群|qq群|QQ\s*群|群号\s*[:：]?\s*\d{5,}/i.test(t)) return { key: 'qq', name: 'QQ群', confidence: 0.9 };
  if (/已读\s*[（(]\s*\d|未读\s*[（(]\s*\d|点赞\s*[（(]\s*\d/.test(t) && /群/.test(t)) return { key: 'dingtalk', name: '钉钉群', confidence: 0.8 };
  if (/微信群|公众号|订阅号|朋友圈|拍了拍|文件传输助手/.test(t)) return { key: 'wechat', name: '微信群', confidence: 0.8 };
  if (/学习通|超星/.test(t)) return { key: 'chaoxing', name: '学习通', confidence: 0.75 };
  if (/雨课堂/.test(t)) return { key: 'yuketang', name: '雨课堂', confidence: 0.75 };
  if (/智慧树/.test(t)) return { key: 'zhihuishu', name: '智慧树', confidence: 0.75 };

  const hay = ((meta.path || '') + ' ' + (meta.name || '')).toLowerCase();
  const rules = [
    ['dingtalk', /dingtalk|钉钉/, '钉钉群', 0.9],
    ['qq', /(^|[\/_\- ])qq([\/_\- .]|$)|qq群|qq截图/, 'QQ群', 0.88],
    ['wechat', /wechat|weixin|微信|mmexport/, '微信群', 0.88],
    ['chaoxing', /chaoxing|学习通|超星/, '学习通', 0.85],
    ['yuketang', /yuketang|雨课堂/, '雨课堂', 0.85],
    ['zhihuishu', /zhihuishu|智慧树/, '智慧树', 0.85]
  ];
  for (const r of rules) if (r[1].test(hay)) return { key: r[0], name: r[2], confidence: r[3] };
  if (/screenshot|screenshots|截屏|截图/.test(hay)) return { key: 'screenshot', name: '系统截图', confidence: 0.6 };
  return { key: 'screenshot', name: '系统截图', confidence: 0.35 };
}
function cleanOcrText(text) {

  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(/学刁通/g, '学习通').replace(/雨课室/g, '雨课堂').replace(/智慧村/g, '智慧树')
       .replace(/超星学习通/g, '学习通').replace(/学习迩/g, '学习通').replace(/雨课棠/g, '雨课堂');
  t = t.replace(/([\u4e00-\u9fa5])[ \t\u00a0]+(?=[\u4e00-\u9fa5])/g, '$1');
  const junk = [
    /^(返回|取消|完成|发送|更多|关闭|知道了|确定|好|嗯|我|通讯录|发现|微信|QQ|群聊|聊天信息)$/,
    /^(按住|按住说话|按住 说话|语音|表情|相册|拍摄|文件|位置|红包|转账)/,
    /^\d{1,3}%$/, /^(4G|5G|WiFi|WIFI|无服务|中国移动|中国联通|中国电信)$/,
    /^[·•.\-_=]{2,}$/
  ];
  const lines = t.split('\n').map(x => x.trim()).filter(Boolean).filter(x => !junk.some(re => re.test(x)));
  return lines.join('\n').trim();
}
function stripCourseLead(s) {
  return String(s || '')
    .replace(/^(今天|明天|后天|大后天|本周|这周|下周|周[一二三四五六日天]|星期[一二三四五六日天])/, '')
    .replace(/^\d{1,2}\s*[月\/.]\s*\d{1,2}\s*[日号]?/, '')
    .replace(/^(上午|下午|晚上|中午|凌晨)/, '')
    .replace(/^\d{1,2}\s*[:：点]\s*\d{0,2}\s*(分|半)?/, '')
    .replace(/^(前|之前|以前)/, '')
    .replace(/(之前|以前|前)$/, '')
    .replace(/(交|提交|完成|做|发|上传|截止)$/g, '')
    .trim();
}
function guessCourseName(text, parsed) {
  const t = String(text || '');
  for (const c of DB.courses || []) {
    if (!c.course || c.course === '未识别课程') continue;
    if (t.indexOf(c.course) >= 0) return c.course;
    const core = c.course.replace(/^(大学|高等|基础|中国|现代)/, '');
    if (core.length >= 2 && t.indexOf(core) >= 0) return c.course;
    if (c.teacher && t.indexOf(c.teacher) >= 0) return c.course;
  }
  let m = t.match(/(?:课程|科目)\s*[：:]\s*([^\n，。；;,]{2,20})/);
  if (m) { const g = stripCourseLead(m[1]); if (g.length >= 2) return g; }
  m = t.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,18})\s*(?:课程)?\s*(?:的)?\s*(?:通知|作业|实验|考试|测验|签到)/);
  if (m) {
    const g = stripCourseLead(m[1]);
    if (g.length >= 2 && !/学习通|雨课堂|智慧树|QQ|微信|通知|课程|作业|提交|截止/.test(g)) return g;
  }
  const lines = t.split('\n').map(x => x.replace(/^【[^】]*】|^关于|^课程通知|^通知[：:]?/g, '').trim());
  for (const l of lines) {
    const g = stripCourseLead(l);
    if (g.length >= 2 && g.length <= 20 && /^[\u4e00-\u9fa5A-Za-z0-9·\- ]+$/.test(g) &&
        !/周[一二三四五六日天]|星期|截止|前|通知|群|老师|平台|完成|提交|签到|学习通|雨课堂|智慧树|QQ|微信|作业|实验|考试|^\d+$/.test(g)) return g;
  }
  return '待补充课程';
}
function prepareParsed(parsed, raw, sourceApp) {
  parsed = parsed || {};
  parsed.raw_text = raw || parsed.raw_text || '';
  parsed.source_app = sourceApp || detectSourceApp(null, raw);
  if (!parsed.course || parsed.course === '未识别课程') {
    parsed.course = guessCourseName(raw, parsed);
    parsed.confidence = parsed.confidence || {};
    parsed.confidence.course = 0.35;
  }
  const map = { chaoxing: '学习通', yuketang: '雨课堂', zhihuishu: '智慧树' };
  const pname = map[parsed.source_app.key];
  if (pname && !(parsed.platforms || []).some(p => p.name === pname)) {
    const def = (Parser.PLATFORMS || []).find(p => p.name === pname);
    parsed.platforms = parsed.platforms || [];
    parsed.platforms.push(def ? { name: def.name, purpose: '查看通知', entry_type: def.type || 'web', entry_value: def.url || '', fallback: '复制链接' } : { name: pname, purpose: '查看通知', entry_type: 'web', entry_value: '', fallback: '复制链接' });
  }
  return parsed;
}

function rememberImport(before, label) {
  UI.lastImport = { before: before, label: label || '自动导入', at: Date.now() };
}
function undoImport() {
  if (!UI.lastImport) { toast('没有可撤销的自动导入'); return; }
  try {
    DB.courses = JSON.parse(UI.lastImport.before);
    saveDB(); syncReminders();
    toast('已撤销上次自动导入');
  } catch (e) { toast('撤销失败'); }
  UI.lastImport = null;
  go('#/home'); renderHome();
}
function resetOcrState() {
  UI.ocr = { dataUrl: '', name: '', text: '', raw: '', overlay: null, busy: false, target: 'notice', source_app: null };
}

function autoSaveBatch(list, source, sourceApp) {
  if (!list || !list.length) { toast('没有解析出课程'); return; }
  const before = JSON.stringify(DB.courses);
  let saved = 0, last = null;
  list.forEach(c => {
    c.source = source || '课表导入';
    if (sourceApp) c.source_app = sourceApp;
    if (!c.raw_text || c.raw_text.length > 3000) c.raw_text = '（来自' + c.source + '）';
    c.tool = source === 'PDF 课表' ? 'pdf.js + 文本坐标还原' : (source === '截图 OCR' ? 'OCR + 表格版式还原' : '本地课表解析器');
    const r = mergeIntoDB(c);
    if (r && r.c) { last = r.c; saved++; }
  });
  if (!saved) { toast('没有可保存的课程'); return; }
  rememberImport(before, source || '课表导入');
  saveDB(); syncReminders();
  ledgerAdd({ stage: '课表导入', tool: source === 'PDF 课表' ? 'pdf.js + 本地解析' : '本地课表解析', prompt: '按周几/节次/周次还原课程', input: source + '：' + list.length + ' 门', output: '自动保存 ' + saved + ' 门课程', human: '无需人工确认，保存后可直接编辑', reviewer: '用户' });
  toast('已自动保存 ' + saved + ' 门课 · ' + (last ? last.course : '') + '（可撤销）');
  resetOcrState();
  go('#/home');
}

function startBatch(list, source, sourceApp) {
  autoSaveBatch(list, source, sourceApp);
}

function timetableFallback(text) {
  const list = Parser.parseTimetable(text, '截图 OCR');
  if (list.length) { startBatch(list, '截图 OCR', UI.ocr.source_app); return; }
  if (UI.ocr.target === 'timetable') { toast('没识别出课表行，请检查文字里的“周几 + 节次/时间”'); return; }
  const parsed = Parser.extract(text, '截图 OCR');
  parsed.source = '截图 OCR';
  startConfirm(parsed, text, '截图 OCR', UI.ocr.source_app);
}

function b64Bytes(dataUrl) {
  const b64 = dataUrl.indexOf(',') >= 0 ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// file:// 下 fetch 不能读本地 cmap；用 XHR + 自定义 CMapReaderFactory，避免 worker
function loadCmapBuf(url) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.responseType = 'arraybuffer';
    x.onload = () => resolve(x.response);
    x.onerror = () => reject(new Error('无法读取 ' + url));
    x.send();
  });
}
function LocalCMapFactory(opts) {
  this.baseUrl = (opts && opts.baseUrl) || 'vendor/cmaps/';
  this.isCompressed = true;
}
LocalCMapFactory.prototype.fetch = function (ref) {
  const self = this;
  return loadCmapBuf(self.baseUrl + ref.name + '.bcmap').then(buf => ({
    cMapData: new Uint8Array(buf), compressionType: 1
  }));
};

async function parsePdfFile(dataUrl, name) {
  if (!window.pdfjsLib) { toast('PDF 组件未加载，请重新安装 App'); return; }
  UI.pdfBusy = true;
  toast('正在本地解析 PDF…');
  try {
    const bytes = b64Bytes(dataUrl);
    const doc = await pdfjsLib.getDocument({
      data: bytes, cMapUrl: 'vendor/cmaps/', cMapPacked: true,
      disableWorker: true, CMapReaderFactory: LocalCMapFactory
    }).promise;
    const pages = [];
    for (let pn = 1; pn <= doc.numPages; pn++) {
      const page = await doc.getPage(pn);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const items = [];
      tc.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const pt = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
        items.push({ text: it.str, x: pt[0], y: pt[1], w: it.width || 0, h: it.height || 0 });
      });
      pages.push({ width: vp.width, height: vp.height, items: items });
    }
    const list = Parser.parsePdfTimetable(pages, 'PDF 课表');
    if (!list.length) throw new Error('没有找到“星期X + (节次)周次”的课程块');
    startBatch(list, 'PDF 课表', { key: 'pdf', name: 'PDF 课表', confidence: 1 });
    toast('已从 PDF 还原 ' + list.length + ' 门课程');
    ledgerAdd({ stage: 'PDF 课表导入', tool: 'pdf.js + 本地课表解析器', prompt: '按 PDF 文本坐标还原周几/节次/周次', input: (name || 'PDF') + '（' + doc.numPages + ' 页，未上传）', output: JSON.stringify(list), human: '自动保存，可直接编辑', reviewer: '自动' });
  } catch (e) {
    console.error(e);
    diagLog('error', 'PDF 解析失败', { message: e.message || '格式不支持' });
    toast('PDF 解析失败：' + (e.message || '格式不支持'));
  } finally {
    UI.pdfBusy = false;
  }
}

const SOURCE_CHOICES = [
  { key: 'dingtalk', name: '钉钉群', desc: '群通知 / 作业' },
  { key: 'qq', name: 'QQ群', desc: '群通知 / 作业' },
  { key: 'wechat', name: '微信群', desc: '群通知 / 作业' },
  { key: 'chaoxing', name: '学习通', desc: '课程通知 / 作业' },
  { key: 'yuketang', name: '雨课堂', desc: '课程通知 / 签到' },
  { key: 'other', name: '其他来源', desc: '如上表 / 教务' }
];
function courseSourceKey(course) { const k = normName(course || ''); return (!k || /未识别|待补充/.test(k)) ? '__unknown__' : k; }
function sourceAppOf(key) { const o = SOURCE_CHOICES.find(x => x.key === key) || { key: 'other', name: '其他来源' }; return { key: o.key, name: o.name, confidence: 1 }; }
function applySourceApp(parsed, app) {
  if (!parsed || !app) return parsed;
  parsed.source_app = app;
  if (parsed.group_info && parsed.group_info.value && /群$/.test(app.name || '')) parsed.group_info.type = app.name;
  return parsed;
}
function rememberSource(course, app) {
  if (!app) return;
  DB.settings.sourceLast = app;
  if (course) DB.settings.sourceMemory[courseSourceKey(course)] = app;
  saveDB();
}
function handleNoticeParsed(parsed, raw, sourceApp) {
  const ck = courseSourceKey(parsed.course);
  let mem = DB.settings.sourceMemory[ck];
  if (!mem && ck === '__unknown__') mem = DB.settings.sourceLast;
  if (mem) {
    applySourceApp(parsed, mem);
    autoSaveParsed(parsed, raw, '截图 OCR', mem);
    return;
  }
  const candidate = sourceApp || parsed.source_app || detectSourceApp(null, raw);
  UI.sourcePrompt = { parsed: parsed, raw: raw, autoApp: candidate, key: ck };
  const auto = candidate && candidate.key !== 'screenshot' ? '自动判断：' + ESC(candidate.name) + '，可以改。' : '没看出来源，请选一下。';
  openSheet('这张截图来自哪里？',
    '<p class="tip">第一次遇到《' + ESC(parsed.course || '这门课') + '》的截图。选一次后我会记住，以后同一门课的同类截图自动套用。</p>' +
    '<div class="src-grid">' + SOURCE_CHOICES.map(o => '<button class="src-opt" data-act="source-pick" data-key="' + o.key + '"><b>' + o.name + '</b><span>' + o.desc + '</span></button>').join('') + '</div>' +
    '<p class="tip">' + auto + '</p>',
    '<button class="btn ghost" data-act="source-skip">先不判断，直接保存</button>');
}
function sourceOptionsSheet(prefix, extra, title) {
  openSheet(title || '修改来源',
    '<p class="tip">只改来源标签，课程和待办不变。</p><div class="src-grid">' + SOURCE_CHOICES.map(o => '<button class="src-opt" data-act="' + prefix + '" data-key="' + o.key + '" ' + (extra || '') + '><b>' + o.name + '</b><span>' + o.desc + '</span></button>').join('') + '</div>',
    '<button class="btn ghost" data-act="close-sheet">取消</button>');
}

function autoSaveParsed(parsed, raw, source, sourceApp) {
  const before = JSON.stringify(DB.courses);
  const srcApp = sourceApp || parsed.source_app || (/截图|图片/.test(source || '') ? detectSourceApp(null, raw) : { key: 'text', name: '文本导入', confidence: 1 });
  parsed = prepareParsed(parsed, raw, srcApp);
  parsed.source = source || parsed.source || '用户粘贴';
  const r = mergeIntoDB(parsed);
  rememberImport(before, source || '自动导入');
  saveDB(); syncReminders();
  const app = parsed.source_app && parsed.source_app.name && parsed.source_app.key !== 'screenshot' && parsed.source_app.key !== 'text' ? ' · 来自 ' + parsed.source_app.name : '';
  const ntask = (parsed.tasks || []).length;
  diagLog('save', '自动保存课程', { tasks: ntask, source: source || '自动导入' });
  ledgerAdd({ stage: '自动保存', tool: parsed.tool || '本地规则引擎 v1', prompt: '自动识别并保存：课程/教师/平台/任务/来源 App', input: raw, output: JSON.stringify(parsed), human: '自动保存，可在课程详情编辑或撤销', reviewer: '自动' });
  toast('已自动保存：' + parsed.course + app + (ntask ? ' · ' + ntask + ' 个待办' : '') + '（可撤销）');
  resetOcrState();
  go('#/course/' + r.c.id);
}

function startConfirm(parsed, raw, source, sourceApp) {
  autoSaveParsed(parsed, raw, source, sourceApp);
}

function importICS(text, name) {
  try {
    const list = Parser.parseICS(text, 'iCal：' + (name || '文件'));
    if (!list.length) throw new Error('没有解析到课程');
    autoSaveBatch(list, 'iCal 导入');
  } catch (e) { toast(e.message || 'iCal 解析失败'); }
}

function importBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { toast('备份文件不是有效 JSON'); return; }
  if (!d || !Array.isArray(d.courses)) { toast('备份格式不正确'); return; }
  openSheet('导入备份', '<p class="small">备份包含 <b>' + d.courses.length + '</b> 门课程。选择导入方式：</p>' +
    '<div class="tip">覆盖会清空当前课程与待办；合并会按课程名去重后追加。</div>',
    '<button class="btn ghost" data-act="close-sheet">取消</button>' +
    '<button class="btn soft" data-act="backup-merge">合并导入</button>' +
    '<button class="btn danger" data-act="backup-replace">覆盖导入</button>', () => { UI.backupData = d; });
}

/* ================= 确认 / 编辑器 ================= */
function confChip(v) {
  v = +v || 0;
  const cls = v >= 0.7 ? 'teal' : 'amber';
  return '<span class="chip ' + cls + '">置信度 ' + Math.round(v * 100) + '%</span>';
}
function low(v) { return (+v || 0) < 0.7; }
function marksOf(pid) { if (!UI.marks[pid]) UI.marks[pid] = {}; return UI.marks[pid]; }
function markBtn(pid, field, v) {
  if (!low(v)) return '';
  const m = marksOf(pid)[field];
  return '<button class="chip ' + (m ? 'teal' : 'amber') + '" data-act="mark-field" data-field="' + field + '">' +
    (m ? '✓ 已核对' : '待核对') + '</button>';
}

function editorForm(d, pid) {
  const c = d.confidence || {};
  const isConfirm = !!pid;
  const platforms = d.platforms || [];
  const tasks = d.tasks || [];
  const platOptions = ['提交作业', '签到', '考试', '查看通知', '讨论', '直播上课', '下载资料', '群内通知'];
  return '<div class="field ' + (low(c.course) ? 'lowfield' : '') + '"><div class="fhead"><label>课程名 ' + confChip(c.course) + '</label>' +
    (isConfirm ? markBtn(pid, 'course', c.course) : '') + '</div>' +
    '<input class="input" data-f="course" value="' + ESC(d.course) + '" placeholder="如：大学英语"></div>' +
    '<div class="form-row"><div class="field ' + (low(c.teacher) ? 'lowfield' : '') + '" style="flex:1"><div class="fhead"><label>教师 ' + confChip(c.teacher) + '</label>' +
    (isConfirm ? markBtn(pid, 'teacher', c.teacher) : '') + '</div>' +
    '<input class="input" data-f="teacher" value="' + ESC(d.teacher || '') + '" placeholder="可留空"></div>' +
    '<div class="field" style="flex:1"><label>学期 / 备注</label><input class="input" data-f="schedule" value="' + ESC(d.schedule || '') + '" placeholder="如：周二 3-4 节"></div></div>' +

    '<div class="editor-block"><div class="eb-head"><b>平台入口</b><div>' + (isConfirm ? markBtn(pid, 'platforms', c.platforms) : '') + confChip(c.platforms) + ' <button class="linkbtn" data-act="add-platform">+ 添加</button></div></div>' +
    (platforms.length ? platforms.map((p, i) => '<div class="plat-edit">' +
      '<div class="pe-top"><input class="input sm" data-pf="' + i + '.name" value="' + ESC(p.name) + '" placeholder="平台名">' +
      '<select class="select sm" data-pf="' + i + '.purpose">' + (platOptions.includes(p.purpose) ? '' : '<option selected>' + ESC(p.purpose || '查看通知') + '</option>') + platOptions.map(o => '<option ' + (p.purpose === o ? 'selected' : '') + '>' + o + '</option>').join('') + '</select>' +
      '<button class="icon-btn plain" style="width:26px;height:26px" data-act="remove-platform" data-i="' + i + '"><svg style="width:15px;height:15px"><use href="#i-trash"/></svg></button></div>' +
      '<div class="pe-url"><select class="select" style="width:92px;flex:none" data-pf="' + i + '.entry_type">' +
      [['web', '网页'], ['app', 'App'], ['group', '群'], ['article', '文章']].map(([v, l]) => '<option value="' + v + '" ' + (p.entry_type === v ? 'selected' : '') + '>' + l + '</option>').join('') + '</select>' +
      '<input class="input" data-pf="' + i + '.entry_value" value="' + ESC(p.entry_value || '') + '" placeholder="https://… 或 App scheme / 群号"></div>' +
      '</div>').join('') : '<p class="tip">还没有平台入口，点“+ 添加”补一个。</p>') +
    '<p class="tip">入口指向平台首页，登录后自己找对应课程；打不开时用卡片里的“复制”降级。</p></div>' +

    '<div class="editor-block"><div class="eb-head"><b>任务与截止</b><div>' + (isConfirm ? markBtn(pid, 'tasks', c.tasks) : '') + confChip(c.tasks) + ' <button class="linkbtn" data-act="add-task">+ 添加</button></div></div>' +
    (tasks.length ? tasks.map((t, i) => '<div class="task-edit">' +
      '<div class="pe-top"><input class="input sm" data-tf="' + i + '.name" value="' + ESC(t.name) + '" placeholder="任务名">' +
      '<button class="icon-btn plain" style="width:26px;height:26px" data-act="remove-task" data-i="' + i + '"><svg style="width:15px;height:15px"><use href="#i-trash"/></svg></button></div>' +
      '<div style="margin-bottom:8px"><label class="flabel">截止时间</label><input class="input sm" type="datetime-local" data-tf="' + i + '.deadline" value="' + ESC((t.deadline || '').slice(0, 16)) + '">' + (t.deadline_default ? '<div class="tip">默认取课前 10 小时；22:00–06:00 改为前一天 21:00，可改或清空</div>' : '') + '</div>' +
      '<div><label class="flabel">关联平台</label><input class="input sm" data-tf="' + i + '.platform" value="' + ESC(t.platform || '') + '" placeholder="如：学习通（可留空）"></div>' +
      '</div>').join('') : '<p class="tip">没有识别到任务，可手动补一条；也可以先只存课程入口。</p>') +
    '</div>' +

    '<div class="editor-block"><div class="eb-head"><b>群 / 公众号</b>' +
    (d.group_info ? '<button class="linkbtn" data-act="remove-group">删除</button>' : '<button class="linkbtn" data-act="add-group">+ 添加</button>') + '</div>' +
    (d.group_info ? '<div class="form-row"><div style="flex:1"><label class="flabel">类型</label><select class="select sm" data-gf="type">' +
      ['QQ群', '微信群', '钉钉群', '公众号'].map(o => '<option ' + (d.group_info.type === o ? 'selected' : '') + '>' + o + '</option>').join('') + '</select></div>' +
      '<div style="flex:1.4"><label class="flabel">群号 / 名称</label><input class="input sm" data-gf="value" value="' + ESC(d.group_info.value || '') + '"></div></div>' +
      '<div style="margin-top:7px"><label class="flabel">群邀请链接（可选）</label><input class="input sm" data-gf="link" value="' + ESC(d.group_info.link || '') + '" placeholder="https://qr.dingtalk.com/action/joingroup?..."></div>' +
      '<p class="tip" style="margin-top:5px">粘贴钉钉群邀请链接后，课程卡可直接打开群聊；没有链接时会打开钉钉群列表。</p>'
      : '<p class="tip">群入口无法直达，保存后卡片会提供“复制群号”。</p>') + '</div>';
}

function renderConfirm() {
  const p = UI.current;
  const d = UI.editor.data;
  const exist = DB.courses.find(c => normName(c.course) === normName(d.course));
  const m = marksOf(p.id);
  const lowCount = ['course', 'teacher', 'platforms', 'tasks'].filter(k => low((d.confidence || {})[k])).length;
  const markedCount = ['course', 'teacher', 'platforms', 'tasks'].filter(k => low((d.confidence || {})[k]) && m[k]).length;
  app.innerHTML = '<div class="page">' +
    '<div class="topbar"><button class="icon-btn plain" data-act="back"><svg><use href="#i-back"/></svg></button><div class="t">确认识别结果</div><div class="spacer"></div><span class="chip ghost">' + ESC(p.source) + '</span></div>' +
    '<div class="wrap">' +
    '<div class="notice"><svg><use href="#i-spark"/></svg><div>AI 先帮你抽出了这些信息。标黄字段不太确定，请对照原文核对；点“待核对”可逐条标记。</div></div>' +
    (exist ? '<div class="notice warn mt12"><svg><use href="#i-flag"/></svg><div>已存在同名课程《' + ESC(exist.course) + '》，确认后会<b>增量合并</b>平台和任务，不重复建卡。</div></div>' : '') +
    '<div class="conf-bar"><span>低置信度 ' + lowCount + ' 项</span><span style="color:#C3C7D4">·</span><span>已核对 ' + markedCount + '/' + lowCount + '</span>' +
    (lowCount ? '<button class="linkbtn" style="margin-left:auto" data-act="mark-all">全部标记已核对</button>' : '') + '</div>' +
    editorForm(d, p.id) +
    '<div class="field"><label>原始文本（对照用）</label><div class="rawbox">' + ESC(p.raw_text) + '</div></div>' +
    '<button class="btn primary block" data-act="editor-save" style="margin-top:6px">确认并保存' + (lowCount ? '（已核对 ' + markedCount + '/' + lowCount + '）' : '') + '</button>' +
    '<button class="btn ghost block mt8" data-act="discard-pending">放弃这次识别</button>' +
    '<div style="height:20px"></div></div></div>';
}

function renderEditorPage(title) {
  if (!UI.editor) { go('#/home'); return; }
  const d = UI.editor.data;
  app.innerHTML = '<div class="page">' +
    '<div class="topbar"><button class="icon-btn plain" data-act="back"><svg><use href="#i-back"/></svg></button><div class="t">' + title + '</div></div>' +
    '<div class="wrap">' + editorForm(d, '') +
    '<button class="btn primary block" data-act="editor-save">保存</button>' +
    '<div style="height:20px"></div></div></div>';
}

function blankCourse() {
  return {
    id: uid('crs'), course: '', teacher: '', platforms: [], tasks: [], group_info: null, schedule: '', sessions: [],
    confidence: { course: 1, teacher: 1, platforms: 1, tasks: 1 },
    source: '手动补录', raw_text: '', created_at: nowISO(), updated_at: nowISO()
  };
}

function collectEditor() {
  const d = UI.editor.data;
  $$('[data-f]').forEach(el => { d[el.dataset.f] = el.value; });
  $$('[data-pf]').forEach(el => {
    const [i, k] = el.dataset.pf.split('.');
    if (!d.platforms[i]) return;
    d.platforms[i][k] = el.value;
  });
  $$('[data-tf]').forEach(el => {
    const [i, k] = el.dataset.tf.split('.');
    if (!d.tasks[i]) return;
    let v = el.value;
    if (k === 'deadline' && v && v.length === 16) v += ':00';
    if (k === 'deadline' && v !== d.tasks[i].deadline) {
      d.tasks[i].deadline_default = false;
      d.tasks[i].remindAt = '';
      d.tasks[i].deadline_label = '';
      d.tasks[i].deadline_note = '';
    }
    d.tasks[i][k] = v;
  });
  $$('[data-gf]').forEach(el => {
    if (!d.group_info) d.group_info = { type: 'QQ群', value: '', fallback: '复制群号' };
    d.group_info[el.dataset.gf] = el.value;
  });
  if (d.group_info && !(d.group_info.value || '').trim() && !(d.group_info.link || '').trim()) d.group_info = null;
  d.platforms = d.platforms.filter(p => (p.name || '').trim());
  d.tasks = d.tasks.filter(t => (t.name || '').trim());
  d.updated_at = nowISO();
  return d;
}

function defaultTaskTime(start) {
  const due = new Date(start.getTime() - DEFAULT_BEFORE_CLASS_HOURS * 3600000);
  const h = due.getHours();
  if (h >= DEFAULT_NIGHT_FROM || h < DEFAULT_NIGHT_TO) {
    // 深夜不提醒：改到上课前一天 21:00
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const prev = new Date(day.getTime() - 86400000);
    prev.setHours(DEFAULT_NIGHT_HOUR, 0, 0, 0);
    return { due: prev, night: true, fallback: false };
  }
  return { due: due, night: false, fallback: false };
}

function nextTaskDeadline(c) {
  let best = null;
  (c.sessions || []).forEach(s => {
    const start = nextSessionAt(s);
    if (!start) return;
    const cand = defaultTaskTime(start);
    let item = cand;
    if (cand.due.getTime() <= Date.now() + 60000) {
      // 离上课太近，10 小时前已经过去：尽快提醒，但仍给出具体时间
      item = { due: new Date(Date.now() + 10 * 60000), night: cand.night, fallback: true };
    }
    if (!best || item.due < best.due) best = item;
  });
  return best;
}

function applyDefaultDeadlines(c) {
  if (!c || !(c.sessions || []).length) return false;
  const cand = nextTaskDeadline(c);
  if (!cand) return false;
  let changed = false;
  (c.tasks || []).forEach(t => {
    if (t.status === '已完成' || t.deadline) return;
    t.deadline = isoAt(cand.due);
    t.remindAt = isoAt(cand.due);
    t.deadline_default = true;
    t.deadline_label = cand.fallback ? '默认尽快提醒' : (cand.night ? '默认前晚21:00' : '默认课前10小时');
    t.deadline_note = cand.fallback ? '默认：离上课太近，尽快提醒' : (cand.night ? '默认：课前 10 小时，深夜改为前一天 21:00' : '默认：课前 10 小时');
    changed = true;
  });
  return changed;
}

function mergeIntoDB(d) {
  const key = normName(d.course);
  let c = DB.courses.find(x => normName(x.course) === key);
  if (!c) {
    c = Object.assign(JSON.parse(JSON.stringify(d)), { id: uid('crs'), created_at: nowISO(), updated_at: nowISO(), imports: [{ at: nowISO(), source: d.source || '导入' }] });
    applyDefaultDeadlines(c);
    DB.courses.push(c);
    return { c, merged: false };
  }
  const changed = [];
  if (!c.teacher && d.teacher) { c.teacher = d.teacher; changed.push('教师'); }
  (d.platforms || []).forEach(p => {
    const old = (c.platforms || []).find(q => q.name === p.name);
    if (!old) { c.platforms.push(p); changed.push('平台 ' + p.name); }
    else if (p.entry_value && p.entry_value !== old.entry_value) { old.entry_value = p.entry_value; old.purpose = p.purpose; changed.push('入口 ' + p.name); }
  });
  (d.tasks || []).forEach(t => {
    const old = (c.tasks || []).find(q => normName(q.name) === normName(t.name) && (q.deadline || '').slice(0, 10) === (t.deadline || '').slice(0, 10));
    if (!old) { c.tasks.push(t); changed.push('任务 ' + t.name); }
  });
  if (d.group_info && (d.group_info.value || d.group_info.link) && !(c.group_info && c.group_info.value)) { c.group_info = d.group_info; changed.push('群信息'); }
  else if (d.group_info && c.group_info) {
    if (d.group_info.link && !c.group_info.link) { c.group_info.link = d.group_info.link; changed.push('群链接'); }
    if (d.group_info.type && /钉钉/.test(d.group_info.type) && c.group_info.type !== d.group_info.type) { c.group_info.type = d.group_info.type; changed.push('群类型'); }
  }
  if (d.source_app && (!c.source_app || (d.source_app.confidence || 0) >= (c.source_app.confidence || 0))) c.source_app = d.source_app;
  if (d.sessions && d.sessions.length) {
    c.sessions = c.sessions || [];
    d.sessions.forEach(s => {
      const old = c.sessions.find(q => q.weekday === s.weekday && q.start === s.start && q.end === s.end && q.location === s.location);
      if (!old) { c.sessions.push(s); changed.push('上课时间'); }
      else if (s.weeks && s.weeks.length) {
        const set = {}; (old.weeks || []).concat(s.weeks).forEach(w => set[w] = 1);
        old.weeks = Object.keys(set).map(Number).sort((a, b) => a - b);
        if (!old.weeksText) old.weeksText = s.weeksText;
      }
    });
  }
  if (d.schedule && (!c.schedule || c.schedule.indexOf(d.schedule) < 0)) c.schedule = c.schedule ? c.schedule + ' / ' + d.schedule : d.schedule;
  applyDefaultDeadlines(c);
  c.confidence = Object.assign({}, c.confidence || {}, d.confidence || {});
  c.raw_text = c.raw_text ? (c.raw_text + '\n\n---\n' + d.raw_text) : d.raw_text;
  if (c.raw_text.length > 8000) c.raw_text = c.raw_text.slice(-8000);
  c.updated_at = nowISO();
  c.imports = c.imports || [];
  c.imports.unshift({ at: nowISO(), source: d.source || '导入' });
  return { c, merged: true, changed };
}

function saveEditor() {
  const d = collectEditor();
  if (!d.course || !d.course.trim()) { toast('请填写课程名'); return; }
  if (UI.editor.mode === 'confirm') {
    const p = DB.pending.find(x => x.id === UI.editor.pid);
    const human = p ? diffSummary(p.parsed, d) : '人工确认';
    const r = mergeIntoDB(d);
    DB.pending = DB.pending.filter(x => x.id !== UI.editor.pid);
    saveDB();
    ledgerAdd({ stage: '人工确认', tool: '人工核对', prompt: '用户对照原文确认/修改抽取结果', input: p ? p.raw_text : d.raw_text, output: JSON.stringify(d), human: human, reviewer: '用户' });
    syncReminders();
    toast(r.merged ? '已合并到已有课程' : '已生成课程入口');
    go('#/course/' + r.c.id);
  } else if (UI.editor.mode === 'edit') {
    const c = courseById(UI.editor.cid);
    if (!c) { go('#/home'); return; }
    const old = JSON.stringify(c);
    Object.assign(c, d, { id: c.id, updated_at: nowISO() });
    saveDB();
    ledgerAdd({ stage: '人工编辑', tool: '人工', prompt: '编辑课程卡片', input: old.slice(0, 3000), output: JSON.stringify(c).slice(0, 4000), human: '用户手动编辑', reviewer: '用户' });
    syncReminders();
    toast('已保存');
    go('#/course/' + c.id);
  } else {
    const r = mergeIntoDB(d);
    saveDB();
    ledgerAdd({ stage: '人工补录', tool: '人工', prompt: '手动创建课程卡片', input: '', output: JSON.stringify(d), human: '用户手动录入', reviewer: '用户' });
    syncReminders();
    toast('已创建');
    go('#/course/' + r.c.id);
  }
}

function diffSummary(a, b) {
  const out = [];
  const keys = [['course', '课程名'], ['teacher', '教师'], ['schedule', '备注']];
  keys.forEach(([k, l]) => { if ((a[k] || '') !== (b[k] || '')) out.push(l + '「' + (a[k] || '空') + '」→「' + (b[k] || '空') + '」'); });
  if ((a.platforms || []).length !== (b.platforms || []).length) out.push('平台数量 ' + (a.platforms || []).length + '→' + (b.platforms || []).length);
  if ((a.tasks || []).length !== (b.tasks || []).length) out.push('任务数量 ' + (a.tasks || []).length + '→' + (b.tasks || []).length);
  const ad = (a.tasks || []).map(t => t.deadline).join(',');
  const bd = (b.tasks || []).map(t => t.deadline).join(',');
  if (ad !== bd) out.push('截止时间有调整');
  return out.length ? out.join('；') : '未修改，直接确认';
}

/* ================= 课程详情 ================= */
function renderCourse() {
  const c = UI.current;
  if (!c) { go('#/home'); return; }
  const ts = tasksOf(c);
  const open = ts.filter(t => t.status !== '已完成');
  const es = entries(c);
  const logoCls = i => i % 3 === 1 ? 't2' : (i % 3 === 2 ? 't3' : '');
  app.innerHTML = '<div class="page">' +
    '<div class="topbar"><button class="icon-btn plain" data-act="back"><svg><use href="#i-back"/></svg></button><div class="t">课程详情</div><div class="spacer"></div>' +
    '<button class="icon-btn" data-act="edit-course" data-cid="' + c.id + '"><svg><use href="#i-edit"/></svg></button></div>' +
    '<div class="hero"><div class="ht">' + ESC(c.course) + '</div><div class="hs">' + ESC(c.teacher || '未填写教师') + (c.schedule && !(c.sessions || []).length ? ' · ' + ESC(c.schedule) : '') + '</div>' +
    '<div class="hchips"><span>' + open.length + ' 项未完成</span><span>' + es.length + ' 个入口</span><span>更新于 ' + fmtDay(c.updated_at) + '</span></div></div>' +
    '<div class="detail-body">' +
    ((c.sessions && c.sessions.length) ? '<div class="section"><div class="section-head"><h2>上课时间</h2><span class="small">' + (DB.settings.classReminders === false ? '上课提醒已关闭' : '课前 ' + leadText(DB.settings.classLead) + '提醒') + '</span></div>' +
      '<div class="card" style="padding:4px 14px">' + c.sessions.map(s => {
        const nd = nextSessionAt(s);
        return '<div class="rowline"><div class="rl"><b>' + ESC(sessionText(s)) + '</b><span>' + (s.periods ? ESC(s.periods) + ' · ' : '') + (s.weeksText ? ESC(s.weeksText) + ' · ' : '') + '下次 ' + (nd ? fmtDT(nd) : '—') + '</span></div></div>';
      }).join('') + '</div>' +
      '<p class="tip">上课提醒会在课前把科目、时间、地点和最近待办一起发出来；在“我的 → 上课提醒”里改提前时间。</p></div>' : '') +
    '<div class="section"><div class="section-head"><h2>平台入口</h2><span class="small">' + es.length + ' 个</span></div>' +
    (es.length ? '<div class="card" style="padding:2px 14px">' + es.map((e, i) => '<div class="entry">' +
      '<div class="logo ' + logoCls(i) + '">' + ESC((e.name || '?').slice(0, 1)) + '</div>' +
      '<div class="et"><b>' + ESC(e.name) + '</b><span>' + ESC(e.purpose) + (e.type === 'web' ? ' · 网页' : e.type === 'app' ? ' · App' : e.type === 'group' ? ' · 群' : ' · 文章') + ' · ' + (e.type === 'group' ? (e.direct ? '可直达' : (e.dingtalk ? '需在钉钉选择' : '需复制')) : (e.value ? '可用' : '待补链接')) + '</span></div>' +
      '<div class="acts"><button class="btn xs soft" data-act="open-entry" data-cid="' + c.id + '" data-pid="' + e.pid + '">' + (e.type === 'group' ? (e.direct ? '打开' : (e.dingtalk ? '去钉钉' : '复制')) : '打开') + '</button>' +
      '<button class="icon-btn plain" style="width:30px;height:30px" data-act="copy-entry" data-cid="' + c.id + '" data-pid="' + e.pid + '"><svg style="width:16px;height:16px"><use href="#i-copy"/></svg></button></div></div>').join('') + '</div>'
      : '<div class="card" style="padding:16px"><p class="small" style="margin:0">还没有平台入口。<a class="linkbtn" href="#/edit/' + c.id + '">去添加</a></p></div>') +
    '<div class="notice mt12"><svg><use href="#i-link"/></svg><div>入口会跳转到第三方平台，本应用不登录、不读取跳转后的页面。打不开时请用复制按钮。</div></div></div>' +

    '<div class="section"><div class="section-head"><h2>关联待办</h2><div class="head-acts"><button class="linkbtn" data-act="quick-add-task" data-cid="' + c.id + '">+ 添加任务</button><a class="more" href="#/todos">全部</a></div></div>' +
    (ts.length ? '<div class="card listcard">' + ts.map(t => {
      const done = t.status === '已完成';
      const u = urgency(t.deadline);
      return '<div class="task-line ' + (done ? 'done' : '') + '"><button class="cb" data-act="toggle-task" data-cid="' + c.id + '" data-tid="' + t.id + '"><svg><use href="#i-check"/></svg></button>' +
        '<div class="tt" data-act="task-jump" data-cid="' + c.id + '" data-tid="' + t.id + '"><b>' + ESC(t.name) + '</b><span class="' + u + '">' + (t.deadline ? fmtDT(t.deadline) + ' · ' + relText(t.deadline) : '未设截止时间') + (t.deadline_default ? ' · ' + (t.deadline_label || '默认课前10小时') : '') + (t.platform ? ' · ' + ESC(t.platform) : '') + '</span></div></div>';
    }).join('') + '</div>' : '<div class="card" style="padding:16px"><p class="small" style="margin:0">还没有待办，导入一条作业通知就会自动出现。</p></div>') + '</div>' +

    (c.group_info ? (function(){
      const g = c.group_info, gl = groupLink(g), ding = isDingGroup(g);
      const hint = gl ? '已保存群链接，可直接打开；打不开时复制链接。' : (ding ? '没有群邀请链接：会打开钉钉群列表，请点对应群；可在编辑里粘贴邀请链接。' : '复制群名后在对应 App 内搜索加入。');
      return '<div class="section"><div class="section-head"><h2>群 / 公众号</h2></div><div class="card" style="padding:14px"><div class="rowline" style="padding:0">' +
      '<div class="rl" style="flex:1"><b>' + ESC(g.type) + ' · ' + ESC(g.value || '群') + '</b><span>' + hint + '</span></div>' +
      '<div class="group-acts"><button class="btn xs soft" data-act="open-group" data-cid="' + c.id + '">' + (gl ? '打开群聊' : (ding ? '去钉钉' : '复制')) + '</button>' +
      '<button class="icon-btn plain" style="width:32px;height:32px" data-act="copy-entry" data-cid="' + c.id + '" data-pid="group"><svg style="width:16px;height:16px"><use href="#i-copy"/></svg></button></div></div></div></div>';
    })() : '') +

    '<div class="section"><div class="section-head"><h2>记录</h2></div><div class="card" style="padding:4px 14px">' +
    '<div class="rowline"><div class="rl"><b>来源</b><span>' + ESC(c.source || '未知') + (c.source_app && c.source_app.key !== 'screenshot' && c.source_app.key !== 'text' ? ' · 来自 ' + ESC(c.source_app.name) : '') + ' <button class="linkbtn" data-act="source-sheet" data-cid="' + c.id + '">' + (c.source_app ? '修改来源' : '设置来源') + '</button>' + '</span></div><span class="small">' + fmtDay(c.created_at) + '</span></div>' +
    '<div class="rowline"><div class="rl"><b>最近更新</b><span>' + fmtDT(c.updated_at) + '</span></div><span class="small">' + ((c.imports || []).length) + ' 次导入</span></div>' +
    '<div class="rowline"><div class="rl"><b>原始文本</b><span>' + (c.raw_text ? '已保存在本机' : '无') + '</span></div><button class="btn xs ghost" data-act="view-raw" data-cid="' + c.id + '">查看</button></div>' +
    '</div></div>' +
    '<button class="btn ghost block mt18" data-act="merge-sheet" data-cid="' + c.id + '">合并重复课程</button>' +
    '<button class="btn danger block mt8" data-act="del-course" data-cid="' + c.id + '">删除这门课</button>' +
    '<div style="height:22px"></div></div></div>';
}

/* ================= 批量确认 ================= */
function renderBatch() {
  const b = UI.batch;
  if (!b) { go('#/import'); return; }
  const n = b.selected.filter(Boolean).length;
  app.innerHTML = '<div class="page">' +
    '<div class="topbar"><button class="icon-btn plain" data-act="back"><svg><use href="#i-back"/></svg></button><div class="t">批量确认</div><div class="spacer"></div><span class="chip ghost">' + ESC(b.source) + '</span></div>' +
    '<div class="wrap"><div class="notice"><svg><use href="#i-doc"/></svg><div>从导入内容里解析出 <b>' + b.courses.length + '</b> 门课程。勾选要保存的项，保存后可以在课程详情里补充平台入口。</div></div>' +
    '<div class="section">' + b.courses.map((c, i) => '<div class="card" style="padding:14px;margin-bottom:10px">' +
      '<div style="display:flex;gap:11px;align-items:flex-start">' +
      '<button class="cb" style="width:20px;height:20px;border:1.7px solid #C9CDDB;border-radius:7px;display:grid;place-items:center;color:#fff;background:' + (b.selected[i] ? '#4F46E5' : 'transparent') + ';border-color:' + (b.selected[i] ? '#4F46E5' : '#C9CDDB') + '" data-act="batch-toggle" data-i="' + i + '"><svg style="width:13px;height:13px;stroke-width:3;opacity:' + (b.selected[i] ? 1 : 0) + ';color:#fff"><use href="#i-check"/></svg></button>' +
      '<div style="flex:1;min-width:0"><b style="font-size:15px">' + ESC(c.course) + '</b>' +
      '<div class="course-meta">' + (c.teacher ? '<span class="chip">' + ESC(c.teacher) + '</span>' : '') +
      ((c.sessions || []).length ? '<span class="chip teal">' + c.sessions.length + ' 个时段</span>' : '') +
      (c.tasks.length ? '<span class="chip amber">' + c.tasks.length + ' 个待办</span>' : '') + '</div>' +
      (c.schedule ? '<div class="schedule-line">' + ESC(c.schedule) + '</div>' : '') +
      ((c.sessions || []).some(s => s.weeksText) ? '<p class="tip">' + c.sessions.filter(s => s.weeksText).map(s => ESC(sessionText(s) + ' · ' + s.weeksText)).join('<br>') + '</p>' : '') +
      (c.tasks.length ? '<p class="tip">' + c.tasks.map(t => ESC(t.name) + ' · ' + fmtDT(t.deadline)).join('<br>') + '</p>' : '') + '</div></div></div>').join('') + '</div>' +
    '<button class="btn primary block" data-act="batch-save" ' + (n ? '' : 'disabled') + '>保存选中的 ' + n + ' 门课程</button>' +
    '<div style="height:20px"></div></div></div>';
}

function quickTaskSheet(cid) {
  const c = courseById(cid); if (!c) return;
  UI.taskCid = cid;
  UI.ocr.target = 'task';
  openSheet('添加任务',
    '<p class="sheet-sub">加到《' + ESC(c.course) + '》。粘贴群通知，或选一张截图自动识别；识别后直接保存，不用逐项填。</p>' +
    '<div class="field"><textarea id="qtText" class="textarea" rows="5" placeholder="粘贴作业通知，例如：\n周五前提交 Unit 6 读书报告，学习通提交"></textarea></div>' +
    '<div class="row2" style="display:flex;gap:8px;margin-bottom:12px"><button class="btn soft" style="flex:1" data-act="quick-task-pick" data-cid="' + c.id + '"><svg style="width:16px;height:16px;margin-right:5px"><use href="#i-doc"/></svg>选截图识别</button>' +
    '<button class="btn soft" style="flex:1" data-act="quick-task-parse" data-cid="' + c.id + '">识别并添加</button></div>' +
    '<p class="tip">图片会在你首次同意后发到 OCR 服务；只取任务名称、截止时间和平台，课程固定为《' + ESC(c.course) + '》。</p>',
    '<button class="btn ghost" data-act="close-sheet">取消</button>');
}
function addTasksToCourse(cid, text, source) {
  const c = courseById(cid); if (!c) return false;
  const parsed = Parser.extract(String(text || ''), source || '手动粘贴');
  const list = (parsed.tasks || []).map(t => ({
    name: String(t.name || '').trim(),
    deadline: String(t.deadline || '').trim(),
    platform: String(t.platform || '').trim() || ((c.platforms || [])[0] || {}).name || '',
    type: t.type || '作业'
  })).filter(t => t.name);
  if (!list.length) { toast('没识别出任务，请换一条通知或更清晰的截图'); return false; }
  let added = 0;
  list.forEach(t => {
    const dup = (c.tasks || []).some(q => normName(q.name) === normName(t.name) && (q.deadline || '').slice(0, 10) === (t.deadline || '').slice(0, 10));
    if (dup) return;
    c.tasks = c.tasks || [];
    c.tasks.push({ id: uid('tk'), name: t.name, deadline: t.deadline, platform: t.platform, type: t.type, status: '未完成', remind: true, confidence: 1, source: source || '手动粘贴' });
    added++;
  });
  if (!added) { toast('这些任务已经在《' + c.course + '》里了'); return false; }
  const defaulted = applyDefaultDeadlines(c);
  c.updated_at = nowISO();
  diagLog('save', '课程内添加任务', { added: added, source: source || '手动粘贴' });
  ledgerAdd({ stage: '课程内添加任务', tool: source === '截图 OCR' ? 'OCR + 本地规则引擎' : '本地规则引擎', prompt: '课程详情内粘贴/截图识别任务，只加入当前课程', input: String(text || '').slice(0, 2000), output: JSON.stringify(list), human: '识别后直接保存，可编辑' });
  saveDB(); syncReminders(); closeSheet(); toast('已添加到《' + c.course + '》 · ' + added + ' 个任务');
  UI.taskCid = null; UI.ocr.target = 'notice';
  renderCourse(c.id);
  return true;
}
/* ================= 问答 ================= */
function renderAsk() {
  const first = DB.courses[0] ? DB.courses[0].course : '';
  app.innerHTML = '<div class="page">' +
    '<div class="askhead"><h1>问课程入口</h1><p>结合本地课程数据回答；不提供作业答案。</p>' +
    '<button class="chip ' + (askOnlineReady() ? 'teal' : 'amber') + '" data-act="ask-ai-setup" style="margin-top:8px">' + (askOnlineReady() ? '在线 AI' : (DB.settings.aiAsk !== false ? '在线 AI 未配置' : '本地问答')) + '</button></div>' +
    '<div class="sugs" id="sugs">' +
    [first ? first + ' 作业在哪交？' : '作业在哪交？', '这周还有什么没做？', '英语课在哪个平台签到？'].map(q => '<button data-act="ask-suggest" data-q="' + ESC(q) + '">' + ESC(q) + '</button>').join('') +
    '</div>' +
    '<div class="chat" id="chat"></div>' +
    '<div class="askbar"><div class="ib"><svg style="width:18px;height:18px;color:#A3A9BC"><use href="#i-spark"/></svg>' +
    '<input id="askInput" placeholder="例如：周三英语作业在哪交？" autocomplete="off"></div>' +
    '<button class="send" data-act="ask-send"><svg><use href="#i-arrow"/></svg></button></div></div>';
  renderChat();
  const inp = $('#askInput');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); askSend(inp.value); } });
}
function renderChat() {
  const chat = $('#chat');
  if (!chat) return;
  if (!UI.ask.length) {
    chat.innerHTML = '<div class="bubble bot">你好，我会从你导入的课程卡片里找入口和待办。<div class="src"><svg style="width:12px;height:12px"><use href="#i-shield"/></svg>' + (askOnlineReady() ? '在线 AI · 只基于本地课程数据' : '本地检索 · 未接入在线 AI') + '</div></div>';
  } else {
    chat.innerHTML = UI.ask.map(m => {
      if (m.role === 'user') return '<div class="bubble user">' + ESC(m.text) + '</div>';
      let btns = '';
      if (m.entries && m.entries.length) {
        const seen = new Set();
        btns = m.entries.filter(e => { const k = e.cid + e.pid; if (seen.has(k)) return false; seen.add(k); return true; })
          .slice(0, 4).map(e => '<button class="btn xs soft" data-act="open-entry" data-cid="' + e.cid + '" data-pid="' + e.pid + '">' + ESC(e.name) + ' · ' + ESC(e.purpose) + '</button>').join('');
      }
      return '<div class="bubble bot' + (m.pending ? ' typing' : '') + '">' + ESC(m.text).replace(/\n/g, '<br>') + (btns ? '<div class="btns">' + btns + '</div>' : '') +
        '<div class="src"><svg style="width:12px;height:12px"><use href="#i-shield"/></svg>' + (m.pending ? '在线 AI 正在查询…' : (m.online ? '在线 AI · 已结合本地数据' : '本地数据')) + ' · ' + fmtDT(m.at) + '</div></div>';
    }).join('');
  }
  const el = $('#chat');
  setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 30);
}
const ASK_PROMPT = '你是“课程入口”应用的问答助手。只依据用户提供的本地课程数据回答，不得编造课程、平台、入口、截止时间或上课地点。' +
  '不提供作业答案、解题思路或代写。回答用简体中文，简短（不超过 140 字），不要 Markdown 表格，不要输出思考过程。' +
  '优先回答入口/平台/待办/截止时间/上课时间地点/周次/来源。数据不足时明确说“本地没有记录”，并建议去课程详情补充。' +
  '问到“这周还有什么没做”时，按截止时间从早到晚列出最紧急的 3 项。';

function askOnlineReady() {
  return DB.settings.aiAsk !== false && !!DB.settings.key && !!DB.settings.endpoint;
}
function askContext() {
  const now = new Date();
  const wd = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return {
    today: fmtDT(now), weekday: wd[now.getDay() || 7],
    semester_start: DB.settings.semesterStart || '',
    semester_week: semesterWeekOf(now),
    courses: DB.courses.slice(0, 30).map(c => ({
      course: c.course, teacher: c.teacher || '',
      platforms: (c.platforms || []).map(p => ({ name: p.name, purpose: p.purpose })),
      tasks: (c.tasks || []).slice(0, 10).map(t => ({ name: t.name, deadline: t.deadline || '', status: t.status || '未完成', platform: t.platform || '' })),
      sessions: (c.sessions || []).slice(0, 8).map(x => ({ weekday: x.weekday, start: x.start, end: x.end, location: x.location || '', weeks: x.weeksText || '' })),
      group: c.group_info ? c.group_info.type : '',
      source_app: c.source_app ? c.source_app.name : ''
    }))
  };
}
function aiSetupSheet() {
  const ready = askOnlineReady(), key = !!DB.settings.key, on = DB.settings.aiAsk !== false;
  openSheet('在线 AI 问答',
    '<p style="font-size:13.5px;line-height:1.8">开启后，问题会连同<b>课程名、待办、入口用途、上课时间</b>发送到你配置的 OpenAI 兼容接口；<b>不发送原始通知、群号、学号或作业答案</b>。</p>' +
    (key ? '<p class="tip">接口：' + ESC(DB.settings.endpoint) + '<br>模型：' + ESC(DB.settings.model) + '</p>' : '<div class="notice warn"><svg><use href="#i-shield"/></svg><div>还没有配置 API Key。填好后才能使用在线问答，否则会继续用本地检索。</div></div>') +
    '<p class="tip">在线回答仍可能出错，涉及截止时间和入口时请以课程详情为准。</p>',
    '<button class="btn ghost" data-act="close-sheet">取消</button>' +
    (key ? '<button class="btn ghost" data-act="toggle-ai-ask">' + (on ? '改用本地' : '开启在线') + '</button>' : '') +
    '<button class="btn primary" data-act="goto" data-href="#/cloud">' + (key ? '接口设置' : '去填写 Key') + '</button>');
}
function responseContent(res) {
  let body = res && res.body;
  if (typeof body === 'string') body = JSON.parse(body);
  let c = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
  if (Array.isArray(c)) c = c.map(x => x.text || '').join('');
  return String(c || '').trim().replace(/^```(?:text|markdown)?\s*/i, '').replace(/```\s*$/, '').trim();
}
function localAsk(q, note) {
  const ans = answer(q);
  const text = (note ? note + '\n' : '') + ans.text;
  UI.ask.push({ role: 'bot', text, entries: ans.entries || [], at: nowISO() });
  renderChat();
  ledgerAdd({ stage: '问答', tool: '本地意图识别 + 检索 + 模板回答', prompt: '课程入口问答：入口/待办/平台', input: q, output: text, human: note || '', reviewer: '自动' });
}
function askAI(q) {
  const ctx = askContext();
  UI.askBusy = true; UI.httpMode = 'ask'; UI.askPending = { q: q, at: nowISO() };
  clearTimeout(UI.askTimer);
  UI.askTimer = setTimeout(() => { if (UI.askPending && UI.askPending.q === q) askFail(q, '在线 AI 响应超时'); }, 50000);
  UI.ask.push({ role: 'bot', text: '正在结合本地课程数据查询…', pending: true, at: nowISO() });
  renderChat();
  const body = {
    model: DB.settings.model || 'deepseek-chat',
    messages: [
      { role: 'system', content: ASK_PROMPT },
      { role: 'user', content: '问题：' + q + '\n\n本地课程数据（JSON）：\n' + JSON.stringify(ctx) }
    ],
    temperature: 0.2, stream: false, max_tokens: 500
  };
  try { Bridge.httpPost(DB.settings.endpoint, DB.settings.key, JSON.stringify(body)); }
  catch (e) { askFail(q, '请求失败：' + e.message); }
}
function askFail(q, why) {
  clearTimeout(UI.askTimer);
  UI.askBusy = false; UI.httpMode = 'cloud'; UI.askPending = null;
  UI.ask = UI.ask.filter(m => !m.pending);
  localAsk(q, '（' + why + '，已用本地检索）');
  toast('在线 AI 暂时不可用，已用本地结果');
}
function askDone(res) {
  clearTimeout(UI.askTimer);
  const pending = UI.askPending, q = pending && pending.q;
  UI.askBusy = false; UI.httpMode = 'cloud'; UI.askPending = null;
  UI.ask = UI.ask.filter(m => !m.pending);
  if (!q) { renderChat(); return; }
  if (!res || !res.ok) { askFail(q, '在线 AI 暂时不可用' + (res && res.status ? ' · HTTP ' + res.status : '')); return; }
  let text = '';
  try { text = responseContent(res); } catch (e) { text = ''; }
  if (!text) { askFail(q, '在线 AI 没有返回内容'); return; }
  if (/^\{/.test(text)) { try { const j = JSON.parse(text); if (j.answer) text = String(j.answer); } catch (e) {} }
  text = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,4}\s*/gm, '').slice(0, 1800);
  const local = answer(q);
  const summary = /这周|本周|今天|明天|还有什么|没做|待办|截止/.test(q);
  UI.ask.push({ role: 'bot', text: text, entries: summary ? [] : (local.entries || []), online: true, at: nowISO() });
  ledgerAdd({ stage: '问答（在线 AI）', tool: '云端 AI · ' + (DB.settings.model || 'deepseek-chat'), prompt: ASK_PROMPT, input: q + '\n\n[上下文] ' + JSON.stringify(askContext()), output: text, human: '自动回答，仅引用本地课程数据', reviewer: '自动' });
  renderChat();
}
function askSend(q) {
  q = (q || '').trim();
  if (!q) return;
  if (UI.askBusy) { toast('上一个问题还在回答'); return; }
  UI.ask.push({ role: 'user', text: q, at: nowISO() });
  const inp = $('#askInput'); if (inp) inp.value = '';
  const sg = $('#sugs'); if (sg) sg.remove();
  if (askOnlineReady()) askAI(q);
  else {
    localAsk(q);
    if (DB.settings.aiAsk !== false && !DB.settings.key) toast('未配置 API Key，先用本地检索；可在“我的 → 在线 AI”配置');
  }
}

function findCourse(q) {
  const alias = { '高数': '高等数学', '大英': '大学英语', '马原': '马克思主义基本原理', '线代': '线性代数', '概率': '概率论', '计网': '计算机网络', '数据结构': '数据结构' };
  for (const k in alias) if (q.includes(k)) { const c = DB.courses.find(x => x.course.includes(alias[k])); if (c) return c; }
  let best = null, bestLen = 0;
  DB.courses.forEach(c => {
    if (q.includes(c.course)) { if (c.course.length > bestLen) { best = c; bestLen = c.course.length; } return; }
    const core = c.course.replace(/^(大学|高等|基础|现代|中国|马克思主义|毛泽东思想和中国特色社会主义理论体系)/, '').replace(/(原理|概论|基础|教程|理论)$/, '');
    if (core.length >= 2 && q.includes(core) && core.length > bestLen) { best = c; bestLen = core.length; }
    if (q.includes(c.teacher) && c.teacher && c.teacher.length >= 2 && c.teacher.length > bestLen) { best = c; bestLen = c.teacher.length; }
  });
  return best;
}

function answer(q) {
  const course = findCourse(q);
  const wantsSign = /签到|打卡|点名|考勤/.test(q);
  const wantsExam = /考试|测验|测试/.test(q);
  const wantsTasks = /这周|本周|今天|明天|还有什么|没做|待办|截止|要交/.test(q) && !/在哪|哪里|入口/.test(q);

  if (wantsTasks) {
    const scope = /今天/.test(q) ? 0 : (/明天/.test(q) ? 1 : -1);
    let list = pendingTasks().filter(x => x.t.deadline);
    if (scope >= 0) list = list.filter(x => dayDiff(x.t.deadline) === scope);
    else if (/这周|本周/.test(q)) list = list.filter(x => { const d = dayDiff(x.t.deadline); return d >= 0 && d < 7; });
    list.sort((a, b) => new Date(a.t.deadline) - new Date(b.t.deadline));
    if (!list.length) return { text: '这个范围内没有未完成的待办。要是刚看到新通知，粘贴进来识别一下就会出现在待办里。', entries: [] };
    const label = scope === 0 ? '今天' : (scope === 1 ? '明天' : (/这周|本周/.test(q) ? '本周' : '眼下'));
    const lines = list.slice(0, 6).map((x, i) => (i + 1) + '. ' + x.c.course + ' · ' + x.t.name + '（' + fmtDT(x.t.deadline) + '）').join('\n');
    const entries = [];
    list.slice(0, 3).forEach(x => { const e = entryForTask(x.c, x.t); if (e) entries.push(e); });
    return { text: label + '还有 ' + list.length + ' 件没做：\n' + lines + (list.length > 6 ? '\n…还有 ' + (list.length - 6) + ' 件，去待办页看全部。' : ''), entries };
  }

  if (course) {
    const list = entries(course);
    if (wantsSign || wantsExam) {
      const key = wantsSign ? '签到' : '考试';
      const hit = list.filter(e => (e.purpose || '').includes(key));
      if (hit.length) return { text: '《' + course.course + '》的' + key + '入口是【' + hit[0].name + '】。\n点击下方按钮打开；入口是平台首页，登录后进入对应课程。打不开就长按复制链接。', entries: hit };
      const fallback = list[0];
      return { text: '没有记录到《' + course.course + '》的' + key + '入口。' + (fallback ? '可以先从【' + fallback.name + '】进去看看，或者编辑课程补上入口。' : '可以编辑课程卡片补一个入口。'), entries: fallback ? [fallback] : [] };
    }
    if (/平台|app|软件|用哪个|哪些平台/i.test(q)) {
      const names = [...new Set(list.map(e => e.name))];
      if (names.length) return { text: '《' + course.course + '》用到这些平台：\n' + list.map(e => '· ' + e.name + '：' + e.purpose).join('\n') + '\n点按钮直接打开。', entries: list };
    }
    if (/在哪|哪里|怎么交|入口|链接|提交|交|作业/.test(q)) {
      const hit = list.filter(e => /提交|作业/.test(e.purpose));
      if (hit.length) return { text: '《' + course.course + '》的作业入口是【' + hit[0].name + '】。\n入口跳到平台首页，登录后找到这门课提交；打不开就复制链接。', entries: hit };
      if (list.length) return { text: '没有单独记录“提交作业”的入口。《' + course.course + '》目前有这些入口，可以先进去试试：', entries: list };
      return { text: '《' + course.course + '》还没有平台入口。打开课程详情，点右上角编辑补一个链接即可。', entries: [] };
    }
    const nt = nextTask(course);
    return { text: '《' + course.course + '》' + (course.teacher ? '（' + course.teacher + '）' : '') + '：\n' +
      (nt ? '最近一项是「' + nt.name + '」，' + fmtDT(nt.deadline) + ' 截止。' : '目前没有未完成待办。') +
      '\n你可以问“作业在哪交”或“用哪个平台签到”。', entries: list.slice(0, 3) };
  }

  if (wantsSign) return { text: '你问的是哪门课呢？我按课程记录查签到入口，找到后会给出按钮。', entries: [] };
  return { text: '我在你导入的本地数据里没找到对应的课程。\n可以：\n· 换一个课程名再问，比如“大学英语作业在哪交”\n· 去导入页粘贴课程通知\n· 手动补录一个入口', entries: [] };
}

/* ================= 我的 ================= */
function renderMe() {
  const pend = pendingTasks().length;
  const info = (() => { try { return JSON.parse(Bridge.info()); } catch (e) { return {}; } })();
  app.innerHTML = '<div class="page">' +
    '<div class="topbar"><div class="t">我的</div><div class="spacer"></div><span class="chip teal"><svg><use href="#i-shield"/></svg>本地优先</span></div>' +
    '<div class="wrap"><div class="profile"><div class="avatar">课</div><div><div class="pn">本地学习者</div><div class="ps">' + DB.courses.length + ' 门课 · ' + pend + ' 项待办 · 数据只在本机</div></div></div>' +

    '<div class="group-title">AI 与台账</div><div class="menu">' +
    '<button class="menu-item" data-act="goto" data-href="#/cloud"><div class="mi"><svg><use href="#i-spark"/></svg></div><div class="mt"><b>在线 AI</b><span>' + (DB.settings.cloud ? '识别已开启（发送前脱敏）' : '识别默认关闭') + ' · 问答' + (askOnlineReady() ? '在线' : '本地') + '</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '<button class="menu-item" data-act="goto" data-href="#/ocr"><div class="mi"><svg><use href="#i-doc"/></svg></div><div class="mt"><b>截图文字识别</b><span>' + (DB.settings.ocr ? '在线 OCR · 识别时上传这一张截图' : '已关闭 · 只用粘贴文字') + '</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '<button class="menu-item" data-act="goto" data-href="#/ledger"><div class="mi"><svg><use href="#i-doc"/></svg></div><div class="mt"><b>AI 使用台账</b><span>' + DB.ledger.length + ' 条记录 · 可导出 Markdown / CSV</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '</div>' +

    '<div class="group-title">提醒</div><div class="menu">' +
    '<button class="menu-item" data-act="lead-sheet"><div class="mi"><svg><use href="#i-bell"/></svg></div><div class="mt"><b>作业截止提醒</b><span>截止前 ' + leadText(DB.settings.lead) + ' · ' + (DB.settings.reminders ? '已开启' : '已关闭') + '</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '<button class="menu-item" data-act="class-lead-sheet"><div class="mi"><svg><use href="#i-clock"/></svg></div><div class="mt"><b>上课提醒</b><span>' + (DB.settings.classReminders === false ? '已关闭' : '课前 ' + leadText(DB.settings.classLead) + ' · 含科目/地点/作业') + '</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '<button class="menu-item" data-act="notify-permission"><div class="mi"><svg><use href="#i-shield"/></svg></div><div class="mt"><b>通知权限</b><span>' + (isNative ? (info.notifyGranted ? '已授权' : '未授权，点此申请') : '浏览器预览不支持') + '</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '</div>' +

    '<div class="group-title">数据</div><div class="menu">' +
    '<button class="menu-item" data-act="entry-help"><div class="mi"><svg><use href="#i-link"/></svg></div><div class="mt"><b>入口配置</b><span>入口失效时手动修改，不自动抓取</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '<button class="menu-item" data-act="export-json"><div class="mi"><svg><use href="#i-doc"/></svg></div><div class="mt"><b>导出备份</b><span>课程、待办、台账保存为 JSON</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '<button class="menu-item" data-act="export-diag"><div class="mi"><svg><use href="#i-doc"/></svg></div><div class="mt"><b>导出诊断日志</b><span>TXT · 排障用，不含 Key / 原文 / 群号</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '<button class="menu-item" data-act="import-json"><div class="mi"><svg><use href="#i-link"/></svg></div><div class="mt"><b>导入备份</b><span>从 JSON 恢复，可选合并或覆盖</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '<button class="menu-item danger" data-act="clear-sheet"><div class="mi"><svg><use href="#i-trash"/></svg></div><div class="mt"><b>清空本地数据</b><span>删除课程、待办和台账，不可恢复</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '</div>' +

    '<div class="group-title">外观</div><div class="menu">' +
    '<button class="menu-item" data-act="toggle-theme"><div class="mi"><svg><use href="#i-moon"/></svg></div><div class="mt"><b>夜间模式</b><span>' + (DB.settings.theme === 'dark' ? '已开启 · 深色背景' : '已关闭 · 浅色背景') + '</span></div><div class="switch ' + (DB.settings.theme === 'dark' ? 'on' : '') + '" style="margin-left:auto"></div></button>' +
    '</div>' +

    '<div class="group-title">关于</div><div class="menu">' +
    '<button class="menu-item" data-act="boundary"><div class="mi"><svg><use href="#i-flag"/></svg></div><div class="mt"><b>边界说明</b><span>不登录、不爬取、不提供作业答案</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '<button class="menu-item" data-act="about"><div class="mi"><svg><use href="#i-me"/></svg></div><div class="mt"><b>关于课程入口</b><span>校园公益原型 · 非营利</span></div><div class="arrow"><svg><use href="#i-arrow"/></svg></div></button>' +
    '</div>' +
    '<div class="about center" style="padding-top:8px">课程入口 1.8.0 · 本地优先<br><span class="ver">AI 辅助开发原型 · 数据默认不上传</span></div>' +
    '<div style="height:18px"></div></div></div>';
}

/* ================= 台账页 ================= */
function renderLedger() {
  const list = DB.ledger.slice(0, 100);
  app.innerHTML = '<div class="page">' +
    '<div class="topbar"><button class="icon-btn plain" data-act="back"><svg><use href="#i-back"/></svg></button><div class="t">AI 使用台账</div><div class="spacer"></div><span class="chip ghost">' + DB.ledger.length + ' 条</span></div>' +
    '<div class="wrap"><div class="notice"><svg><use href="#i-doc"/></svg><div>自动记录 AI 工具、环节、关键提示词、输入输出、人工修改与时间，可直接作为比赛的“AI 工具使用说明 + 人工核查”材料。</div></div>' +
    '<div class="form-row mt12"><button class="btn soft" data-act="export-ledger-md">导出 Markdown</button><button class="btn soft" data-act="export-ledger-csv">导出 CSV</button></div>' +
    '<div class="section"><div class="section-head"><h2>最近记录</h2></div>' +
    (list.length ? '<div class="card" style="padding:6px 14px">' + list.map(l => '<div class="ledger-item"><div class="lh"><b>' + ESC(l.stage) + ' · ' + ESC(l.tool) + '</b><span>' + fmtDT(l.at) + '</span></div>' +
      (l.human ? '<p>人工修改：' + ESC(l.human) + '</p>' : '') +
      (l.input ? '<p style="color:#787F95">输入：' + ESC(l.input.slice(0, 90)) + '</p>' : '') + '</div>').join('') + '</div>'
      : '<div class="card empty"><div class="art"><svg><use href="#i-doc"/></svg></div><h3>还没有台账记录</h3><p>导入、确认、问答都会自动记一条。</p></div>') +
    '</div><div style="height:20px"></div></div></div>';
}

/* ================= 云端 AI ================= */
function renderCloud() {
  const s = DB.settings;
  app.innerHTML = '<div class="page">' +
    '<div class="topbar"><button class="icon-btn plain" data-act="back"><svg><use href="#i-back"/></svg></button><div class="t">在线 AI（可选）</div></div>' +
    '<div class="wrap">' +
    '<div class="card" style="padding:16px"><div class="rowline" style="padding:0"><div class="rl"><b>开启云端增强</b><span>默认关闭。开启后仍需在导入页手动点按钮</span></div>' +
    '<button class="switch ' + (s.cloud ? 'on' : '') + '" data-act="toggle-cloud"></button></div></div>' +
    '<div class="card mt12" style="padding:16px"><div class="rowline" style="padding:0"><div class="rl"><b>在线 AI 问答</b><span>把课程名、待办、入口用途和问题发给接口，不发送原文</span></div>' +
    '<button class="switch ' + (s.aiAsk !== false ? 'on' : '') + '" data-act="toggle-ai-ask"></button></div></div>' +
    '<div class="notice warn mt12"><svg><use href="#i-shield"/></svg><div>识别：只有你点“云端增强识别”并确认脱敏预览时，才发送该段文本。问答：只发送课程名、待办、入口用途和你的问题，不发送原始通知/群号/学号。</div></div>' +
    '<div class="field mt18"><label>接口地址（OpenAI 兼容）</label><input class="input" id="cloudEndpoint" value="' + ESC(s.endpoint) + '" placeholder="https://api.deepseek.com/chat/completions"></div>' +
    '<div class="form-row"><div class="field" style="flex:1"><label>模型</label><input class="input" id="cloudModel" value="' + ESC(s.model) + '" placeholder="deepseek-chat"></div>' +
    '<div class="field" style="flex:1.6"><label>API Key</label><input class="input" id="cloudKey" type="password" value="' + ESC(s.key) + '" placeholder="sk-…"></div></div>' +
    '<p class="tip">Key 只保存在本机 WebView 存储里，不会打包进应用，也不会出现在导出备份中。没有 Key 时，在线问答会自动回退本地检索。</p>' +
    '<button class="btn primary block mt12" data-act="cloud-save">保存设置</button>' +
    '<div class="section"><div class="section-head"><h2>它做什么 / 不做什么</h2></div><div class="card" style="padding:14px"><div class="meta-list">' +
    '<div>· 只把<b>脱敏后的课程通知文本</b>发给你配置的接口，用于补强课程名、平台用途、任务摘要。</div>' +
    '<div>· 识别不发送课程卡片、待办或原始文本；在线问答只发送课程名、待办、入口用途和问题，不发送原始通知/群号/学号。</div>' +
    '<div>· 返回结果自动保存；课程详情里可继续编辑。</div>' +
    '<div>· 不调用大模型自由生成作业答案。</div></div></div></div>' +
    '<div style="height:20px"></div></div></div>';
}
function redact(s) {
  let count = 0;
  let out = String(s)
    .replace(/1[3-9]\d{9}/g, m => { count++; return m.slice(0, 3) + '****' + m.slice(7); })
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, m => { count++; return '[邮箱]'; })
    .replace(/(^|[^\d])(\d{12,})(?!\d)/g, (m, pre) => { count++; return pre + '[数字]'; })
    .replace(/[（(]\s*(学号|工号)\s*[:：]?\s*\d+\s*[)）]/g, m => { count++; return '[学号已隐藏]'; });
  return { text: out, count };
}

/* ================= 底部弹层 ================= */
function openSheet(title, body, foot, onMount) {
  const root = $('#sheet-root');
  root.innerHTML = '<div class="sheet-backdrop" data-act="close-sheet"></div>' +
    '<div class="sheet"><div class="sheet-grab"></div><div class="sheet-head"><h3>' + title + '</h3>' +
    '<button class="icon-btn plain" data-act="close-sheet" style="width:30px;height:30px"><svg style="width:18px;height:18px"><use href="#i-plus"/></svg></button></div>' +
    '<div class="sheet-body">' + body + '</div><div class="sheet-foot">' + (foot || '') + '</div></div>';
  requestAnimationFrame(() => root.classList.add('open'));
  if (onMount) setTimeout(onMount, 30);
}
function closeSheet() {
  const root = $('#sheet-root');
  root.classList.remove('open');
  setTimeout(() => { if (!root.classList.contains('open')) root.innerHTML = ''; }, 240);
}

function leadSheet() {
  const opts = [[10, '10 分钟'], [30, '30 分钟'], [60, '1 小时'], [120, '2 小时'], [1440, '1 天'], [2880, '2 天']];
  openSheet('提醒设置', '<div class="field"><label>提前多久提醒</label><select class="select" id="leadSel">' +
    opts.map(([v, l]) => '<option value="' + v + '" ' + (+DB.settings.lead === v ? 'selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
    '<div class="rowline" style="border:0"><div class="rl"><b>为待办开启本地提醒</b><span>关掉后不再发系统通知</span></div><button class="switch ' + (DB.settings.reminders ? 'on' : '') + '" data-act="toggle-reminders"></button></div>' +
    '<p class="tip">Android 可能限制精确闹钟；若被限制，提醒仍会在截止前发出，但时间可能有几分钟偏差。</p>',
    '<button class="btn ghost" data-act="close-sheet">取消</button><button class="btn primary" data-act="save-lead">保存</button>');
}

function classLeadSheet() {
  const opts = [[5, '5 分钟'], [10, '10 分钟'], [15, '15 分钟'], [20, '20 分钟'], [30, '30 分钟'], [45, '45 分钟'], [60, '1 小时']];
  openSheet('上课提醒', '<div class="field"><label>提前多久提醒上课</label><select class="select" id="classLeadSel">' +
    opts.map(([v, l]) => '<option value="' + v + '" ' + (+DB.settings.classLead === v ? 'selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
    '<div class="rowline" style="border:0"><div class="rl"><b>为课表开启上课提醒</b><span>通知里带科目、时间、地点和最近待办</span></div><button class="switch ' + (DB.settings.classReminders !== false ? 'on' : '') + '" data-act="toggle-class-reminders"></button></div>' +
    '<div class="field"><label>学期第 1 周周一</label><input class="input" type="date" id="semesterStart" value="' + ESC(DB.settings.semesterStart || '') + '"><p class="tip" style="margin:6px 0 0">单双周和 PDF 里的“第 X 周”按这个日期换算；默认 2026-09-14。</p></div>' +
    '<p class="tip">只对导入了上课时间的课程生效。每节课会预排未来约 10 周的提醒；打开 App 时会自动续排。节次时间按这本课表的作息换算，若课表写了具体时间则以课表为准。</p>',
    '<button class="btn ghost" data-act="close-sheet">取消</button><button class="btn primary" data-act="save-class-lead">保存</button>');
}

function renderOcr() {
  const s = DB.settings;
  app.innerHTML = '<div class="page">' +
    '<div class="topbar"><button class="icon-btn plain" data-act="back"><svg><use href="#i-back"/></svg></button><div class="t">截图文字识别</div></div>' +
    '<div class="wrap">' +
    '<div class="card" style="padding:16px"><div class="rowline" style="padding:0"><div class="rl"><b>启用在线 OCR</b><span>默认开启，识别时只发送当前这张截图</span></div>' +
    '<button class="switch ' + (s.ocr ? 'on' : '') + '" data-act="toggle-ocr"></button></div></div>' +
    '<div class="notice warn mt12"><svg><use href="#i-shield"/></svg><div>截图里可能有姓名、学号、群号。只有你选图并首次同意后，才会把这张图发送到下面填写的 OCR 服务；服务商可能按自己的政策保存图片。介意隐私时请用系统识屏复制文字后粘贴。</div></div>' +
    '<div class="field mt18"><label>OCR 接口地址（OCR.space 兼容）</label><input class="input" id="ocrEndpoint" value="' + ESC(s.ocrEndpoint) + '" placeholder="https://api.ocr.space/parse/image"></div>' +
    '<div class="form-row"><div class="field" style="flex:1.5"><label>API Key</label><input class="input" id="ocrKey" type="password" value="' + ESC(s.ocrKey) + '" placeholder="helloworld"></div>' +
    '<div class="field" style="flex:1"><label>语言</label><select class="select" id="ocrLang"><option value="chs" ' + (s.ocrLang === 'chs' ? 'selected' : '') + '>简体中文</option><option value="eng" ' + (s.ocrLang === 'eng' ? 'selected' : '') + '>英文</option></select></div></div>' +
    '<p class="tip">内测版已内置<b>共享 OCR Key</b>，测试者无需填写；共享额度有限，用户多时可能返回 <b>HTTP 429</b>。如果额度用完，可以换成自己的免费 Key（推荐内测期间每人填一次）；也可以填其他兼容接口。Key 只存本机，导出备份时会被清空。</p>' +
    '<div class="notice warn"><svg><use href="#i-shield"/></svg><div>如果选图后提示“免费额度用完了”，不是截图坏了，是公共 Key 被限流。点下面获取免费 Key，填进去再识别。</div></div>' +
    '<button class="btn ghost block mt8" data-act="ocr-get-key">获取免费 Key（浏览器）</button>' +
    (s.ocrKey !== SHARED_OCR_KEY ? '<button class="btn ghost block mt8" data-act="ocr-use-shared">恢复默认 Key</button>' : '') +
    '<button class="btn primary block mt12" data-act="ocr-save">保存设置</button>' +
    '<button class="btn ghost block mt8" data-act="ocr-reset-consent">清除“同意上传截图”记录</button>' +
    '<div class="section"><div class="section-head"><h2>它做什么 / 不做什么</h2></div><div class="card" style="padding:14px"><div class="meta-list">' +
    '<div>· 只把<b>你选中的那一张截图</b>发给 OCR 服务，用来提取文字。</div>' +
    '<div>· 不把截图存进课程、待办或导出备份。</div>' +
    '<div>· 识别出的文字会填进输入框，你可以改；课程字段仍由本地规则抽取。</div>' +
    '<div>· 无网络、Key 失效或识别失败时，可以改用“粘贴通知”或系统识屏。</div></div></div></div>' +
    '<div style="height:20px"></div></div></div>';
}

function mergeSheet(cid) {
  const c = courseById(cid); if (!c) return;
  const others = DB.courses.filter(x => x.id !== cid);
  if (!others.length) { toast('没有其他课程可合并'); return; }
  openSheet('合并重复课程', '<p class="small">把《' + ESC(c.course) + '》的平台入口、待办和原文合并到另一门课，然后删除当前卡片。</p>' +
    others.map(o => '<button class="rowline" style="width:100%;text-align:left;border:0;border-bottom:1px solid #F1F2F8;background:transparent" data-act="merge-to" data-cid="' + cid + '" data-target="' + o.id + '">' +
      '<div class="rl"><b>' + ESC(o.course) + '</b><span>' + ESC(o.teacher || '') + ' · ' + (o.tasks || []).length + ' 个待办</span></div>' +
      '<svg style="width:16px;height:16px;color:#A3A9BC"><use href="#i-arrow"/></svg></button>').join(''),
    '<button class="btn ghost" data-act="close-sheet">取消</button>');
}
function mergeCourses(srcId, dstId) {
  const src = courseById(srcId), dst = courseById(dstId);
  if (!src || !dst) return;
  const changed = [];
  (src.platforms || []).forEach(p => {
    if (!(dst.platforms || []).some(q => q.name === p.name)) { dst.platforms.push(p); changed.push('平台'); }
  });
  (src.tasks || []).forEach(t => {
    if (!(dst.tasks || []).some(q => normName(q.name) === normName(t.name) && (q.deadline || '').slice(0, 10) === (t.deadline || '').slice(0, 10))) {
      dst.tasks.push(t); changed.push('待办');
    } else {
      Bridge.cancel('task_' + t.id);
    }
  });
  if (!dst.teacher && src.teacher) dst.teacher = src.teacher;
  if (!dst.group_info && src.group_info) dst.group_info = src.group_info;
  let addedSession = false;
  (src.sessions || []).forEach(s => {
    dst.sessions = dst.sessions || [];
    const old = dst.sessions.find(q => q.weekday === s.weekday && q.start === s.start && q.end === s.end && q.location === s.location);
    if (!old) {
      dst.sessions.push(s); addedSession = true; changed.push('上课时间');
    } else if (s.weeks && s.weeks.length) {
      const set = {}; (old.weeks || []).concat(s.weeks).forEach(w => set[w] = 1);
      old.weeks = Object.keys(set).map(Number).sort((a, b) => a - b);
      if (!old.weeksText) old.weeksText = s.weeksText;
    }
  });
  if (addedSession && src.schedule && (!dst.schedule || dst.schedule.indexOf(src.schedule) < 0)) dst.schedule = dst.schedule ? dst.schedule + ' / ' + src.schedule : src.schedule;
  if (src.raw_text) dst.raw_text = (dst.raw_text ? dst.raw_text + '\n\n---\n' : '') + src.raw_text;
  dst.imports = (dst.imports || []).concat(src.imports || []);
  dst.updated_at = nowISO();
  DB.courses = DB.courses.filter(x => x.id !== srcId);
  saveDB(); syncReminders();
  ledgerAdd({ stage: '人工合并', tool: '人工', prompt: '合并重复课程', input: src.course, output: '合并到 ' + dst.course + '（' + changed.length + ' 项）', human: '用户选择合并目标', reviewer: '用户' });
  closeSheet();
  toast('已合并到《' + dst.course + '》');
  go('#/course/' + dst.id);
}

function deleteSheet(cid) {
  const c = courseById(cid); if (!c) return;
  openSheet('删除课程', '<p style="font-size:14px">确定删除《' + ESC(c.course) + '》？<br><span class="small">关联的 ' + (c.tasks || []).length + ' 个待办和 ' + (c.platforms || []).length + ' 个入口会一起删除，原始文本也不再保留。</span></p>',
    '<button class="btn ghost" data-act="close-sheet">取消</button><button class="btn danger" data-act="del-course-yes" data-cid="' + cid + '">确认删除</button>');
}
function clearSheet() {
  openSheet('清空本地数据', '<p style="font-size:14px">会删除全部课程、待办、群信息和 AI 台账，并取消已设置的提醒。<br><br><b>这个操作不可撤销。</b></p>',
    '<button class="btn ghost" data-act="close-sheet">取消</button><button class="btn danger" data-act="clear-yes">清空</button>');
}
function boundarySheet() {
  openSheet('边界说明', '<div class="meta-list" style="font-size:13px;line-height:1.9">' +
    '<div>· <b>不登录</b>任何第三方平台账号。</div>' +
    '<div>· <b>不爬取、不注入、不自动读取</b>平台页面；跳转由系统浏览器/Intent 完成。</div>' +
    '<div>· <b>不提供作业答案</b>、解题思路或内容代写，只整理入口和待办。</div>' +
    '<div>· 公众号无法直达主页，只能打开文章链接或提示复制名称。</div>' +
    '<div>· 群入口无法直达，复制群号后在 QQ/微信里搜索。</div>' +
    '<div>· 课程、待办、原始文本默认<b>只存本机</b>；在线 AI 需配置 Key，识别默认关闭，问答可关闭。</div>' +
    '<div>· 截图 OCR 只在你选图并首次同意后上传<b>当前截图</b>，不保存原图。</div>' +
    '<div>· 截止时间来自通知原文，可能有误，请以老师发布为准。</div></div>',
    '<button class="btn primary" data-act="close-sheet">知道了</button>');
}
function aboutSheet() {
  openSheet('关于课程入口', '<div style="font-size:13px;line-height:1.85;color:#3C4257">' +
    '<p style="margin-top:0"><b>课程入口</b>把散落在群聊、公众号、各个学习平台里的课程通知，整理成一张张可一键跳转的入口卡片和待办。</p>' +
    '<p>粘贴通知或截图 → 本地识别 → 自动保存课程卡片与待办 → 提醒 → 问答/跳转。识别不准时点首页“撤销这次导入”，再补一句课程名重试即可。</p>' +
    '<p>性质：非营利校园公益原型 · 赛题一“AI 辅助开发·创意产品原型”。</p>' +
    '<p class="small">版本 1.8.0 · Android 原型<br>技术：原生 WebView 壳 + 本地规则引擎，数据存于本机。</p>' +
    '<p class="small">v1.1 新增：截图 OCR 导入、课表上课提醒。未包含：云同步、iOS 版；公众号只能打开单篇文章；钉钉群有邀请链接可直达，否则打开钉钉群列表。</p></div>',
    '<button class="btn primary" data-act="close-sheet">关闭</button>');
}

/* ================= 操作分发 ================= */
document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const cid = el.dataset.cid, tid = el.dataset.tid, pid = el.dataset.pid;

  switch (act) {
    case 'back': if (history.length > 1) history.back(); else go('#/home'); break;
    case 'goto': go(el.dataset.href); break;
    case 'go-import': go('#/import'); break;
    case 'close-sheet': closeSheet(); break;
    case 'copy': copyText(el.dataset.text || ''); break;

    case 'filter': UI.filter = el.dataset.k; renderTodos(); break;
    case 'stat-todos': {
      UI.filter = el.dataset.k || 'open';
      if (currentRoute().name === 'todos') renderTodos(); else go('#/todos');
      break;
    }
    case 'stat-courses': {
      const jump = () => { const el = $('#myCourses'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      if (currentRoute().name === 'home') jump(); else { go('#/home'); setTimeout(jump, 90); }
      break;
    }
    case 'toggle-task': {
      const c = courseById(cid); if (!c) return;
      const t = (c.tasks || []).find(x => x.id === tid); if (!t) return;
      t.status = t.status === '已完成' ? '未完成' : '已完成';
      if (t.status === '已完成') Bridge.cancel('task_' + t.id); else scheduleTask(c, t);
      saveDB();
      toast(t.status === '已完成' ? '已完成，提醒已取消' : '已恢复为未完成');
      if (currentRoute().name === 'todos') renderTodos(); else if (currentRoute().name === 'course') renderCourse();
      break;
    }
    case 'toggle-remind': {
      const c = courseById(cid); if (!c) return;
      const t = (c.tasks || []).find(x => x.id === tid); if (!t) return;
      t.remind = t.remind === false;
      if (t.remind === false) Bridge.cancel('task_' + t.id); else scheduleTask(c, t);
      saveDB();
      toast(t.remind === false ? '已关闭这条提醒' : '已开启提醒');
      renderTodos();
      break;
    }
    case 'open-task': case 'task-entry': case 'task-jump': {
      const c = courseById(cid); if (!c) return;
      const t = (c.tasks || []).find(x => x.id === tid);
      if (t) taskJumpSheet(c, t); else toast('任务不存在');
      break;
    }
    case 'task-jump-go': {
      const j = UI.jump;
      closeSheet();
      if (j && j.entry) openEntry(j.entry);
      break;
    }
    case 'task-copy-platform': {
      const j = UI.jump;
      closeSheet();
      if (j) Bridge.copy(j.name);
      break;
    }
    case 'task-jump-course': {
      const j = UI.jump;
      closeSheet();
      if (j) go('#/course/' + j.cid);
      break;
    }
    case 'open-group': {
      const c = courseById(cid); if (c && c.group_info) openGroup(c.group_info);
      break;
    }
    case 'open-entry': {
      const c = courseById(cid); if (!c) return;
      const en = entries(c).find(x => String(x.pid) === String(pid)); if (en) openEntry(en); else toast('入口不存在');
      break;
    }
    case 'copy-entry': {
      const c = courseById(cid); if (!c) return;
      const en = entries(c).find(x => String(x.pid) === String(pid));
      if (en) { Bridge.copy(en.value || (c.group_info && c.group_info.value) || ''); if (!isNative) toast('已复制，可粘贴到浏览器或对应 App'); }
      break;
    }
    case 'demo': loadDemo(); break;
    case 'undo-import': undoImport(); break;
    case 'demo-yes': closeSheet(); insertDemo(); break;

    case 'import-tab': switchImportTab(el.dataset.k); break;
    case 'sample': { const ta = $('#pasteText'); if (ta) { ta.value = '【课程通知】《大学英语》王老师：请于11月20日23:59前在学习通提交Unit5读书报告，逾期不候。雨课堂签到，QQ群号123456789。'; } break; }
    case 'parse-paste': {
      const ta = $('#pasteText'); const text = ta ? ta.value.trim() : '';
      if (text.length < 6) { toast('先粘贴一段课程通知'); return; }
      const fromOcr = !!UI.ocr.dataUrl;
      const src = fromOcr ? '截图 OCR' : '用户粘贴';
      const parsed = Parser.extract(text, src);
      parsed.source = src;
      if (fromOcr) handleNoticeParsed(parsed, text, UI.ocr.source_app);
      else startConfirm(parsed, text, src);
      break;
    }
    case 'parse-timetable': {
      const ta = $('#ttText'); const text = ta ? ta.value.trim() : '';
      if (text.length < 5) { toast('先粘贴课表文本'); return; }
      const list = Parser.parseTimetable(text, '课表导入');
      if (!list.length) { toast('没能解析出课程，检查一下“周一 1-2节 课程名”格式'); return; }
      startBatch(list, '课表导入');
      break;
    }
    case 'pick-ics': UI.pickMode = 'ics'; Bridge.pickFile(); break;
    case 'pick-ocr-image': Bridge.pickImage(); break;
    case 'clear-ocr': UI.ocr = { dataUrl: '', name: '', text: '', raw: '', overlay: null, busy: false, target: 'notice', source_app: null }; renderImport(); break;
    case 'pick-timetable-image': UI.ocr.target = 'timetable'; Bridge.pickImage(); break;
    case 'pick-pdf': Bridge.pickPdf(); break;
    case 'source-pick': {
      const sp = UI.sourcePrompt;
      if (!sp) { closeSheet(); break; }
      const app = sourceAppOf(el.dataset.key);
      rememberSource(sp.parsed.course, app);
      applySourceApp(sp.parsed, app);
      closeSheet();
      autoSaveParsed(sp.parsed, sp.raw, '截图 OCR', app);
      break;
    }
    case 'source-skip': {
      const sp = UI.sourcePrompt;
      if (!sp) { closeSheet(); break; }
      const app = (sp.autoApp && sp.autoApp.key !== 'screenshot') ? sp.autoApp : { key: 'other', name: '其他来源', confidence: 0.4 };
      closeSheet();
      autoSaveParsed(sp.parsed, sp.raw, '截图 OCR', app);
      break;
    }
    case 'source-sheet': {
      const c = courseById(el.dataset.cid);
      if (!c) break;
      sourceOptionsSheet('source-set-course', 'data-cid="' + c.id + '"', '修改来源');
      break;
    }
    case 'source-set-course': {
      const c = courseById(el.dataset.cid);
      if (!c) { closeSheet(); break; }
      const app = sourceAppOf(el.dataset.key);
      c.source_app = app;
      if (c.group_info && c.group_info.value && /群$/.test(app.name || '')) c.group_info.type = app.name;
      rememberSource(c.course, app);
      saveDB(); closeSheet(); toast('来源已改为 ' + app.name); renderCourse();
      break;
    }
    case 'ocr-run': startOcr(); break;
    case 'ocr-consent-yes': DB.settings.ocrConsent = true; saveDB(); closeSheet(); doOcr(); break;
    case 'ocr-goto-key': closeSheet(); go('#/ocr'); break;
    case 'ocr-use-paste': {
      const wasTask = UI.ocr.target === 'task', tid = UI.taskCid;
      closeSheet();
      if (wasTask && tid) { setTimeout(() => { quickTaskSheet(tid); const t = $('#qtText'); if (t) t.focus(); }, 220); toast('把识屏或复制的文字粘贴到任务框'); }
      else { go('#/import'); setTimeout(() => { const t = $('#pasteText'); if (t) t.focus(); }, 250); toast('把识屏或复制的文字粘贴到这里'); }
      break;
    }
    case 'ocr-get-key': { try { Bridge.open('https://ocr.space/ocrapi'); } catch (e) { toast('打不开浏览器，请搜索 OCR.space'); } break; }
    case 'ocr-use-shared': { DB.settings.ocrKey = SHARED_OCR_KEY; saveDB(); toast('已恢复默认 Key'); renderOcr(); break; }
    case 'ocr-save': {
      DB.settings.ocrEndpoint = ($('#ocrEndpoint') || {}).value || '';
      DB.settings.ocrKey = (($('#ocrKey') || {}).value || '').trim();
      DB.settings.ocrLang = ($('#ocrLang') || {}).value || 'chs';
      saveDB(); toast('OCR 设置已保存，仅存本机');
      break;
    }
    case 'toggle-ocr': DB.settings.ocr = !DB.settings.ocr; saveDB(); renderOcr(); toast(DB.settings.ocr ? '在线 OCR 已开启' : '在线 OCR 已关闭'); break;
    case 'ocr-reset-consent': DB.settings.ocrConsent = false; saveDB(); toast('下次识别前会重新询问'); break;
    case 'manual-new': UI.editor = { mode: 'manual', data: blankCourse() }; go('#/new'); break;

    case 'mark-field': {
      const p = UI.current; if (!p) return;
      const m = marksOf(p.id); m[el.dataset.field] = !m[el.dataset.field];
      renderConfirm();
      break;
    }
    case 'mark-all': {
      const p = UI.current; if (!p) return;
      const m = marksOf(p.id); ['course', 'teacher', 'platforms', 'tasks'].forEach(k => m[k] = true);
      renderConfirm();
      break;
    }
    case 'add-platform': {
      const d = collectEditor(); d.platforms.push({ id: uid('pf'), name: '', purpose: '查看通知', entry_type: 'web', entry_value: '', fallback: '复制链接', status: '需复制' });
      rerenderEditor();
      break;
    }
    case 'remove-platform': { const d = collectEditor(); d.platforms.splice(+el.dataset.i, 1); rerenderEditor(); break; }
    case 'quick-add-task': quickTaskSheet(el.dataset.cid); break;
    case 'quick-task-parse': {
      const txt = ($('#qtText') && $('#qtText').value) || '';
      if (!txt.trim()) { toast('先粘贴通知，或选截图识别'); break; }
      addTasksToCourse(el.dataset.cid, txt, '手动粘贴');
      break;
    }
    case 'quick-task-pick': {
      UI.taskCid = el.dataset.cid;
      UI.ocr.target = 'task';
      closeSheet();
      try { Bridge.pickImage(); } catch (e) { toast('打不开相册：' + e.message); }
      break;
    }
    case 'add-task': {
      const d = collectEditor(); d.tasks.push({ id: uid('tk'), name: '', deadline: '', platform: (d.platforms[0] || {}).name || '', type: '作业', status: '未完成', confidence: 1 });
      rerenderEditor();
      break;
    }
    case 'remove-task': { const d = collectEditor(); d.tasks.splice(+el.dataset.i, 1); rerenderEditor(); break; }
    case 'add-group': { const d = collectEditor(); d.group_info = { type: 'QQ群', value: '', link: '', fallback: '复制群号' }; rerenderEditor(); break; }
    case 'remove-group': { const d = collectEditor(); d.group_info = null; rerenderEditor(); break; }
    case 'editor-save': saveEditor(); break;
    case 'discard-pending': {
      const p = UI.current;
      openSheet('放弃识别', '<p>这条识别结果不会保存，原始文本也会从待确认里移除。</p>',
        '<button class="btn ghost" data-act="close-sheet">取消</button><button class="btn danger" data-act="discard-yes">放弃</button>');
      break;
    }
    case 'discard-yes': {
      const p = UI.current;
      if (p) { DB.pending = DB.pending.filter(x => x.id !== p.id); saveDB(); }
      closeSheet(); toast('已放弃'); go('#/import');
      break;
    }
    case 'edit-course': go('#/edit/' + cid); break;
    case 'del-course': deleteSheet(cid); break;
    case 'merge-sheet': mergeSheet(cid); break;
    case 'merge-to': mergeCourses(cid, el.dataset.target); break;
    case 'del-course-yes': {
      const c = courseById(cid); if (!c) return;
      (c.tasks || []).forEach(t => Bridge.cancel('task_' + t.id));
      DB.courses = DB.courses.filter(x => x.id !== cid);
      saveDB(); syncReminders(); closeSheet(); toast('已删除'); go('#/home');
      break;
    }
    case 'view-raw': {
      const c = courseById(cid); if (!c) return;
      openSheet('原始文本', '<div class="rawbox" style="max-height:60vh">' + ESC(c.raw_text || '无') + '</div>' +
        '<div class="tag-row"><span class="chip ghost">来源：' + ESC(c.source || '') + '</span><span class="chip ghost">' + fmtDT(c.created_at) + '</span></div>',
        '<button class="btn primary" data-act="close-sheet">关闭</button>');
      break;
    }

    case 'batch-toggle': { UI.batch.selected[+el.dataset.i] = !UI.batch.selected[+el.dataset.i]; renderBatch(); break; }
    case 'batch-save': {
      const b = UI.batch; if (!b) return;
      let saved = 0;
      b.courses.forEach((c, i) => {
        if (!b.selected[i]) return;
        c.source = b.source; c.raw_text = (c.raw_text && c.raw_text.length < 3000) ? c.raw_text : ('（来自' + b.source + '）'); c.tool = '本地课表解析器';
        const r = mergeIntoDB(c); saved++;
      });
      saveDB(); syncReminders();
      ledgerAdd({ stage: '批量确认', tool: '人工核对', prompt: '勾选课表解析结果', input: b.source, output: '保存 ' + saved + ' 门课程', human: '用户勾选后批量保存', reviewer: '用户' });
      toast('已保存 ' + saved + ' 门课程');
      UI.batch = null; go('#/home');
      break;
    }

    case 'ask-suggest': { const q = el.dataset.q; const s = $('#sugs'); if (s) s.style.display = 'none'; askSend(q); break; }
    case 'ask-send': { const i = $('#askInput'); const s = $('#sugs'); if (s) s.style.display = 'none'; askSend(i ? i.value : ''); break; }
    case 'ask-ai-setup': aiSetupSheet(); break;
    case 'toggle-ai-ask': { DB.settings.aiAsk = DB.settings.aiAsk === false; saveDB(); closeSheet(); toast(DB.settings.aiAsk ? '在线 AI 问答已开启' : '已改用本地问答'); if (currentRoute().name === 'ask') renderAsk(); break; }
    case 'toggle-theme': { DB.settings.theme = DB.settings.theme === 'dark' ? 'light' : 'dark'; saveDB(); applyTheme(); renderMe(); toast(DB.settings.theme === 'dark' ? '夜间模式已开启' : '已切回浅色'); break; }

    case 'lead-sheet': leadSheet(); break;
    case 'toggle-reminders': {
      DB.settings.reminders = !DB.settings.reminders;
      saveDB(); syncReminders();
      toast(DB.settings.reminders ? '提醒已开启' : '提醒已关闭');
      leadSheet();
      break;
    }
    case 'class-lead-sheet': classLeadSheet(); break;
    case 'toggle-class-reminders': {
      DB.settings.classReminders = DB.settings.classReminders === false;
      saveDB(); syncReminders(); classLeadSheet();
      toast(DB.settings.classReminders ? '上课提醒已开启' : '上课提醒已关闭');
      break;
    }
    case 'save-class-lead': {
      const v = $('#classLeadSel');
      const sd = $('#semesterStart');
      DB.settings.classLead = +v.value || 20;
      if (sd && /^\d{4}-\d{2}-\d{2}$/.test(sd.value)) DB.settings.semesterStart = sd.value;
      saveDB(); syncReminders(); closeSheet(); toast('上课提醒时间已更新');
      if (currentRoute().name === 'me') renderMe();
      break;
    }
    case 'save-lead': {
      const v = $('#leadSel');
      DB.settings.lead = +v.value || 60;
      saveDB(); syncReminders(); closeSheet(); toast('提醒时间已更新');
      if (currentRoute().name === 'me') renderMe();
      break;
    }
    case 'notify-permission': Bridge.requestNotifyPermission(); break;
    case 'toggle-cloud': DB.settings.cloud = !DB.settings.cloud; saveDB(); renderCloud(); toast(DB.settings.cloud ? '已开启，注意先配置 Key' : '已关闭'); break;
    case 'cloud-save': {
      DB.settings.endpoint = ($('#cloudEndpoint') || {}).value || '';
      DB.settings.model = ($('#cloudModel') || {}).value || '';
      DB.settings.key = ($('#cloudKey') || {}).value || '';
      saveDB(); toast('已保存，仅存本机');
      break;
    }
    case 'cloud-parse': cloudAsk(); break;
    case 'cloud-send': cloudSend(); break;

    case 'entry-help': openSheet('入口配置', '<p style="font-size:13px;line-height:1.8">入口由你导入时识别、或手动填写，<b>不会自动刷新</b>，也不会读取平台页面。平台改了网址、课程换了班，点课程卡片右上角编辑即可更新。</p><p class="small">失效入口可以改成具体网址、App scheme（如 <b>yuketang://</b>），或删掉后重新粘贴通知。</p>',
      '<button class="btn ghost" data-act="close-sheet">关闭</button><button class="btn primary" data-act="goto" data-href="#/home">去课程列表</button>'); break;
    case 'export-json': exportJSON(); break;
    case 'export-diag': exportDiag(); break;
    case 'import-json': UI.pickMode = 'backup'; Bridge.pickFile(); break;
    case 'export-ledger-md': download('AI台账-' + fmtDay(nowISO()) + '.md', ledgerMD(), 'text/markdown'); break;
    case 'export-ledger-csv': download('AI台账-' + fmtDay(nowISO()) + '.csv', '\ufeff' + ledgerCSV(), 'text/csv'); break;
    case 'clear-sheet': clearSheet(); break;
    case 'clear-yes': {
      allTasks().forEach(x => Bridge.cancel('task_' + x.t.id));
      DB.courses = []; DB.pending = []; DB.imports = []; DB.ledger = [];
      try { localStorage.removeItem(DIAG_KEY); } catch (e) {}
      saveDB(); syncClassReminders(); closeSheet(); toast('已清空'); go('#/home');
      break;
    }
    case 'boundary': boundarySheet(); break;
    case 'about': aboutSheet(); break;
    case 'backup-merge': doImportBackup(false); break;
    case 'backup-replace': doImportBackup(true); break;
  }
});

function rerenderEditor() {
  if (!UI.editor) return;
  if (UI.editor.mode === 'confirm') renderConfirm();
  else if (UI.editor.mode === 'edit') renderEditorPage('编辑课程');
  else renderEditorPage('新建课程');
}

/* 输入同步 */
function syncInput(e) {
  const el = e.target;
  if (!UI.editor) return;
  const d = UI.editor.data;
  if (el.dataset.f) d[el.dataset.f] = el.value;
  else if (el.dataset.pf) {
    const [i, k] = el.dataset.pf.split('.');
    if (d.platforms[i]) d.platforms[i][k] = el.value;
  } else if (el.dataset.tf) {
    const [i, k] = el.dataset.tf.split('.');
    if (d.tasks[i]) d.tasks[i][k] = el.value;
  } else if (el.dataset.gf) {
    if (!d.group_info) d.group_info = { type: 'QQ群', value: '', fallback: '复制群号' };
    d.group_info[el.dataset.gf] = el.value;
  }
}
document.addEventListener('input', syncInput);
document.addEventListener('change', syncInput);

/* ================= 入口跳转 ================= */
function openGroup(g) {
  if (!g) { toast('没有群信息'); return false; }
  const link = groupLink(g);
  if (link) {
    let ok = false;
    try { ok = Bridge.open(link); } catch (e) { ok = false; }
    if (ok) { toast(isDingGroup(g) ? '正在打开钉钉群聊' : '正在打开群链接'); return true; }
    Bridge.copy(link);
    toast('打不开，已复制群链接');
    return false;
  }
  if (isDingGroup(g)) {
    // 官方跳转协议：打开钉钉「我的群组」列表，再点对应群
    let ok = false;
    try { ok = Bridge.open('dingtalk://dingtalkclient/page/groupchat'); } catch (e) { ok = false; }
    if (ok) { toast('已打开钉钉群列表，请点对应群'); return true; }
    Bridge.copy(g.value || '');
    toast('没装钉钉，已复制群名');
    return false;
  }
  Bridge.copy(g.value || '');
  toast('已复制群名，去对应 App 搜索');
  return false;
}
function openEntry(en) {
  if (!en) { toast('没有可用入口'); return; }
  if (en.type === 'group') {
    const c = courseById(en.cid);
    openGroup((c && c.group_info) || { type: en.name, value: en.value, link: en.link });
    return;
  }
  if (en.type === 'article') {
    const v = en.value || '';
    if (!v) { toast('没有可复制的公众号/文章'); return; }
    Bridge.copy(v);
    toast('已复制，请在微信里搜索公众号或打开文章');
    return;
  }
  const v = (en.value || '').trim();
  if (!v) { toast('这个入口还没有链接，点编辑补充'); return; }
  let ok = false;
  try { ok = Bridge.open(v); } catch (e) { ok = false; }
  if (!ok) { Bridge.copy(v); toast('打不开，已复制链接，可粘贴到浏览器'); }
  else toast('正在跳转第三方平台');
}

/* ================= 提醒 ================= */
function scheduleTask(c, t) {
  if (!DB.settings.reminders || !t.deadline || t.status === '已完成' || t.remind === false) return;
  const at = t.remindAt ? new Date(t.remindAt).getTime() : new Date(t.deadline).getTime() - (+DB.settings.lead || 0) * 60000;
  if (isNaN(at) || at < Date.now() + 5000) return;
  Bridge.notifyAt('task_' + t.id, c.course + ' · ' + t.name, (t.deadline_default ? '默认提醒：' : '截止 ') + fmtDT(t.deadline) + '，点开查看提交入口', at);
  if ((DB.taskAlarmIds || []).indexOf('task_' + t.id) < 0) DB.taskAlarmIds.push('task_' + t.id);
}
function syncReminders() {
  const live = {};
  allTasks().forEach(({ c, t }) => {
    if (t.status === '已完成' || t.remind === false) Bridge.cancel('task_' + t.id);
    else { scheduleTask(c, t); live['task_' + t.id] = true; }
  });
  // 差集取消：已删除任务（撤销导入、编辑删除）残留的闹钟也要清掉
  (DB.taskAlarmIds || []).forEach(id => { if (!live[id]) Bridge.cancel(id); });
  DB.taskAlarmIds = Object.keys(live);
  syncClassReminders();
}

/* ================= 课前提醒 ================= */
const WD_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
function semesterStartDate() {
  const v = String(DB.settings.semesterStart || '').split('-');
  if (v.length !== 3) return null;
  const d = new Date(+v[0], +v[1] - 1, +v[2]);
  return isNaN(d.getTime()) ? null : d;
}
function semesterWeekOf(date) {
  const start = semesterStartDate();
  if (!start) return 0;
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.floor(Math.round((a - b) / 864e5) / 7) + 1;
}
function weekAllowed(s, date) {
  if (!s || !s.weeks || !s.weeks.length) return true;
  const w = semesterWeekOf(date);
  if (!w) return true;
  return s.weeks.indexOf(w) >= 0;
}
function sessionText(s) {
  return WD_NAMES[s.weekday] + ' ' + (s.start || '?') + (s.end ? '-' + s.end : '') + (s.location ? ' · ' + s.location : '');
}
function nextSessionAt(s, from) {
  if (!s || !s.start) return null;
  const p = s.start.split(':');
  const base = from ? new Date(from) : new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), +p[0] || 0, +p[1] || 0, 0, 0);
  const delta = ((+s.weekday % 7) - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  for (let i = 0; i < 40; i++) {
    if (d.getTime() > base.getTime() + 60000 && weekAllowed(s, d)) return d;
    d.setDate(d.getDate() + 7);
  }
  return null;
}
function nextClassInfo(c) {
  let best = null;
  (c.sessions || []).forEach(s => {
    const d = nextSessionAt(s);
    if (d && (!best || d < best.date)) best = { date: d, s: s };
  });
  return best;
}
function classTaskFor(c, date) {
  return (c.tasks || []).filter(t => t.status !== '已完成' && t.remind !== false && t.deadline && new Date(t.deadline).getTime() >= date.getTime())
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0] || null;
}
function classAlarmBody(c, s, date) {
  let body = (s.start || '') + (s.end ? '-' + s.end : '') + ' 上课' + (s.location ? ' · ' + s.location : ' · 地点未填') + (c.teacher ? ' · ' + c.teacher : '');
  const t = classTaskFor(c, date);
  body += t ? ' · 待办：' + t.name + '（' + fmtDT(t.deadline) + '）' : ' · 本节课暂无待办';
  return body.slice(0, 150);
}
function syncClassReminders() {
  (DB.classAlarmIds || []).forEach(id => Bridge.cancel(id));
  DB.classAlarmIds = [];
  if (!DB.settings.reminders || DB.settings.classReminders === false) { saveDB(); return; }
  const lead = (+DB.settings.classLead || 20) * 60000;
  const now = Date.now();
  const items = [];
  DB.courses.forEach(c => {
    (c.sessions || []).forEach((s, si) => {
      if (!s.start) return;
      let base = nextSessionAt(s);
      for (let k = 0; k < 10; k++) {
        if (!base) break;
        if (!weekAllowed(s, base)) { base = new Date(base.getTime() + 7 * 864e5); continue; }
        const start = base.getTime();
        let at = start - lead;
        let immediate = false;
        if (at < now + 5000) {
          if (start > now + 60000) { at = now + 5000; immediate = true; }
          else { base = new Date(start + 7 * 864e5); continue; }
        }
        items.push({ c: c, s: s, si: si, at: at, immediate: immediate, date: base });
        base = new Date(start + 7 * 864e5);
      }
    });
  });
  items.sort((a, b) => a.at - b.at);
  items.slice(0, 100).forEach(it => {
    const ymd = it.date.getFullYear() + ('0' + (it.date.getMonth() + 1)).slice(-2) + ('0' + it.date.getDate()).slice(-2);
    const id = 'class_' + it.c.id + '_' + it.si + '_' + ymd;
    const leadMin = Math.max(1, Math.round((it.date.getTime() - it.at) / 60000));
    const title = (it.immediate ? '即将上课 · ' : '还有 ' + leadMin + ' 分钟上课 · ') + it.c.course;
    Bridge.notifyAt(id, title, classAlarmBody(it.c, it.s, it.date), it.at);
    DB.classAlarmIds.push(id);
  });
  saveDB();
}

/* ================= 数据导入导出 ================= */
function exportJSON() {
  const data = {
    app: '课程入口', version: '1.8.0', exported_at: nowISO(),
    courses: DB.courses, pending: [], imports: DB.imports,
    ledger: DB.ledger, settings: Object.assign({}, DB.settings, { key: '', ocrKey: '' })
  };
  download('课程入口备份-' + fmtDay(nowISO()) + '.json', JSON.stringify(data, null, 2), 'application/json');
  ledgerAdd({ stage: '数据导出', tool: '本地导出', prompt: '导出课程/待办/台账备份（不含 Key）', input: '', output: DB.courses.length + ' 门课程 / ' + DB.ledger.length + ' 条台账', human: '', reviewer: '用户' });
}
function doImportBackup(replace) {
  const d = UI.backupData; if (!d) return;
  try {
    if (replace) {
      allTasks().forEach(x => Bridge.cancel('task_' + x.t.id));
      DB.courses = d.courses || [];
      DB.ledger = d.ledger || [];
      DB.imports = d.imports || [];
    } else {
      (d.courses || []).forEach(c => {
        if (!DB.courses.some(x => normName(x.course) === normName(c.course))) DB.courses.push(c);
      });
      if (d.ledger) DB.ledger = (d.ledger || []).concat(DB.ledger).slice(0, 300);
    }
    saveDB(); syncReminders(); closeSheet();
    ledgerAdd({ stage: '数据导入', tool: '本地导入', prompt: replace ? '覆盖导入备份' : '合并导入备份', input: '', output: (d.courses || []).length + ' 门课程', human: '', reviewer: '用户' });
    toast('备份已导入'); go('#/home');
  } catch (e) { toast('导入失败：' + e.message); }
}

function ledgerMD() {
  let s = '# AI 使用台账 · 课程入口\n\n导出时间：' + fmtDT(nowISO()) + '\n\n';
  s += '| 时间 | 环节 | AI/工具 | 关键提示词 | 输入（截断） | 输出（截断） | 人工修改/核查 | 核查人 |\n|---|---|---|---|---|---|---|---|\n';
  DB.ledger.forEach(l => {
    const f = v => String(v || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 160);
    s += '| ' + f(l.at) + ' | ' + f(l.stage) + ' | ' + f(l.tool) + ' | ' + f(l.prompt) + ' | ' + f(l.input) + ' | ' + f(l.output) + ' | ' + f(l.human) + ' | ' + f(l.reviewer) + ' |\n';
  });
  s += '\n---\n本台账由应用自动生成，记录本地规则引擎、可选云端 AI 与人工确认环节。\n';
  return s;
}
function ledgerCSV() {
  const rows = [['时间', '环节', '工具', '关键提示词', '输入', '输出', '人工修改', '核查人']];
  DB.ledger.forEach(l => rows.push([l.at, l.stage, l.tool, l.prompt, l.input, l.output, l.human, l.reviewer]));
  return rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
}

/* ================= 云端识别 ================= */
const CLOUD_PROMPT = '你是课程通知信息抽取器。只输出一个 JSON 对象，不要解释、不要 Markdown。字段固定：' +
  '{"course":"", "teacher":"", "platforms":[{"name":"","purpose":"","entry_type":"web", "entry_value":""}], ' +
  '"tasks":[{"name":"","deadline":"YYYY-MM-DDTHH:mm:00","type":"作业"}], "group_info":{"type":"QQ群","value":""}, ' +
  '"confidence":{"course":0,"platforms":0,"tasks":0}}。' +
  'platforms 的 purpose 只能取：提交作业、签到、考试、查看通知、讨论、直播上课、下载资料。' +
  '没有的信息留空字符串，不要编造链接。deadline 没有提到时间就留空。中文输出。';

function cloudAsk() {
  if (!DB.settings.cloud) { toast('先在“我的 → 云端 AI”开启'); return; }
  if (!DB.settings.key) { toast('还没有填写 API Key'); go('#/cloud'); return; }
  const ta = $('#pasteText'); const text = ta ? ta.value.trim() : '';
  if (text.length < 6) { toast('先粘贴一段课程通知'); return; }
  const r = redact(text);
  UI.cloudRaw = text;
  UI.cloudRedacted = r.text;
  openSheet('云端识别确认', '<div class="notice warn"><svg><use href="#i-shield"/></svg><div>将发送<b>脱敏后</b>的文本到你配置的接口，原文不会上传。共隐藏 ' + r.count + ' 处手机号/邮箱/长数字。</div></div>' +
    '<div class="rawbox mt12" style="max-height:180px">' + ESC(r.text) + '</div>' +
    '<p class="tip">接口：' + ESC(DB.settings.endpoint) + '<br>模型：' + ESC(DB.settings.model) + '</p>',
    '<button class="btn ghost" data-act="close-sheet">取消</button><button class="btn primary" data-act="cloud-send">发送并识别</button>');
}
function cloudSend() {
  closeSheet();
  if (UI.cloudBusy) return;
  UI.cloudBusy = true;
  toast('正在请求云端识别…');
  const body = {
    model: DB.settings.model || 'deepseek-chat',
    messages: [{ role: 'system', content: CLOUD_PROMPT }, { role: 'user', content: UI.cloudRedacted }],
    temperature: 0, stream: false, max_tokens: 900
  };
  try { Bridge.httpPost(DB.settings.endpoint, DB.settings.key, JSON.stringify(body)); }
  catch (e) { UI.cloudBusy = false; toast('请求失败：' + e.message); }
}
function cloudDone(res) {
  UI.cloudBusy = false;
  if (!res.ok) { toast('云端识别失败：' + (res.error || ('HTTP ' + res.status))); return; }
  try {
    let body = res.body;
    if (typeof body === 'string') body = JSON.parse(body);
    let content = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
    if (!content) throw new Error('返回里没有 choices[0].message.content');
    content = String(content).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const start = content.indexOf('{'), end = content.lastIndexOf('}');
    if (start >= 0 && end > start) content = content.slice(start, end + 1);
    const r = JSON.parse(content);
    const parsed = normalizeCloud(r);
    ledgerAdd({ stage: 'AI 识别（云端）', tool: '云端 AI · ' + DB.settings.model, prompt: CLOUD_PROMPT, input: UI.cloudRedacted, output: JSON.stringify(r), human: '', reviewer: '待人工确认' });
    startConfirm(parsed, UI.cloudRaw, '云端 AI（脱敏）');
  } catch (e) {
    toast('云端返回无法解析，已保留本地规则结果');
    console.error(e);
  }
}
function normalizeCloud(r) {
  const list = Parser.PLATFORMS;
  const platforms = (r.platforms || []).filter(p => p && p.name).slice(0, 5).map(p => {
    const def = list.find(x => x.name === p.name || (x.aliases || []).includes(p.name));
    return {
      id: uid('pf'), name: p.name, purpose: p.purpose || '查看通知',
      entry_type: p.entry_type || (def ? def.type : 'web'),
      entry_value: p.entry_value || (def ? def.url : ''),
      fallback: '复制链接', status: (p.entry_value || (def && def.url)) ? '可用' : '需复制'
    };
  });
  const tasks = (r.tasks || []).filter(t => t && t.name).slice(0, 8).map(t => {
    let dl = t.deadline || '';
    if (dl && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dl)) {
      const d = Parser.parseDeadline(dl, new Date());
      dl = d ? Parser.iso(d.date) : '';
    }
    if (dl && dl.length === 16) dl += ':00';
    return { id: uid('tk'), name: String(t.name).slice(0, 30), deadline: dl, platform: '', type: t.type || '作业', status: '未完成', confidence: 0.8, deadlineConfidence: dl ? 0.8 : 0.3 };
  });
  const g = r.group_info && r.group_info.value ? { type: r.group_info.type || 'QQ群', value: r.group_info.value, fallback: '复制群号' } : null;
  const conf = r.confidence || {};
  return {
    course: r.course || '未识别课程', teacher: r.teacher || '', platforms, tasks, group_info: g,
    confidence: { course: conf.course || 0.75, teacher: conf.teacher || 0.6, platforms: conf.platforms || 0.7, tasks: conf.tasks || 0.7, deadline: conf.tasks || 0.7 },
    source: '云端 AI（脱敏）', raw_text: UI.cloudRaw || '', created_at: nowISO(), updated_at: nowISO()
  };
}

/* ================= 演示 / 初始化 ================= */
function loadDemo() {
  if (DB.courses.length) {
    openSheet('载入示例', '<p>当前已有 ' + DB.courses.length + ' 门课程，载入示例会追加 3 门演示课程，不会删除已有数据。</p>',
      '<button class="btn ghost" data-act="close-sheet">取消</button><button class="btn primary" data-act="demo-yes">载入</button>');
    return;
  }
  insertDemo();
}
function insertDemo() {
  Parser.demo(new Date()).forEach(c => {
    c.imports = [{ at: nowISO(), source: '示例数据' }];
    DB.courses.push(c);
  });
  saveDB(); syncReminders();
  toast('已载入示例课程'); go('#/home'); renderHome();
}

/* 启动 */
applyTheme();
syncReminders();
if (!location.hash) location.hash = '#/home';
router();

})();
