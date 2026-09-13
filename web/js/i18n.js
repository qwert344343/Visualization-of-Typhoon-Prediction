/**
 * 双语字典与文案工具（zh / en）
 * - 纯 ESM 模块，无浏览器依赖，可在 node:test 中直接导入
 * - 静态文案：<element data-i18n="key"> + applyI18n()
 * - 动态文案：t('key', { params })
 */

const zh = {
  'app.title': '台风实时监测预报',
  'app.docTitle': '台风实时监测预报 WebGIS · 中央气象台数据',
  'status.connected': '实时连接',
  'status.reconnecting': '重连中…',
  'status.offline': '连接断开',
  'top.source': '数据源：',
  'top.sourceName': '中央气象台台风网',
  'top.updatedAt': '更新于',
  'btn.refresh': '刷新',
  'btn.refreshTitle': '立即向上游拉取最新数据',
  'btn.settingsTitle': '设置（语言 / 布局 / 主题 / 数据线路）',

  'list.activeCount': '{n} 个活跃台风',
  'list.historyCount': '{year} 年台风（{n} 个）',
  'list.live': '实况中',
  'list.stopped': '停编',
  'list.loading': '加载中…',
  'list.empty': '当前无活跃台风',
  'list.yearEmpty': '该年份无记录',
  'list.clickToLoad': '点击加载详情',
  'list.noTrack': '暂无路径数据',

  'history.title': '历史台风查询',
  'history.query': '查询',
  'history.backLive': '返回实时',

  'layers.title': '图层与显示',
  'layers.basemap': '底图',
  'basemap.tdtvec': '天地图 · 矢量（中文）',
  'basemap.tdtimg': '天地图 · 卫星影像',
  'basemap.tdtter': '天地图 · 地形晕渲',
  'basemap.esriocean': 'Esri · 海洋',
  'basemap.esriimg': 'Esri · 卫星影像',
  'basemap.osm': 'OpenStreetMap',
  'layer.wind30': '七级风圈',
  'layer.wind50': '十级风圈',
  'layer.wind64': '十二级风圈',
  'layer.forecast': '预报路径',
  'layer.warnline': '台风警戒线',
  'layer.warnings': '气象预警',
  'layer.labels': '轨迹时间标注',
  'layers.orgs': '预报机构',
  'legend.title': '强度图例',

  'footer.source': '数据来源：中央气象台（nmc.cn）· 底图：天地图（NMC 代理）/ Esri / OSM',
  'footer.disclaimer': '仅供学术交流 · 非商用，预警以官方发布为准',

  'map.loading': '加载数据…',
  'map.empty.title': '当前没有活跃台风',
  'map.empty.sub': '西太平洋/南海暂无台风活动，可查看历史台风路径',
  'map.empty.history': '查询历史台风',
  'map.empty.refresh': '刷新试试',
  'warnline.tip': '{h}小时警戒线（近似）',
  'banner.history': '历史模式 · {year} 年台风（{n} 个，点击列表加载路径）',

  'detail.placeholder': '点击地图上的台风或左侧列表查看详情',
  'detail.live': '实时实况',
  'detail.replayHint': '▶ 回放模式：显示所选时点实况及当时发布的预报',
  'detail.generatedAt': '生成于 {t} · 共 {n} 个定位点',
  'detail.intensity': '强度',
  'detail.timeBJT': '北京时间',
  'detail.position': '中心位置',
  'detail.pressure': '中心气压',
  'detail.maxWind': '最大风速',
  'detail.move': '移向 / 移速',
  'detail.radiusTable': '风圈半径（公里）',
  'quad.ne': '东北', 'quad.se': '东南', 'quad.sw': '西南', 'quad.nw': '西北',
  'detail.cities': '距沿海主要城市',
  'detail.forecastBy': '{org} 预报',
  'detail.noForecast': '当前时点暂无预报数据',
  'table.h': '时效',
  'table.time': '北京时间',
  'table.pos': '位置(纬,经)',
  'table.pressure': '气压',
  'table.wind': '风速',
  'table.strength': '强度',
  'table.level': '等级',
  'detail.source': '数据来源：中央气象台台风网',
  'detail.meaning': '名称意义：{m}',
  'move.stationary': '少动',

  'play.liveSuffix': '（实时）',
  'play.backLive': '回到实时',

  'toast.updated': '台风数据已更新 {t}',
  'toast.countChanged': '活跃台风数量变化：当前 {n} 个',
  'toast.refreshed': '已刷新（{t}）',
  'toast.refreshFailed': '刷新失败：{m}',
  'toast.detailFailed': '台风详情加载失败：{m}',
  'toast.historyFailed': '历史数据加载失败：{m}',
  'toast.initFailed': '初始数据加载失败：{m}',

  'settings.title': '设置',
  'settings.language': '界面语言',
  'settings.layout': '布局模式',
  'layout.auto': '自动',
  'layout.desktop': '桌面',
  'layout.mobile': '移动',
  'settings.layoutDesc': '移动布局将侧栏与详情面板变为抽屉；桌面布局始终平铺展示。',
  'settings.theme': '主题外观',
  'theme.dark': '深色',
  'theme.light': '浅色',
  'settings.route': '数据线路',
  'route.auto': '自动',
  'route.cn': '中国',
  'route.global': '海外',
  'settings.routeDesc': '台风数据均来自中央气象台免费公开接口。中国线路默认天地图底图（NMC 代理），海外线路默认 Esri 海洋底图，保证全球加载速度。',
  'settings.about': '关于',
  'settings.author': '作者',
  'settings.sources': '数据源（免费公开）',
  'settings.sourcesValue': '中央气象台台风网 · 天地图/Esri/OSM 底图',
  'settings.disclaimer': '本系统仅供学术交流使用，非商用。实时预警请以中央气象台官方发布为准。',
  'settings.disclaimerEn': 'For academic exchange only, non-commercial. Always follow official warnings from NMC.',

  'intensity.TC': '热带气旋', 'intensity.TD': '热带低压', 'intensity.TS': '热带风暴',
  'intensity.STS': '强热带风暴', 'intensity.TY': '台风', 'intensity.STY': '强台风',
  'intensity.SuperTY': '超强台风',
  'wind.30KTS': '七级风圈', 'wind.50KTS': '十级风圈', 'wind.64KTS': '十二级风圈',
  'org.BABJ': '中央气象台', 'org.PGTW': '美国JTWC', 'org.RJTD': '日本气象厅',
  'org.RKSL': '韩国气象厅', 'org.VHHH': '香港天文台', 'org.VNNN': '越南',
  'org.VTBB': '泰国', 'org.RUMS': '俄罗斯', 'org.DEMS': '印度',
  'org.DKPY': '朝鲜', 'org.MNUB': '蒙古',
};

