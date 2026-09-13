/**
 * 台风领域工具：强度配色（取自中央气象台官网）、风圈几何、格式化
 * 名称类文案经由 i18n.js 解析（zh/en），颜色等数据保持不变
 */
import { t, getLang } from './i18n.js';

export const INTENSITY_ORDER = ['TD', 'TS', 'STS', 'TY', 'STY', 'SuperTY'];

export const INTENSITY = {
  TC: { color: '#00FF03' },
  TD: { color: '#eed139' },
  TS: { color: '#0000ff' },
  STS: { color: '#0f8000' },
  TY: { color: '#fe9c45' },
  STY: { color: '#fe00fe' },
  SuperTY: { color: '#fe0000' },
};

/** 风圈等级：代码 -> 颜色（官网配色），名称经 i18n 解析 */
export const WIND_LEVELS = {
  '30KTS': { color: '#F4D000', ck: 'ck-wind30' },
  '50KTS': { color: '#FD8B00', ck: 'ck-wind50' },
  '64KTS': { color: '#FD5C1C', ck: 'ck-wind64' },
};

export const ORG_CODES = ['BABJ', 'PGTW', 'RJTD', 'RKSL', 'VHHH', 'VNNN', 'VTBB', 'RUMS', 'DEMS', 'DKPY', 'MNUB'];

/** 强度码 -> { name(当前语言), color } */
export function intensityOf(code) {
  const cfg = INTENSITY[code] || INTENSITY.TC;
  const key = INTENSITY[code] ? code : 'TC';
  return { code: key, color: cfg.color, name: t('intensity.' + key) };
}

/** 风圈等级名称（当前语言） */
export function windLevelName(code) {
  return t('wind.' + code);
}

/** 预报机构名称（当前语言），未知代码原样返回 */
export function orgName(code) {
  return t('org.' + code) === 'org.' + code ? code : t('org.' + code);
}

export function stronger(a, b) {
  const ia = INTENSITY_ORDER.indexOf(a), ib = INTENSITY_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a;
  if (ia === -1) return b;
  if (ib === -1) return a;
  return ib > ia ? b : a;
}

/** 近中心最大风速 m/s -> 中国风力等级（蒲福扩展），标签随语言 */
export function windScale(ms) {
  if (ms == null) return '--';
  const thresholds = [51.0, 46.2, 41.5, 32.7, 28.5, 24.5, 20.8, 17.2, 13.9, 10.8];
  const labels = getLang() === 'en'
    ? ['16+', '17', '14–15', '12–13', '11', '10', '8–9', '8', '7', '6']
    : ['16级以上', '17级', '14-15级', '12-13级', '11级', '10级', '8-9级', '8级', '7级', '6级'];
  for (let i = 0; i < thresholds.length; i++) if (ms >= thresholds[i]) return labels[i];
  return getLang() === 'en' ? '<6' : '<6级';
}

const BJT_FMT = {
  zh: new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }),
  en: new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }),
};

/** 时间戳 -> 当前语言的时间文本（zh: "08月30日 08:00"，en: "Aug 30, 08:00"） */
export function fmtBJT(ms, withDate = true) {
  if (!ms) return '--';
  const parts = (BJT_FMT[getLang()] || BJT_FMT.zh).formatToParts(new Date(ms));
  const get = (t2) => parts.find(p => p.type === t2)?.value || '';
  const hh = get('hour'), mi = get('minute');
  if (!withDate) return `${hh}:${mi}`;
  return getLang() === 'en'
    ? `${get('month')} ${get('day')}, ${hh}:${mi}`
    : `${get('month')}月${get('day')}日 ${hh}:${mi}`;
}

export function fmtCoord(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S', ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns}, ${Math.abs(lon).toFixed(1)}°${ew}`;
}

const DIR_ANGLE = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };

export function dirAngle(dir) {
  return DIR_ANGLE[dir] ?? null;
}

/**
 * 风圈闭合曲线：四象限半径(km) -> [lat,lng] 数组
 * 象限定义与官网一致：NE/SE/SW/NW；在方位基点附近做线性过渡，避免硬接缝
 */
