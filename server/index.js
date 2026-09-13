/**
 * 台风实时监测 WebGIS 后端（零依赖，Node >= 18）
 *
 * 职责：
 *  1. 静态资源服务 (web/)
 *  2. REST API：台风列表/详情、气象预警、元信息、健康检查
 *  3. SSE 实时推送：定时轮询上游，数据变化时向所有客户端广播
 *  4. 天地图瓦片代理（经中央气象台 image.nmc.cn，磁盘缓存）
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const nmc = require('./nmc');

const PORT = +(process.env.PORT || 8080);
const POLL_INTERVAL = +(process.env.POLL_INTERVAL_MS || 5 * 60e3); // 上游轮询间隔
const TILE_CACHE_DIR = path.join(__dirname, '..', 'data', 'cache', 'tiles');
const TILE_CACHE_MAX_MB = +(process.env.TILE_CACHE_MAX_MB || 300);
const WEB_DIR = path.join(__dirname, '..', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

/** 统一时间戳日志 */
const ts = () => new Date().toLocaleString('zh-CN', { hour12: false });

/* 进程级兜底：浏览器中途断开(EPIPE/ECONNRESET)等网络噪音不应拖垮整个服务 */
process.on('uncaughtException', (err) => {
  const code = err?.code || '';
  if (['EPIPE', 'ECONNRESET', 'ERR_STREAM_PREMATURE_CLOSE', 'ECONNABORTED'].includes(code)) return;
  console.error(`[${ts()}] 未捕获异常:`, errMsg(err));
});
process.on('unhandledRejection', (reason) => {
  console.error(`[${ts()}] 未处理的 Promise 拒绝:`, errMsg(reason));
});

/* ------------------------------------------------------------------ */
/* SSE 客户端管理                                                       */
/* ------------------------------------------------------------------ */

const sseClients = new Set();

function sseWrite(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const res of sseClients) {
    try { sseWrite(res, event, data); } catch { sseClients.delete(res); }
  }
}

/* ------------------------------------------------------------------ */
/* 定时轮询上游                                                         */
/* ------------------------------------------------------------------ */

let currentBundle = { typhoons: [], list: [], fetchedAt: 0, errors: [] };
let currentWarnings = { items: [], fetchedAt: 0 };
let lastFingerprint = '';
let warningCount = -1;
let pollTimer = null;

function errMsg(e) {
  const cause = e?.cause ? ` (${e.cause.code || e.cause.message || e.cause})` : '';
  return String(e?.message || e) + cause;
}

async function pollOnce(logChanges = false) {
  const [bundleRes, warnRes] = await Promise.allSettled([
    nmc.fetchActiveBundle(),
    nmc.fetchWarnings(),
  ]);
  if (bundleRes.status === 'fulfilled') {
    const bundle = bundleRes.value;
    const fp = nmc.fingerprint(bundle);
    const changed = fp !== lastFingerprint;
    currentBundle = bundle;
    if (changed) {
      if (logChanges && lastFingerprint) {
        console.log(`[poll] 台风数据更新 ${new Date().toLocaleString('zh-CN')}`);
      }
      lastFingerprint = fp;
      broadcast('typhoons', { ...bundle, source: nmc.UPSTREAM });
    }
  } else {
    console.error('[poll] 台风数据拉取失败:', errMsg(bundleRes.reason));
    scheduleNextPoll(30e3); // 失败后 30s 快速重试
  }
  if (warnRes.status === 'fulfilled') {
    const w = warnRes.value;
    if (w.items.length !== warningCount) {
      warningCount = w.items.length;
      broadcast('warnings', w);
    }
    currentWarnings = w;
  } else {
    console.error('[poll] 预警数据拉取失败:', errMsg(warnRes.reason));
  }
}

function scheduleNextPoll(delay) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => pollOnce(true).finally(() => scheduleNextPoll(POLL_INTERVAL)), delay ?? POLL_INTERVAL);
}

