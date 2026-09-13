/**
 * 中央气象台台风网 (typhoon.nmc.cn) 数据客户端
 * - 拉取 + 解析台风列表 / 台风详情 / 气象预警
 * - 内存缓存 (TTL) + 数据指纹比对（用于判断是否有更新需要推送）
 */
'use strict';

const UPSTREAM = process.env.NMC_UPSTREAM || 'http://typhoon.nmc.cn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

/** 强度码 -> 中文名称（取自中央气象台官网 gis.js） */
const INTENSITY = {
  TC: '热带气旋', TD: '热带低压', TS: '热带风暴', STS: '强热带风暴',
  TY: '台风', STY: '强台风', SuperTY: '超强台风',
};
const INTENSITY_COLOR = {
  TD: '#eed139', TS: '#0000ff', STS: '#0f8000',
  TY: '#fe9c45', STY: '#fe00fe', SuperTY: '#fe0000',
};
/** 预报机构代码 -> 名称（取自官网 typhoon-datas.js） */
const ORG_NAMES = {
  BABJ: '中央气象台', PGTW: '美国联合台风警报中心', RKSL: '韩国气象厅',
  RJTD: '日本气象厅', RUMS: '俄罗斯水文气象中心', DEMS: '印度气象局',
  DKPY: '朝鲜水文气象局', MNUB: '蒙古气象水文局', VHHH: '香港天文台',
  VNNN: '越南水文气象中心', VTBB: '泰国气象厅',
};
/** 风圈等级代码 -> 名称/颜色（官网三级风圈配色） */
const WIND_LEVELS = {
  '30KTS': { name: '七级风圈', color: '#F4D000' },
  '50KTS': { name: '十级风圈', color: '#FD8B00' },
  '64KTS': { name: '十二级风圈', color: '#FD5C1C' },
};

/* ------------------------------------------------------------------ */
/* 基础请求                                                             */
/* ------------------------------------------------------------------ */