export function windCircleLatLngs(lat, lon, r) {
  const kmLat = 110.574;
  const kmLon = Math.max(1, 111.32 * Math.cos(lat * Math.PI / 180));
  const pts = [];
  const quad = (b) => (b < 90 ? r.ne : b < 180 ? r.se : b < 270 ? r.sw : r.nw) || 0;
  for (let b = 0; b <= 360; b += 3) {
    let rad = quad(b);
    // 方位基点 45°+90k 附近 ±5° 内与相邻象限线性混合
    const k = Math.round((b - 45) / 90);
    const base = 45 + 90 * k;
    const d = Math.abs(b - base);
    if (d < 5) {
      const other = quad((base + 90) % 360);
      rad = rad * (1 - (5 - d) / 10) + other * ((5 - d) / 10);
    }
    if (rad <= 0) continue;
    const a = b * Math.PI / 180;
    pts.push([lat + (rad * Math.cos(a)) / kmLat, lon + (rad * Math.sin(a)) / kmLon]);
  }
  return pts.length >= 3 ? pts : null;
}

/** 大圆距离 km */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** 中国主要沿海城市（用于台风中心距离提示） */
export const CITIES = [
  ['大连', 38.92, 121.63], ['青岛', 36.07, 120.38], ['上海', 31.23, 121.47],
  ['舟山', 30.0, 122.1], ['宁波', 29.87, 121.55], ['台州', 28.66, 121.42],
  ['温州', 28.0, 120.67], ['宁德', 26.66, 119.53], ['福州', 26.08, 119.28],
  ['厦门', 24.48, 118.09], ['台北', 25.03, 121.52], ['基隆', 25.13, 121.74],
  ['花莲', 23.98, 121.6], ['高雄', 22.62, 120.31], ['汕头', 23.35, 116.68],
  ['深圳', 22.53, 114.0], ['香港', 22.32, 114.17], ['澳门', 22.19, 113.54],
  ['珠海', 22.27, 113.58], ['广州', 23.17, 113.33], ['阳江', 21.86, 111.98],
  ['湛江', 21.27, 110.36], ['海口', 20.04, 110.32], ['三亚', 18.25, 109.5],
  ['北海', 21.48, 109.12],
];

/** 中央气象台常用台风警戒线（近似） */
export const WARNING_LINES = {
  24: {
    coords: [[4, 113], [10, 113], [12, 113], [15, 113], [17, 113], [19, 113], [22, 119], [26, 125], [30, 132], [34, 137], [38, 142], [42, 147]].map(([la, lo]) => [la, lo]),
    color: '#ff4d4f', dash: '10,6',
  },
  48: {
    coords: [[4, 105], [10, 105], [12, 105], [15, 105], [17, 105], [19, 105], [22, 120], [26, 127], [30, 136], [34, 142], [38, 148], [42, 152]].map(([la, lo]) => [la, lo]),
    color: '#f6c02f', dash: '4,8',
  },
};

/** 台风旋转风眼 divIcon */
export function typhoonIcon(code, windMs, active) {
  const color = intensityOf(code).color;
  const size = Math.min(30, 14 + (windMs || 0) / 3.2);
  const spin = (windMs || 0) >= 32.7;
  return L.divIcon({
    className: 'ty-marker' + (spin ? ' fast' : ''),
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<svg class="spin-svg" width="${size}" height="${size}" viewBox="0 0 40 40" style="${active ? '' : 'opacity:.85'}">
      <g fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round">
        <path d="M20 5.5 A14.5 14.5 0 0 1 34.5 20"/>
        <path d="M20 34.5 A14.5 14.5 0 0 1 5.5 20"/>
      </g>
      <circle cx="20" cy="20" r="4.6" fill="${color}" stroke="#fff" stroke-width="1.2"/>
    </svg>`,
  });
}

export function warnLevelColor(level) {
  return { 蓝色: '#2f7df6', 黄色: '#f6c02f', 橙色: '#f68b2f', 红色: '#e03e3e' }[level] || '#8aa0bf';
}