function startPolling() {
  // 启动即拉一次，成功后开始周期轮询
  pollOnce(false).then(() => {
    console.log(`[poll] 首次拉取完成，活跃台风 ${currentBundle.typhoons.length} 个，此后每 ${POLL_INTERVAL / 1000}s 轮询`);
  }).catch(() => {}).finally(() => scheduleNextPoll(POLL_INTERVAL));
}

/* ------------------------------------------------------------------ */
/* 天地图瓦片代理（磁盘缓存）                                            */
/* ------------------------------------------------------------------ */

const TILE_SERVICES = new Set(['vec_w', 'cva_w', 'img_w', 'cia_w', 'ter_w', 'ibo_w']);

async function serveTile(req, res, pathname) {
  // /tiles/tianditu/{service}/{z}/{x}/{y}.png
  const m = pathname.match(/^\/tiles\/tianditu\/(\w+)\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (!m || !TILE_SERVICES.has(m[1])) { res.writeHead(404).end(); return; }
  const [, service, z, x, y] = m;
  const file = path.join(TILE_CACHE_DIR, service, z, `${x}_${y}.png`);
  try {
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
      fs.createReadStream(file).pipe(res);
      return;
    }
  } catch { /* fallthrough */ }
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10000);
    try {
      const upstream = `http://image.nmc.cn/tiles/tianditu/${service}/${z}/${x}/${y}.png`;
      const r = await fetch(upstream, {
        signal: ac.signal,
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'http://typhoon.nmc.cn/' },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
      res.end(buf);
      fs.mkdir(path.dirname(file), { recursive: true }, () =>
        fs.writeFile(file, buf, () => maybeTrimTileCache()));
      return;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
    await new Promise(r2 => setTimeout(r2, 800 * (attempt + 1)));
  }
  res.writeHead(502).end();
}

let trimming = false;
function maybeTrimTileCache() {
  if (trimming) return;
  trimming = true;
  setTimeout(() => {
    try {
      const files = [];
      (function walk(dir) {
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else try { files.push({ p, s: fs.statSync(p).size, t: fs.statSync(p).mtimeMs }); } catch { }
        }
      })(TILE_CACHE_DIR);
      let total = files.reduce((a, f) => a + f.s, 0);
      if (total > TILE_CACHE_MAX_MB * 1048576) {
        files.sort((a, b) => a.t - b.t);
        for (const f of files) {
          if (total <= TILE_CACHE_MAX_MB * 0.8 * 1048576) break;
          try { fs.unlinkSync(f.p); total -= f.s; } catch { }
        }
      }
    } finally { trimming = false; }
  }, 5000);
}

/* ------------------------------------------------------------------ */
/* 预警图标代理                                                         */
/* ------------------------------------------------------------------ */

async function serveWarningIcon(req, res, searchParams) {
  const p = searchParams.get('path') || '';
  if (!/^\/alarm\/[\w-]+\.png$/.test(p)) { res.writeHead(403).end(); return; }
  try {
    const r = await fetch('https://www.nmc.cn' + p, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.nmc.cn/' },
    });
    if (!r.ok) { res.writeHead(502).end(); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
    res.end(buf);
  } catch { res.writeHead(502).end(); }
}

