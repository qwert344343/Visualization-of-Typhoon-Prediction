/**
 * 应用入口：状态管理、SSE 实时更新、侧栏/详情面板/回放条交互、设置页
 * 设置项（语言/布局/主题/数据线路/图层偏好）均持久化到 localStorage
 */
import { initMap, renderTyphoons, renderWarningLines, renderWarnings, applyBasemap, flyToTyphoon, fitTyphoon } from './map.js';
import {
  INTENSITY, INTENSITY_ORDER, WIND_LEVELS, ORG_CODES, intensityOf, windLevelName, orgName,
  windScale, fmtBJT, fmtCoord, haversine, CITIES, typhoonIcon,
} from './typhoon.js';
import { t, initLang, setLang, applyI18n, getLang } from './i18n.js';

/* ---------------- 全局状态 ---------------- */

const state = {
  typhoons: [],          // 已加载详情的台风
  list: [],              // 简表（含未加载详情的）
  warnings: { items: [], fetchedAt: 0 },
  selectedId: null,
  playIndex: null,       // null = 实时（最新点）
  playing: false,
  showWind: { '30KTS': true, '50KTS': true, '64KTS': true },
  showForecast: true,
  showWarnLines: true,
  showWarnings: true,
  showLabels: true,
  orgFilter: { BABJ: true },
  basemap: null,         // null = 尚未确定，按数据线路默认值初始化
  mode: 'live',          // live | year
  yearTyphoons: [],
  historyYear: null,
  loadedIds: new Set(),
  // —— 设置页选项 ——
  lang: '',              // '' = 首次访问按浏览器语言自动选择
  layout: 'auto',        // auto | desktop | mobile
  theme: 'dark',         // dark | light
  route: 'auto',         // auto | cn | global
};

const detailCache = new Map();
let playTimer = null;

/* ---------------- 偏好持久化 ---------------- */

const PREF_KEY = 'typhoon-webgis.prefs.v1';

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (p.showWind) state.showWind = { ...state.showWind, ...p.showWind };
    for (const k of ['showForecast', 'showWarnLines', 'showWarnings', 'showLabels']) {
      if (typeof p[k] === 'boolean') state[k] = p[k];
    }
    if (p.orgFilter) state.orgFilter = { ...p.orgFilter };
    if (typeof p.basemap === 'string') state.basemap = p.basemap;
    for (const k of ['lang', 'layout', 'theme', 'route']) {
      if (typeof p[k] === 'string' && p[k]) state[k] = p[k];
    }
  } catch { /* 忽略损坏的本地数据 */ }
}

function savePrefs() {
  const p = {
    showWind: state.showWind, showForecast: state.showForecast,
    showWarnLines: state.showWarnLines, showWarnings: state.showWarnings,
    showLabels: state.showLabels, orgFilter: state.orgFilter, basemap: state.basemap,
    lang: state.lang, layout: state.layout, theme: state.theme, route: state.route,
  };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* 隐私模式等场景 */ }
}

/* ---------------- 设置应用：语言 / 布局 / 主题 / 数据线路 ---------------- */

const BASEMAP_KEYS = ['tdtvec', 'tdtimg', 'tdtter', 'esriocean', 'esriimg', 'osm'];
const basemapsValid = (k) => BASEMAP_KEYS.includes(k);

/** 数据线路：auto 按时区判断（中国时区 → 中国线路） */
function detectRoute() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    return ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei', 'Asia/Urumqi', 'Asia/Chongqing', 'Asia/Harbin'].includes(tz)
      ? 'cn' : 'global';
  } catch { return 'cn'; }
}

const effectiveRoute = () => (state.route === 'auto' ? detectRoute() : state.route);

/** 线路对应默认底图：中国=天地图（NMC 代理），海外=Esri 海洋 */
const routeBasemap = () => (effectiveRoute() === 'cn' ? 'tdtvec' : 'esriocean');

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = state.theme === 'light' ? '#eef1f5' : '#0b1424';
}

/** 计算生效布局（auto 按视口宽度）并写到 <html data-eff-layout>，CSS 据此切换抽屉/平铺 */
function applyLayout() {
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  const eff = state.layout === 'mobile' ? 'mobile'
    : state.layout === 'desktop' ? 'desktop'
      : (narrow ? 'mobile' : 'desktop');
  document.documentElement.dataset.effLayout = eff;
  if (eff === 'desktop') { closeDrawer('#sidebar'); closeDrawer('#detail'); }
}