async function fetchText(url, { timeout = 15000, retries = 2 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { 'User-Agent': UA, Referer: UPSTREAM + '/', Accept: '*/*' },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      // 上游（typhoon.nmc.cn）实测为 UTF-8 编码
      return Buffer.from(await res.arrayBuffer()).toString('utf8');
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (i < retries) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

/** 剥掉 JSONP 包装（兼容 cb(payload) / cb((payload)) 两种形式） */
function unwrapJsonp(text) {
  const start = text.search(/[{[]/);
  const endObj = text.lastIndexOf('}');
  const endArr = text.lastIndexOf(']');
  const end = Math.max(endObj, endArr);
  if (start === -1 || end === -1 || end < start) throw new Error('JSONP 格式异常');
  return JSON.parse(text.slice(start, end + 1));
}

/* ------------------------------------------------------------------ */
/* 缓存                                                                 */
/* ------------------------------------------------------------------ */

const cache = new Map(); // key -> { value, expires }
function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  cache.delete(key);
  return null;
}
function cacheSet(key, value, ttlMs) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

/** 清除指定前缀的缓存（手动刷新用） */
function clearCache(prefix) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/* 解析                                                                 */
/* ------------------------------------------------------------------ */

/** "202608300000"(UTC) -> 时间戳 ms */
function utcStrToEpoch(s) {
  if (!s || s.length < 12) return null;
  const y = +s.slice(0, 4), mo = +s.slice(4, 6) - 1, d = +s.slice(6, 8);
  const h = +s.slice(8, 10), mi = +s.slice(10, 12);
  return Date.UTC(y, mo, d, h, mi);
}

function parseWindRadius(raw) {
  const out = {};
  for (const item of raw || []) {
    // [level, 东北, 东南, 西南, 西北, pointId]  象限顺序取自官网 leaflet-typhoon.min.js
    if (!item || item.length < 5) continue;
    const [level, ne, se, sw, nw] = item;
    out[level] = { ne, se, sw, nw };
  }
  return out;
}

function parseForecast(raw) {
  const out = {};
  for (const [org, items] of Object.entries(raw || {})) {
    out[org] = (items || []).map(it => ({
      h: it[0],                       // 预报时效(小时)
      time: utcStrToEpoch(it[1]) + it[0] * 3600e3,
      lon: it[2], lat: it[3],
      pressure: it[4], wind: it[5],
      org: it[6], code: it[7],
    })).filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  }
  return out;
}

function parsePoint(p) {
  if (!p || p.length < 10) return null;
  const epoch = typeof p[2] === 'number' ? p[2] : utcStrToEpoch(p[1]);
  // 移向归一化："0"/"no"/空 → 无有效移向（前端显示 少动/--)
  const rawDir = p[8];
  const moveDir = rawDir === '0' ? '少动' : (!rawDir || rawDir === 'no') ? null : rawDir;
  return {
    lon: p[4], lat: p[5],
    time: epoch,
    timeUtc: p[1] || '',
    code: p[3] || 'TC',
    pressure: p[6], wind: p[7],          // 气压 hPa / 近中心最大风速 m/s
    moveDir,                             // 移向
    moveSpeed: p[9],                     // 移速 km/h
    windRadius: parseWindRadius(p[10]),
    forecast: parseForecast(p[11]),
  };
}

function normalizeTyphoon(raw) {
  if (!Array.isArray(raw)) return null;
  const points = (raw[8] || []).map(parsePoint).filter(Boolean)
    .sort((a, b) => a.time - b.time);
  return {
    id: String(raw[0]),
    nameEn: raw[1] || '',
    nameCn: raw[2] || '',
    cnId: String(raw[3] ?? ''),
    meaning: raw[6] || '',
    active: raw[7] === 'start',
    points,
    lastUpdate: points.length ? points[points.length - 1].time : null,
  };
}

/* ------------------------------------------------------------------ */
/* 上游接口                                                             */
/* ------------------------------------------------------------------ */

async function fetchList(year) {
  const path = year ? `list_${year}` : 'list_default';
  const key = 'list:' + (year || 'default');
  const cached = cacheGet(key);
  if (cached) return cached;
  const json = unwrapJsonp(await fetchText(`${UPSTREAM}/weatherservice/typhoon/jsons/${path}?_=${Date.now()}`));
  const list = (json.typhoonList || []).map(item => ({
    id: String(item[0]),
    nameEn: item[1] || '',
    nameCn: item[2] || '',
    cnId: String(item[3] ?? ''),
    meaning: item[6] || '',
    active: item[7] === 'start',
  }));
  const value = { list, fetchedAt: Date.now() };
  cacheSet(key, value, 60e3);
  return value;
}

async function fetchTyphoonDetail(id) {
  const key = 'detail:' + id;
  const cached = cacheGet(key);
  if (cached) return cached;
  const json = unwrapJsonp(await fetchText(`${UPSTREAM}/weatherservice/typhoon/jsons/view_${id}?_=${Date.now()}`));
  const ty = normalizeTyphoon(json.typhoon);
  if (!ty) throw new Error('台风详情解析失败: ' + id);
  cacheSet(key, ty, ty.active ? 120e3 : 6 * 3600e3);
  return ty;
}

async function fetchWarnings() {
  const key = 'warnings';
  const cached = cacheGet(key);
  if (cached) return cached;
  const json = unwrapJsonp(await fetchText(`${UPSTREAM}/weatherservice/fetch_json/warning/json`));
  const items = (Array.isArray(json) ? json : []).map(w => ({
    title: w[0] || '',
    time: w[5] || '',
    icon: w[6] || '',
    lat: parseFloat(w[7]), lon: parseFloat(w[8]),
    text: w[9] || '',
    level: (function () {
      const s = (w[0] || '') + (w[9] || '');
      for (const c of ['蓝色', '黄色', '橙色', '红色']) if (s.includes(c)) return c;
      return '';
    })(),
  })).filter(w => Number.isFinite(w.lat) && Number.isFinite(w.lon));
  const value = { items, fetchedAt: Date.now() };
  cacheSet(key, value, 120e3);
  return value;
}

/** 拉取当前活跃台风的完整数据（列表 + 逐个详情） */
async function fetchActiveBundle() {
  const { list, fetchedAt } = await fetchList(null);
  const activeIds = list.filter(t => t.active).map(t => t.id);
  const results = await Promise.allSettled(activeIds.map(id => fetchTyphoonDetail(id)));
  const typhoons = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  const errors = results.filter(r => r.status === 'rejected').map(r => String(r.reason?.message || r.reason));
  return { typhoons, list, fetchedAt, errors };
}

/** 数据指纹：判断是否有需要向前端推送的变化 */
function fingerprint(bundle) {
  return bundle.typhoons.map(t =>
    `${t.id}:${t.points.length}:${t.lastUpdate || 0}:${t.nameCn}`
  ).join('|');
}

module.exports = {
  UPSTREAM, INTENSITY, INTENSITY_COLOR, ORG_NAMES, WIND_LEVELS,
  fetchList, fetchTyphoonDetail, fetchWarnings, fetchActiveBundle, fingerprint,
  clearCache,
  // 纯解析函数导出用于单元测试
  unwrapJsonp, utcStrToEpoch, parsePoint, normalizeTyphoon,
};
