/**
 * 地图渲染：底图切换、台风轨迹/风圈/预报/警戒线/预警图层、回放渲染
 */
import {
  INTENSITY, WIND_LEVELS, intensityOf, stronger, windScale, fmtBJT,
  fmtCoord, dirAngle, windCircleLatLngs, WARNING_LINES, typhoonIcon, warnLevelColor, orgName,
} from './typhoon.js';
import { t } from './i18n.js';

let map;
let layers = {};          // track / wind / forecast / warnline / warning / label
let basemaps = {};
let currentBasemap = 'tdtvec';
let markerRefs = [];      // 可点击的台风当前位置标记
let state = null;         // 引用 app 状态
let onChange = {};        // 回调：{ onSelect }

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- 底图 ---------------- */

function buildBasemaps() {
  const base = location.origin;
  basemaps = {
    tdtvec: {
      name: '天地图 · 矢量',
      layers: () => [
        L.tileLayer(`${base}/tiles/tianditu/vec_w/{z}/{x}/{y}.png`, { maxZoom: 12, attribution: '底图 © 天地图（NMC 代理）' }),
        L.tileLayer(`${base}/tiles/tianditu/cva_w/{z}/{x}/{y}.png`, { maxZoom: 12, pane: 'overlayPane' }),
      ],
    },
    tdtimg: {
      name: '天地图 · 卫星影像',
      layers: () => [
        L.tileLayer(`${base}/tiles/tianditu/img_w/{z}/{x}/{y}.png`, { maxZoom: 12, attribution: '底图 © 天地图（NMC 代理）' }),
        L.tileLayer(`${base}/tiles/tianditu/cia_w/{z}/{x}/{y}.png`, { maxZoom: 12 }),
      ],
    },
    tdtter: {
      name: '天地图 · 地形晕渲',
      layers: () => [
        L.tileLayer(`${base}/tiles/tianditu/ter_w/{z}/{x}/{y}.png`, { maxZoom: 12 }),
        L.tileLayer(`${base}/tiles/tianditu/cva_w/{z}/{x}/{y}.png`, { maxZoom: 12 }),
      ],
    },
    esriocean: {
      name: 'Esri · 海洋',
      layers: () => [
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, attribution: 'Esri Ocean' }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12 }),
      ],
    },
    esriimg: {
      name: 'Esri · 卫星影像',
      layers: () => [
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, attribution: 'Esri Imagery' }),
      ],
    },
    osm: {
      name: 'OpenStreetMap',
      layers: () => [
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: '© OpenStreetMap' }),
      ],
    },
  };
}

function setBasemap(key) {
  if (!basemaps[key]) key = 'esriocean';
  currentBasemap = key;
  map.eachLayer(l => { if (l._isBasemap) map.removeLayer(l); });
  for (const l of basemaps[key].layers()) { l._isBasemap = true; l.addTo(map); l.bringToBack(); }
}

/* ---------------- 初始化 ---------------- */

export function initMap(appState, callbacks) {
  state = appState;
  onChange = callbacks || {};
  map = L.map('map', {
    center: [26, 138], zoom: 4, minZoom: 2, maxZoom: 12,
    zoomControl: true, attributionControl: true,
    worldCopyJump: true,
  });
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  buildBasemaps();

  layers.track = L.layerGroup().addTo(map);
  layers.wind = L.layerGroup().addTo(map);
  layers.forecast = L.layerGroup().addTo(map);
  layers.warnline = L.layerGroup().addTo(map);
  layers.warning = L.layerGroup().addTo(map);

  map.on('mousemove', e => {
    document.getElementById('coord-box').textContent =
      `${e.latlng.lat.toFixed(2)}°N, ${e.latlng.lng.toFixed(2)}°E`;
  });

  setBasemap(state.basemap);
  return map;
}

export function applyBasemap(key) { setBasemap(key); }

/* ---------------- 警戒线 / 预警 ---------------- */