const isMobile = () => document.documentElement.dataset.effLayout === 'mobile';

/** 语言切换后刷新所有动态文案 */
function applyLanguage() {
  const lang = getLang();
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('app.docTitle');
  applyI18n();
  if (lastSseStatus) setSseStatus(lastSseStatus);
  rebuildLegend();
  rebuildOrgChecks();
  buildYearOptions();
  renderAll();
  if (state.mode === 'year' && state.historyYear) {
    $('#mode-banner').textContent = t('banner.history', { year: state.historyYear, n: state.yearTyphoons.length });
  }
}

/* ---------------- 工具 ---------------- */

const $ = (sel) => document.querySelector(sel);

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, warn = false) {
  const box = $('#toast-box');
  const el = document.createElement('div');
  el.className = 'toast' + (warn ? ' warn' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function showLoading(show) {
  $('#map-loading').style.display = show ? 'flex' : 'none';
}

let lastSseStatus = null;

function setSseStatus(st) {
  lastSseStatus = st;
  const dot = $('#sse-dot'), txt = $('#sse-text');
  if (st === 'on') { dot.className = 'dot dot-on'; txt.textContent = t('status.connected'); }
  else if (st === 'wait') { dot.className = 'dot dot-wait'; txt.textContent = t('status.reconnecting'); }
  else { dot.className = 'dot dot-off'; txt.textContent = t('status.offline'); }
}

function updateLastUpdate(ms) {
  $('#last-update').textContent = ms ? fmtBJT(ms) : '--';
}

/** 深色底图上纯蓝 (#0000ff) 轨迹偏暗，换成亮蓝；浅色主题直接用原色 */
const readableColor = (color) =>
  (state.theme === 'light' || color !== '#0000ff') ? color : '#5b9bff';

/* ---------------- 渲染 ---------------- */

function renderAll() {
  // 历史模式只绘制选中的历史台风；实时模式绘制全部已加载台风
  const renderList = state.mode === 'live'
    ? state.typhoons
    : (state.selectedId && detailCache.has(state.selectedId) ? [detailCache.get(state.selectedId)] : []);
  renderTyphoons(renderList, {
    selectedId: state.selectedId,
    playIndex: state.playIndex,
    showWind: state.showWind,
    showForecast: state.showForecast,
    showLabels: state.showLabels,
    orgFilter: state.orgFilter,
  });
  renderSidebar();
  renderDetail();
  renderPlaybar();
  renderEmptyState();
}

/** 无活跃台风时的地图空状态引导 */
function renderEmptyState() {
  const box = $('#map-empty');
  const nothingDrawn = state.mode === 'live' && !state.typhoons.length && !state.selectedId;
  box.style.display = nothingDrawn ? 'flex' : 'none';
}

function renderSidebar() {
  const topBox = $('#typhoon-list');
  const title = $('#list-title');
  topBox.innerHTML = '';
  if (state.mode === 'live') {
    const live = state.list.filter(x => x.active);
    const stopped = state.list.filter(x => !x.active).slice(0, 20);
    title.textContent = t('list.activeCount', { n: live.length });
    if (!live.length && !stopped.length) topBox.innerHTML = `<div class="empty">${escapeHtml(t('list.empty'))}</div>`;
    for (const x of [...live, ...stopped]) topBox.appendChild(tyCard(x, state.loadedIds.has(x.id)));
  } else {
    title.textContent = t('list.historyCount', { year: $('#year-select').value, n: state.yearTyphoons.length });
    if (!state.yearTyphoons.length) topBox.innerHTML = `<div class="empty">${escapeHtml(t('list.yearEmpty'))}</div>`;
    for (const x of state.yearTyphoons) topBox.appendChild(tyCard(x, state.loadedIds.has(x.id)));
  }
}

function tyCard(x, loaded) {
  const ty = detailCache.get(x.id);
  const cur = ty && ty.points.length ? ty.points[ty.points.length - 1] : null;
  const div = document.createElement('div');
  div.className = 'ty-card' + (x.id === state.selectedId ? ' selected' : '');
  const badge = x.active
    ? `<span class="badge live">${escapeHtml(t('list.live'))}</span>`
    : `<span class="badge">${escapeHtml(t('list.stopped'))}</span>`;
  const ic = cur ? intensityOf(cur.code) : null;
  const inten = ic ? `<span style="color:${readableColor(ic.color)}">●</span> ${escapeHtml(ic.name)}` : '';
  div.innerHTML = `
    <div class="t-head">
      <span class="t-name">${escapeHtml(x.cnId || '')} ${escapeHtml(x.nameCn)}</span>
      <span class="t-en">${escapeHtml(x.nameEn)}</span>
      ${badge}
    </div>
    <div class="t-meta">
      ${cur ? `${inten} · ${cur.wind ?? '--'}m/s · ${cur.pressure ?? '--'}hPa` : (loaded ? escapeHtml(t('list.noTrack')) : escapeHtml(t('list.clickToLoad')))}
      ${cur ? `· ${fmtBJT(cur.time)}` : ''}
    </div>`;
  div.onclick = () => selectTyphoon(x.id, { fly: true });
  return div;
}

/* ---------------- 详情面板 ---------------- */

function renderDetail() {
  const body = $('#detail-body');
  const ty = state.selectedId ? detailCache.get(state.selectedId) : null;
  $('#btn-drawer-detail').style.display = ty ? '' : 'none';
  if (!ty) {
    body.innerHTML = `<div class="empty">${escapeHtml(t('detail.placeholder'))}</div>`;
    return;
  }
  const cur = state.playIndex != null && ty.points[state.playIndex]
    ? ty.points[state.playIndex]
    : (ty.points.length ? ty.points[ty.points.length - 1] : null);
  if (!cur) { body.innerHTML = `<div class="empty">${escapeHtml(t('list.noTrack'))}</div>`; return; }

  const ic = intensityOf(cur.code);
  const playing = state.playIndex != null;
  const cityRows = CITIES.map(([name, lat, lon]) => ({ name, d: haversine(cur.lat, cur.lon, lat, lon) }))
    .sort((a, b) => a.d - b.d).slice(0, 6);

  // 预报表（回放模式显示该时点发布的预报）
  const fc = cur.forecast || {};
  const fcOrgs = Object.entries(fc).filter(([org]) => state.orgFilter[org] !== false);
  let fcHtml = '';
  for (const [org, pts] of fcOrgs) {
    if (!pts.length) continue;
    const rows = pts.map(p => {
      const pi = intensityOf(p.code);
      return `<tr>
        <td>+${p.h}h</td><td>${fmtBJT(p.time)}</td>
        <td class="num">${p.lat.toFixed(1)},${p.lon.toFixed(1)}</td>
        <td class="num">${p.pressure ?? '--'}</td>
        <td class="num">${p.wind ?? '--'}</td>
        <td><span class="chip" style="background:${pi.color === '#0000ff' ? '#1d5cd6' : pi.color}">${escapeHtml(pi.name)}</span></td>
      </tr>`;
    }).join('');
    fcHtml += `<h3>${escapeHtml(t('detail.forecastBy', { org: orgName(org) }))}</h3>
      <table class="mini"><tr><th>${escapeHtml(t('table.h'))}</th><th>${escapeHtml(t('table.time'))}</th><th>${escapeHtml(t('table.pos'))}</th><th class="num">${escapeHtml(t('table.pressure'))}</th><th class="num">${escapeHtml(t('table.wind'))}</th><th>${escapeHtml(t('table.strength'))}</th></tr>${rows}</table>`;
  }
  if (!fcHtml) fcHtml = `<div class="empty" style="padding:6px 0">${escapeHtml(t('detail.noForecast'))}</div>`;

  // 风圈表
  const wr = cur.windRadius || {};
  const wrRows = Object.entries(WIND_LEVELS).map(([code, cfg]) => {
    const r = wr[code];
    if (!r) return '';
    return `<tr><td><span class="chip" style="background:${cfg.color};color:#1a1a1a">${escapeHtml(windLevelName(code))}</span></td>
      <td class="num">${r.ne ?? '--'}</td><td class="num">${r.se ?? '--'}</td>
      <td class="num">${r.sw ?? '--'}</td><td class="num">${r.nw ?? '--'}</td></tr>`;
  }).join('');

  const moveDir = cur.moveDir === '少动' ? t('move.stationary') : (cur.moveDir || '--');
  const first = ty.points[0];
  body.innerHTML = `
    <div class="detail-head">
      <span class="num">${escapeHtml(ty.cnId)}</span>
      <span class="cn">${escapeHtml(ty.nameCn)}</span>
      <span class="en">${escapeHtml(ty.nameEn)}</span>
      <span class="badge ${ty.active ? 'live' : ''}">${ty.active ? escapeHtml(t('list.live')) : escapeHtml(t('list.stopped'))}</span>
    </div>
    <div class="detail-sub">
      ${playing ? escapeHtml(t('detail.replayHint')) : escapeHtml(t('detail.live'))}
      · ${escapeHtml(t('detail.generatedAt', { t: fmtBJT(first.time), n: ty.points.length }))}
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="k">${escapeHtml(t('detail.intensity'))}</div><div class="v" style="color:${readableColor(ic.color)}">${escapeHtml(ic.name)}</div></div>
      <div class="stat"><div class="k">${escapeHtml(t('detail.timeBJT'))}</div><div class="v" style="font-size:13px">${fmtBJT(cur.time)}</div></div>
      <div class="stat"><div class="k">${escapeHtml(t('detail.position'))}</div><div class="v" style="font-size:13px">${fmtCoord(cur.lat, cur.lon)}</div></div>
      <div class="stat"><div class="k">${escapeHtml(t('detail.pressure'))}</div><div class="v">${cur.pressure ?? '--'} <small>hPa</small></div></div>
      <div class="stat"><div class="k">${escapeHtml(t('detail.maxWind'))}</div><div class="v">${cur.wind ?? '--'} <small>m/s（${windScale(cur.wind)}）</small></div></div>
      <div class="stat"><div class="k">${escapeHtml(t('detail.move'))}</div><div class="v" style="font-size:14px">${escapeHtml(moveDir)} / ${cur.moveSpeed ?? '--'} <small>km/h</small></div></div>
    </div>
    ${wrRows ? `<div class="detail-section"><h3>${escapeHtml(t('detail.radiusTable'))}</h3>
      <table class="mini"><tr><th>${escapeHtml(t('table.level'))}</th><th class="num">${escapeHtml(t('quad.ne'))}</th><th class="num">${escapeHtml(t('quad.se'))}</th><th class="num">${escapeHtml(t('quad.sw'))}</th><th class="num">${escapeHtml(t('quad.nw'))}</th></tr>${wrRows}</table></div>` : ''}
    <div class="detail-section"><h3>${escapeHtml(t('detail.cities'))}</h3>
      ${cityRows.map(c => `<div class="city-item ${c.d < 300 ? 'near' : ''}"><span>${escapeHtml(c.name)}</span><span>${c.d < 1 ? '<300m' : c.d.toFixed(0) + ' km'}</span></div>`).join('')}
    </div>
    <div class="detail-section">${fcHtml}</div>
    <div class="detail-sub" style="margin-top:12px">${escapeHtml(t('detail.source'))}${ty.meaning ? ` · ${escapeHtml(t('detail.meaning', { m: ty.meaning }))}` : ''}</div>`;
}

/* ---------------- 回放条 ---------------- */

function renderPlaybar() {
  const bar = $('#playbar');
  const ty = state.selectedId ? detailCache.get(state.selectedId) : null;
  if (!ty || !ty.points.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const slider = $('#play-slider');
  const max = ty.points.length - 1;
  slider.max = max;
  slider.value = state.playIndex != null ? state.playIndex : max;
  const cur = ty.points[state.playIndex != null ? state.playIndex : max];
  $('#play-time').textContent = `${fmtBJT(cur.time)}${state.playIndex != null ? '' : t('play.liveSuffix')}`;
}

function stopPlay() {
  state.playing = false;
  clearInterval(playTimer);
  playTimer = null;
  $('#btn-play').textContent = '▶';
}

function startPlay() {
  const ty = state.selectedId ? detailCache.get(state.selectedId) : null;
  if (!ty || !ty.points.length) return;
  if (state.playIndex == null) state.playIndex = 0;
  state.playing = true;
  $('#btn-play').textContent = '⏸';
  const speed = +$('#play-speed').value || 1000;
  clearInterval(playTimer);
  playTimer = setInterval(() => {
    const t2 = detailCache.get(state.selectedId);
    if (!t2) return stopPlay();
    if (state.playIndex >= t2.points.length - 1) { stopPlay(); return; }
    state.playIndex += 1;
    renderAll();
  }, speed);
}

/* ---------------- 选择台风 ---------------- */

async function selectTyphoon(id, { fly = true, fit = false, user = true } = {}) {
  state.selectedId = id;
  state.playIndex = null;
  stopPlay();
  if (!state.loadedIds.has(id) && !detailCache.has(id)) {
    showLoading(true);
    try {
      const ty = await fetchJSON(`/api/typhoons/${id}`);
      detailCache.set(id, ty);
      state.loadedIds.add(id);
      if (state.mode === 'live' && !state.typhoons.some(x => x.id === id)) {
        state.typhoons.push(ty);
      }
    } catch (e) {
      toast(t('toast.detailFailed', { m: e.message }), true);
    } finally { showLoading(false); }
  }
  const ty = detailCache.get(id);
  renderAll();
  if (ty && fly) flyToTyphoon(ty);
  if (ty && fit) fitTyphoon(ty);
  // 移动端：用户主动选择时收起列表抽屉、展开详情（首次自动选中不打扰）
  if (user && isMobile()) {
    closeDrawer('#sidebar');
    openDrawer('#detail');
  }
}

/* ---------------- 移动端抽屉 ---------------- */

function openDrawer(sel) {
  const el = $(sel);
  if (!el) return;
  el.classList.add('open');
  $('#backdrop').classList.add('show');
}

function closeDrawer(sel) {
  const el = $(sel);
  if (el) el.classList.remove('open');
  if (!$('#sidebar').classList.contains('open') && !$('#detail').classList.contains('open')) {
    $('#backdrop').classList.remove('show');
  }
}

/* ---------------- 数据加载 ---------------- */

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

/** 应用服务端推送/拉取的台风数据（live 模式） */
function applyTyphoonPayload(payload) {
  state.list = payload.list || [];
  if (state.mode !== 'live') { updateLastUpdate(payload.fetchedAt); return; }
  // 合并推送数据与本地已加载台风：推送只含活跃台风，
  // 本地刚加载的停编台风不应在下次推送后从地图上消失
  const merged = new Map((payload.typhoons || []).map(x => [x.id, x]));
  for (const x of state.typhoons) if (!merged.has(x.id)) merged.set(x.id, x);
  state.typhoons = [...merged.values()];
  for (const x of state.typhoons) { detailCache.set(x.id, x); state.loadedIds.add(x.id); }
  updateLastUpdate(payload.fetchedAt);
  renderAll();
}

async function loadYear(year) {
  showLoading(true);
  try {
    const data = await fetchJSON(`/api/typhoons?year=${year}`);
    state.mode = 'year';
    state.yearTyphoons = data.list || [];
    state.historyYear = year;
    state.selectedId = null;
    $('#btn-exit-history').style.display = '';
    $('#mode-banner').style.display = '';
    $('#mode-banner').textContent = t('banner.history', { year, n: state.yearTyphoons.length });
    renderAll();
  } catch (e) {
    toast(t('toast.historyFailed', { m: e.message }), true);
  } finally { showLoading(false); }
}

async function exitHistory() {
  state.mode = 'live';
  state.yearTyphoons = [];
  state.historyYear = null;
  state.selectedId = null;
  stopPlay();
  $('#btn-exit-history').style.display = 'none';
  $('#mode-banner').style.display = 'none';
  renderAll();
}

/* ---------------- SSE 实时推送 ---------------- */

function connectSSE() {
  const es = new EventSource('/api/stream');
  es.addEventListener('open', () => setSseStatus('on'));
  es.addEventListener('typhoons', (ev) => {
    setSseStatus('on');
    const payload = JSON.parse(ev.data);
    const prevCount = state.list.filter(x => x.active).length;
    const isFirst = state.list.length === 0;
    applyTyphoonPayload(payload);
    if (!isFirst && (payload.typhoons || []).length !== prevCount) {
      toast(t('toast.countChanged', { n: (payload.typhoons || []).length }), true);
    } else if (!isFirst) {
      toast(t('toast.updated', { t: fmtBJT(Date.now(), false) }));
    }
  });
  es.addEventListener('warnings', (ev) => {
    state.warnings = JSON.parse(ev.data);
    renderWarnings(state.warnings, state.showWarnings);
  });
  es.onerror = () => setSseStatus('wait');
  es.addEventListener('error', () => setSseStatus('wait'));
}

/* ---------------- 设置弹窗 ---------------- */

function bindSeg(sel, isActive, onPick) {
  const box = $(sel);
  const sync = () => {
    for (const b of box.querySelectorAll('button')) b.classList.toggle('active', isActive(b.dataset.value));
  };
  for (const b of box.querySelectorAll('button')) {
    b.addEventListener('click', () => { onPick(b.dataset.value); sync(); });
  }
  return sync;
}

function bindSettings() {
  const mask = $('#settings-mask');
  const close = () => { mask.style.display = 'none'; };
  $('#btn-settings').onclick = () => { mask.style.display = 'flex'; };
  $('#btn-settings-close').onclick = close;
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  bindSeg('#seg-lang', v => v === state.lang || (!state.lang && v === 'zh'), v => {
    state.lang = v; savePrefs(); setLang(v); applyLanguage();
  });
  bindSeg('#seg-layout', v => v === state.layout, v => {
    state.layout = v; savePrefs(); applyLayout();
  });
  bindSeg('#seg-theme', v => v === state.theme, v => {
    state.theme = v; savePrefs(); applyTheme(); renderAll();
  });
  bindSeg('#seg-route', v => v === state.route, v => {
    state.route = v; savePrefs();
    // 线路切换时自动切到对应默认底图，保证加载速度
    state.basemap = routeBasemap();
    savePrefs();
    $('#basemap-select').value = state.basemap;
    applyBasemap(state.basemap);
  });
}

/* ---------------- 事件绑定 ---------------- */

function rebuildLegend() {
  const lg = $('#legend');
  lg.innerHTML = INTENSITY_ORDER.map(code => {
    const ic = intensityOf(code);
    return `<div class="lg-item"><span class="lg-dot" style="background:${readableColor(ic.color)}"></span>${escapeHtml(ic.name)}</div>`;
  }).join('');
}

function rebuildOrgChecks() {
  const orgBox = $('#org-checks');
  orgBox.innerHTML = '';
  for (const code of ORG_CODES) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" data-org="${code}" ${state.orgFilter[code] !== false ? 'checked' : ''}> ${escapeHtml(orgName(code))}`;
    orgBox.appendChild(label);
  }
}

function buildYearOptions() {
  const yearSel = $('#year-select');
  const prev = yearSel.value;
  const thisYear = new Date().getFullYear();
  yearSel.innerHTML = '';
  for (let y = thisYear; y >= 2015; y--) {
    yearSel.add(new Option(String(y), y));
  }
  if (prev) yearSel.value = prev;
}

function bindUI() {
  // 图层开关（勾选状态与记忆的偏好同步）
  const bindCk = (id, fn) => {
    const ck = $(id);
    ck.addEventListener('change', e => fn(e.target.checked));
    return ck;
  };
  const ck30 = bindCk('#ck-wind30', v => { state.showWind['30KTS'] = v; renderAll(); savePrefs(); });
  const ck50 = bindCk('#ck-wind50', v => { state.showWind['50KTS'] = v; renderAll(); savePrefs(); });
  const ck64 = bindCk('#ck-wind64', v => { state.showWind['64KTS'] = v; renderAll(); savePrefs(); });
  const ckFc = bindCk('#ck-forecast', v => { state.showForecast = v; renderAll(); savePrefs(); });
  const ckLine = bindCk('#ck-warnline', v => { state.showWarnLines = v; renderWarningLines(v); savePrefs(); });
  const ckWarn = bindCk('#ck-warnings', v => { state.showWarnings = v; renderWarnings(state.warnings, v); savePrefs(); });
  const ckLabel = bindCk('#ck-labels', v => { state.showLabels = v; renderAll(); savePrefs(); });
  ck30.checked = state.showWind['30KTS']; ck50.checked = state.showWind['50KTS']; ck64.checked = state.showWind['64KTS'];
  ckFc.checked = state.showForecast; ckLine.checked = state.showWarnLines;
  ckWarn.checked = state.showWarnings; ckLabel.checked = state.showLabels;

  const basemapSel = $('#basemap-select');
  if (!state.basemap || !basemapsValid(state.basemap)) state.basemap = routeBasemap();
  basemapSel.value = state.basemap;
  basemapSel.addEventListener('change', e => { applyBasemap(e.target.value); state.basemap = e.target.value; savePrefs(); });

  // 预报机构
  rebuildOrgChecks();
  const orgBox = $('#org-checks');
  orgBox.addEventListener('change', () => {
    for (const input of orgBox.querySelectorAll('input')) {
      state.orgFilter[input.dataset.org] = input.checked;
    }
    savePrefs();
    renderAll();
  });

  // 刷新
  $('#btn-refresh').onclick = async () => {
    showLoading(true);
    try {
      const payload = await fetchJSON('/api/refresh', { method: 'POST' });
      applyTyphoonPayload(payload);
      toast(t('toast.refreshed', { t: fmtBJT(Date.now()) }));
    } catch (e) { toast(t('toast.refreshFailed', { m: e.message }), true); }
    finally { showLoading(false); }
  };

  // 历史查询
  buildYearOptions();
  $('#btn-year-load').onclick = () => loadYear($('#year-select').value);
  $('#btn-exit-history').onclick = exitHistory;

  // 回放
  $('#play-slider').addEventListener('input', e => {
    stopPlay();
    state.playIndex = +e.target.value;
    renderAll();
  });
  $('#btn-play').onclick = () => (state.playing ? stopPlay() : startPlay());
  $('#btn-live').onclick = () => { stopPlay(); state.playIndex = null; renderAll(); };
  $('#play-speed').addEventListener('change', () => { if (state.playing) { stopPlay(); startPlay(); } });

  // 空格键播放/暂停（焦点不在表单控件时）
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space') return;
    if (e.target.closest('input, select, textarea, button, a')) return;
    const ty = state.selectedId && detailCache.get(state.selectedId);
    if (!ty || !ty.points.length) return;
    e.preventDefault();
    state.playing ? stopPlay() : startPlay();
  });

  // 移动端抽屉
  $('#btn-drawer-list').onclick = () => openDrawer('#sidebar');
  $('#btn-drawer-detail').onclick = () => {
    const detail = $('#detail');
    detail.classList.contains('open') ? closeDrawer('#detail') : openDrawer('#detail');
  };
  $('#backdrop').onclick = () => { closeDrawer('#sidebar'); closeDrawer('#detail'); };
  window.addEventListener('resize', applyLayout);

  // 地图空状态按钮
  $('#btn-empty-history').onclick = () => loadYear(String(new Date().getFullYear() - 1));
  $('#btn-empty-refresh').onclick = () => $('#btn-refresh').click();
}