const en = {
  'app.title': 'Typhoon Real-time Monitoring',
  'app.docTitle': 'Typhoon Monitoring WebGIS · NMC Data',
  'status.connected': 'Live',
  'status.reconnecting': 'Reconnecting…',
  'status.offline': 'Disconnected',
  'top.source': 'Source: ',
  'top.sourceName': 'NMC Typhoon Center',
  'top.updatedAt': 'Updated ',
  'btn.refresh': 'Refresh',
  'btn.refreshTitle': 'Fetch latest data from upstream now',
  'btn.settingsTitle': 'Settings (language / layout / theme / data route)',

  'list.activeCount': '{n} active typhoon(s)',
  'list.historyCount': '{year} season ({n} typhoons)',
  'list.live': 'Active',
  'list.stopped': 'Ended',
  'list.loading': 'Loading…',
  'list.empty': 'No active typhoons',
  'list.yearEmpty': 'No records for this year',
  'list.clickToLoad': 'Click to load details',
  'list.noTrack': 'No track data',

  'history.title': 'Historical Typhoons',
  'history.query': 'Query',
  'history.backLive': 'Live',

  'layers.title': 'Layers & Display',
  'layers.basemap': 'Basemap',
  'basemap.tdtvec': 'Tianditu · Vector',
  'basemap.tdtimg': 'Tianditu · Satellite',
  'basemap.tdtter': 'Tianditu · Terrain',
  'basemap.esriocean': 'Esri · Ocean',
  'basemap.esriimg': 'Esri · Imagery',
  'basemap.osm': 'OpenStreetMap',
  'layer.wind30': '30-kt wind ring',
  'layer.wind50': '50-kt wind ring',
  'layer.wind64': '64-kt wind ring',
  'layer.forecast': 'Forecast tracks',
  'layer.warnline': 'Warning lines',
  'layer.warnings': 'Weather alerts',
  'layer.labels': 'Track time labels',
  'layers.orgs': 'Forecast agencies',
  'legend.title': 'Intensity Legend',

  'footer.source': 'Data: China Meteorological Administration (nmc.cn) · Basemap: Tianditu (NMC proxy) / Esri / OSM',
  'footer.disclaimer': 'Academic use only · Not commercial. Follow official warnings.',

  'map.loading': 'Loading data…',
  'map.empty.title': 'No active typhoons right now',
  'map.empty.sub': 'Nothing active in the Western North Pacific — browse historical tracks instead',
  'map.empty.history': 'Browse history',
  'map.empty.refresh': 'Refresh',
  'warnline.tip': '{h}-h warning line (approx.)',
  'banner.history': 'History mode · {year} season ({n} typhoons — click a card to load its track)',

  'detail.placeholder': 'Click a typhoon on the map or in the list to see details',
  'detail.live': 'Live status',
  'detail.replayHint': '▶ Replay: conditions and the forecast issued at that time',
  'detail.generatedAt': 'Issued {t} · {n} fixes in total',
  'detail.intensity': 'Intensity',
  'detail.timeBJT': 'Time (BJT)',
  'detail.position': 'Center',
  'detail.pressure': 'Pressure',
  'detail.maxWind': 'Max wind',
  'detail.move': 'Movement',
  'detail.radiusTable': 'Wind ring radius (km)',
  'quad.ne': 'NE', 'quad.se': 'SE', 'quad.sw': 'SW', 'quad.nw': 'NW',
  'detail.cities': 'Distance to coastal cities',
  'detail.forecastBy': '{org} forecast',
  'detail.noForecast': 'No forecast data at this point',
  'table.h': 'Lead',
  'table.time': 'Time (BJT)',
  'table.pos': 'Lat,Lon',
  'table.pressure': 'Pres.',
  'table.wind': 'Wind',
  'table.strength': 'Cat.',
  'table.level': 'Ring',
  'detail.source': 'Data: NMC Typhoon Network',
  'detail.meaning': 'Name meaning: {m}',
  'move.stationary': 'Nearly stationary',

  'play.liveSuffix': ' (Live)',
  'play.backLive': 'Live',

  'toast.updated': 'Typhoon data updated {t}',
  'toast.countChanged': 'Active typhoon count changed: {n} now',
  'toast.refreshed': 'Refreshed ({t})',
  'toast.refreshFailed': 'Refresh failed: {m}',
  'toast.detailFailed': 'Failed to load typhoon details: {m}',
  'toast.historyFailed': 'Failed to load historical data: {m}',
  'toast.initFailed': 'Failed to load initial data: {m}',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.layout': 'Layout',
  'layout.auto': 'Auto',
  'layout.desktop': 'Desktop',
  'layout.mobile': 'Mobile',
  'settings.layoutDesc': 'Mobile layout turns side panels into drawers; desktop layout always shows full panels.',
  'settings.theme': 'Theme',
  'theme.dark': 'Dark',
  'theme.light': 'Light',
  'settings.route': 'Data route',
  'route.auto': 'Auto',
  'route.cn': 'China',
  'route.global': 'Global',
  'settings.routeDesc': 'Typhoon data always comes from the free public NMC API. The China route defaults to the Tianditu basemap (NMC proxy); the global route defaults to Esri Ocean for fast loading worldwide.',
  'settings.about': 'About',
  'settings.author': 'Author',
  'settings.sources': 'Data sources (free & public)',
  'settings.sourcesValue': 'NMC Typhoon Network · Tianditu / Esri / OSM basemaps',
  'settings.disclaimer': '本系统仅供学术交流使用，非商用。实时预警请以中央气象台官方发布为准。',
  'settings.disclaimerEn': 'For academic exchange only, non-commercial. Always follow official warnings from NMC.',

  'intensity.TC': 'Tropical Cyclone', 'intensity.TD': 'Tropical Depression', 'intensity.TS': 'Tropical Storm',
  'intensity.STS': 'Severe Tropical Storm', 'intensity.TY': 'Typhoon', 'intensity.STY': 'Severe Typhoon',
  'intensity.SuperTY': 'Super Typhoon',
  'wind.30KTS': '30-kt wind ring', 'wind.50KTS': '50-kt wind ring', 'wind.64KTS': '64-kt wind ring',
  'org.BABJ': 'CMA (NMC)', 'org.PGTW': 'JTWC (US)', 'org.RJTD': 'JMA (Japan)',
  'org.RKSL': 'KMA (Korea)', 'org.VHHH': 'HKO (Hong Kong)', 'org.VNNN': 'Vietnam',
  'org.VTBB': 'Thailand', 'org.RUMS': 'Russia', 'org.DEMS': 'India',
  'org.DKPY': 'DPRK', 'org.MNUB': 'Mongolia',
};

const dicts = { zh, en };
let lang = 'zh';

export function getLang() { return lang; }

/** 初始化语言（仅在启动时调用一次）；不合法值回退 zh */
export function initLang(l) { if (dicts[l]) lang = l; return lang; }

export function setLang(l) { if (dicts[l]) lang = l; return lang; }

/** 取文案：缺失键回退中文，再回退键名；支持 {param} 插值 */
export function t(key, params) {
  const d = dicts[lang] || zh;
  let s = d[key] ?? zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split('{' + k + '}').join(String(v));
    }
  }
  return s;
}

/** 将字典应用到 DOM：data-i18n（文本）/ data-i18n-title（提示） */
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
  }
  for (const el of root.querySelectorAll('[data-i18n-value]')) {
    el.value = t(el.dataset.i18nValue);
  }
}