/* ------------------------------------------------------------------ */
/* REST API                                                            */
/* ------------------------------------------------------------------ */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  if (p === '/api/health') {
    return json(res, 200, {
      ok: true, upstream: nmc.UPSTREAM,
      lastFetch: currentBundle.fetchedAt ? new Date(currentBundle.fetchedAt).toISOString() : null,
      activeTyphoons: currentBundle.typhoons.filter(t => t.active).length,
      sseClients: sseClients.size,
    });
  }
  if (p === '/api/typhoons') {
    const year = url.searchParams.get('year');
    try {
      if (year) {
        const { list } = await nmc.fetchList(/^\d{4}$/.test(year) ? year : null);
        return json(res, 200, { year: +year, list, fetchedAt: Date.now() });
      }
      // 默认：活跃台风完整数据 + 近期停编台风简表
      const { list } = await nmc.fetchList(null);
      return json(res, 200, {
        fetchedAt: currentBundle.fetchedAt || Date.now(),
        source: nmc.UPSTREAM,
        typhoons: currentBundle.typhoons,
        list,
        errors: currentBundle.errors,
      });
    } catch (e) {
      return json(res, 502, { error: '上游数据拉取失败: ' + (e.message || e) });
    }
  }
  const detailMatch = p.match(/^\/api\/typhoons\/([\w-]+)$/);
  if (detailMatch) {
    try {
      const ty = await nmc.fetchTyphoonDetail(detailMatch[1]);
      return json(res, 200, ty);
    } catch (e) {
      return json(res, 502, { error: '台风详情拉取失败: ' + (e.message || e) });
    }
  }
  if (p === '/api/warnings') return json(res, 200, currentWarnings.fetchedAt ? currentWarnings : { items: [], fetchedAt: 0 });
  if (p === '/api/refresh' && req.method === 'POST') {
    nmc.clearCache('list:');
    nmc.clearCache('warnings');
    for (const t of currentBundle.typhoons) nmc.clearCache('detail:' + t.id);
    await pollOnce(true);
    return json(res, 200, { ...currentBundle, source: nmc.UPSTREAM, fetchedAt: currentBundle.fetchedAt || Date.now() });
  }
  if (p === '/api/meta') {
    return json(res, 200, {
      source: { name: '中央气象台台风网', url: 'http://typhoon.nmc.cn', dataService: 'typhoon.nmc.cn/weatherservice' },
      orgs: nmc.ORG_NAMES,
      intensity: nmc.INTENSITY,
      intensityColor: nmc.INTENSITY_COLOR,
      windLevels: nmc.WIND_LEVELS,
      pollInterval: POLL_INTERVAL,
      upstreamProxyTiles: true,
    });
  }
  json(res, 404, { error: 'Not Found' });
}

/* ------------------------------------------------------------------ */
/* 静态文件                                                             */
/* ------------------------------------------------------------------ */

function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '/index.html') rel = '/index.html';
  const file = path.normalize(path.join(WEB_DIR, rel));
  if (!file.startsWith(WEB_DIR)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found'); return; }
    const ext = path.extname(file).toLowerCase();
    // html 不缓存以便发版即生效；本地 vendor 库长缓存；其余资源短缓存
    const cache = ext === '.html' ? 'no-cache'
      : rel.startsWith('/vendor/') ? 'public, max-age=86400'
      : 'public, max-age=600';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(buf);
  });
}

/* ------------------------------------------------------------------ */
/* HTTP 服务                                                           */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p.startsWith('/tiles/')) return await serveTile(req, res, p);
    if (p === '/proxy/warning-icon') return await serveWarningIcon(req, res, url.searchParams);
    if (p === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache', Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      sseWrite(res, 'typhoons', { ...currentBundle, source: nmc.UPSTREAM });
      if (currentWarnings.fetchedAt) sseWrite(res, 'warnings', currentWarnings);
      const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch { } }, 25e3);
      req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
      return;
    }
    if (p.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(res, p);
  } catch (e) {
    console.error('[http]', e);
    try { json(res, 500, { error: String(e.message || e) }); } catch { }
  }
});

fs.mkdirSync(TILE_CACHE_DIR, { recursive: true });
server.listen(PORT, () => {
  console.log(`[${ts()}] 台风 WebGIS 服务已启动: http://localhost:${PORT}`);
  console.log(`数据源: ${nmc.UPSTREAM} (中央气象台) | 轮询间隔: ${POLL_INTERVAL / 1000}s`);
});
startPolling();