export function renderWarningLines(show) {
  layers.warnline.clearLayers();
  if (!show) return;
  for (const [tag, cfg] of Object.entries(WARNING_LINES)) {
    const line = L.polyline(cfg.coords, {
      color: cfg.color, weight: 1.6, dashArray: cfg.dash, opacity: .9,
    }).bindTooltip(t('warnline.tip', { h: tag }), { permanent: false, direction: 'top' });
    layers.warnline.addLayer(line);
  }
}

export function renderWarnings(warnings, show) {
  layers.warning.clearLayers();
  if (!show) return;
  for (const w of warnings.items || []) {
    const color = warnLevelColor(w.level);
    const m = L.marker([w.lat, w.lon], {
      icon: L.divIcon({
        className: 'warn-marker',
        iconSize: [14, 14], iconAnchor: [7, 7],
        html: `<div class="w-dot" style="background:${color}"></div>`,
      }),
    });
    m.bindPopup(`<b>${escapeHtml(w.title)}</b><br/>${escapeHtml(w.time)}<br/><span style="color:#9db7d9">${escapeHtml((w.text || '').slice(0, 80))}…</span>`);
    layers.warning.addLayer(m);
  }
}

/* ---------------- 台风渲染 ---------------- */

/** 绘制单个台风（选中=全量：轨迹+风圈+预报+箭头；未选中=简化） */
function drawTyphoon(ty, opts) {
  const { selected, index, showWind, showForecast, showLabels, orgFilter } = opts;
  if (!ty.points.length) return;

  const visible = selected && index != null ? ty.points.slice(0, index + 1) : ty.points;
  const cur = visible[visible.length - 1];

  // 1) 轨迹分段着色
  for (let i = 1; i < visible.length; i++) {
    const a = visible[i - 1], b = visible[i];
    const code = stronger(a.code, b.code);
    layers.track.addLayer(L.polyline([[a.lat, a.lon], [b.lat, b.lon]], {
      color: intensityOf(code).color, weight: selected ? 3 : 2,
      opacity: selected ? .95 : .6,
    }));
  }
  // 2) 轨迹点
  let lastLabelTime = -Infinity;
  visible.forEach((p, i) => {
    const isLast = i === visible.length - 1;
    if (isLast) return; // 最新点用旋转标记
    layers.track.addLayer(L.circleMarker([p.lat, p.lon], {
      radius: selected ? 3.4 : 2.4, color: '#fff', weight: .8,
      fillColor: intensityOf(p.code).color, fillOpacity: 1,
    }).bindTooltip(
      `${fmtBJT(p.time)}<br/>${t('detail.position')} ${fmtCoord(p.lat, p.lon)}<br/>${t('table.pressure')} ${p.pressure ?? '--'}hPa · ${t('table.wind')} ${p.wind ?? '--'}m/s（${intensityOf(p.code).name}）`,
      { direction: 'top' }));
    if (selected && showLabels && p.time - lastLabelTime >= 6 * 3600e3) {
      lastLabelTime = p.time;
      layers.track.addLayer(L.marker([p.lat, p.lon], {
        interactive: false,
        icon: L.divIcon({ className: 'track-label', iconSize: [0, 0], html: `<span style="position:absolute;left:6px;top:-14px">${fmtBJT(p.time, false)}</span>` }),
      }));
    }
  });

  // 3) 当前位置标记（旋转风眼）
  const marker = L.marker([cur.lat, cur.lon], {
    icon: typhoonIcon(cur.code, cur.wind, ty.active), zIndexOffset: 500,
  });
  marker.bindTooltip(
    `<b>${ty.cnId} ${escapeHtml(ty.nameCn)}</b> ${escapeHtml(ty.nameEn)}<br/>${intensityOf(cur.code).name} · ${cur.wind}m/s · ${cur.pressure}hPa<br/>${fmtBJT(cur.time)}`,
    { direction: 'top', offset: [0, -8] });
  marker.on('click', () => onChange.onSelect && onChange.onSelect(ty.id, { fly: false }));
  marker.addTo(layers.track);
  markerRefs.push(marker);

  // 4) 移动方向箭头
  const ang = dirAngle(cur.moveDir);
  if (selected && ang != null && cur.moveSpeed > 0) {
    const dLat = 1.1 * Math.cos(ang * Math.PI / 180);
    const dLon = 1.1 * Math.sin(ang * Math.PI / 180) / Math.max(.2, Math.cos(cur.lat * Math.PI / 180));
    layers.track.addLayer(L.polyline([[cur.lat, cur.lon], [cur.lat + dLat, cur.lon + dLon]], {
      color: '#ffffff', weight: 2, opacity: .85, dashArray: '2,5',
    }));
  }

  // 5) 风圈（仅选中台风）
  if (selected) {
    for (const [code, cfg] of Object.entries(WIND_LEVELS)) {
      if (!showWind[code]) continue;
      const r = cur.windRadius[code];
      if (!r) continue;
      const latlngs = windCircleLatLngs(cur.lat, cur.lon, r);
      if (!latlngs) continue;
      layers.wind.addLayer(L.polygon(latlngs, {
        color: cfg.color, weight: 1.2, dashArray: '6,5',
        fillColor: cfg.color, fillOpacity: .16, interactive: false,
      }));
    }
  }

  // 6) 预报路径（选中台风，且非回放模式 或 回放点自带预报）
  if (selected && showForecast) {
    const fc = cur.forecast || {};
    for (const [org, pts] of Object.entries(fc)) {
      if (orgFilter && orgFilter[org] === false) continue;
      if (!pts.length) continue;
      const seq = [[cur.lat, cur.lon], ...pts.map(p => [p.lat, p.lon])];
      layers.forecast.addLayer(L.polyline(seq, {
        color: '#7fd1ff', weight: 2, dashArray: '7,6', opacity: .9,
      }));
      pts.forEach(p => {
        const isDay = p.h % 24 === 0;
        layers.forecast.addLayer(L.circleMarker([p.lat, p.lon], {
          radius: isDay ? 4.4 : 3.2, color: intensityOf(p.code).color, weight: 1.8,
          fillColor: '#0b1424', fillOpacity: .85,
        }).bindTooltip(
          `<b>${orgName(org)} · ${p.h}h</b><br/>${fmtBJT(p.time)}<br/>${t('detail.position')} ${fmtCoord(p.lat, p.lon)}<br/>${t('table.pressure')} ${p.pressure ?? '--'}hPa · ${t('table.wind')} ${p.wind ?? '--'}m/s（${intensityOf(p.code).name}）`,
          { direction: 'top' }));
        if (isDay) {
          layers.forecast.addLayer(L.marker([p.lat, p.lon], {
            interactive: false,
            icon: L.divIcon({ className: 'track-label', iconSize: [0, 0], html: `<span style="position:absolute;left:6px;top:-15px;color:#7fd1ff">${p.h}h</span>` }),
          }));
        }
      });
    }
  }
}

/** 清空并重绘全部台风 */
export function renderTyphoons(typhoonList, opts) {
  for (const k of ['track', 'wind', 'forecast']) layers[k].clearLayers();
  markerRefs = [];
  for (const ty of typhoonList) {
    drawTyphoon(ty, {
      selected: ty.id === opts.selectedId,
      index: opts.playIndex,
      showWind: opts.showWind,
      showForecast: opts.showForecast,
      showLabels: opts.showLabels,
      orgFilter: opts.orgFilter,
    });
  }
}

export function flyToTyphoon(ty) {
  if (!ty.points.length) return;
  const p = ty.points[ty.points.length - 1];
  map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 5), { duration: .8 });
}

export function fitTyphoon(ty) {
  if (!ty.points.length) return;
  const b = L.latLngBounds(ty.points.map(p => [p.lat, p.lon]));
  map.fitBounds(b.pad(0.25), { maxZoom: 7 });
}