/* ---------------- 启动 ---------------- */

async function boot() {
  loadPrefs();
  // 语言：优先记忆的设置，否则按浏览器语言
  const autoLang = (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  initLang(state.lang || autoLang);
  applyTheme();
  applyLayout();
  // 底图：优先记忆的设置，否则按数据线路默认值（中国=天地图，海外=Esri）
  if (!state.basemap || !basemapsValid(state.basemap)) state.basemap = routeBasemap();

  initMap(state, { onSelect: (id) => selectTyphoon(id, { fly: false }) });
  bindUI();
  bindSettings();
  applyLanguage();
  renderWarningLines(state.showWarnLines);
  connectSSE();

  // 首次数据：直接 REST 拉取（SSE 也会推送，双保险）
  showLoading(true);
  try {
    const payload = await fetchJSON('/api/typhoons');
    applyTyphoonPayload(payload);
    const w = await fetchJSON('/api/warnings');
    state.warnings = w;
    renderWarnings(w, state.showWarnings);
    // 默认选中第一个活跃台风（非用户交互，移动端不弹详情抽屉）
    const firstActive = (payload.typhoons || []).find(x => x.active && x.points.length);
    if (firstActive) await selectTyphoon(firstActive.id, { fly: true, fit: true, user: false });
  } catch (e) {
    toast(t('toast.initFailed', { m: e.message }), true);
  } finally {
    showLoading(false);
    // 5 分钟兜底轮询（SSE 断线时也有数据保障）
    setInterval(async () => {
      if (state.mode !== 'live') return;
      try { applyTyphoonPayload(await fetchJSON('/api/typhoons')); } catch { }
    }, 5 * 60e3);
  }
}

boot();
