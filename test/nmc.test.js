/**
 * 后端解析逻辑单元测试（node:test，零依赖）
 * 运行：npm test
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  unwrapJsonp, utcStrToEpoch, parsePoint, normalizeTyphoon, fingerprint,
} = require('../server/nmc.js');

/* ---------------- unwrapJsonp：JSONP 解包 ---------------- */

test('unwrapJsonp 解包 cb({...}) 与 cb(([...])) 两种包装', () => {
  assert.deepEqual(unwrapJsonp('cb({"a":1})'), { a: 1 });
  assert.deepEqual(unwrapJsonp('callback(([1,2,3]))'), [1, 2, 3]);
  assert.deepEqual(unwrapJsonp('({"a":[1,2]})'), { a: [1, 2] });
});

test('unwrapJsonp 对非 JSONP 文本抛出异常', () => {
  assert.throws(() => unwrapJsonp('<html>502 Bad Gateway</html>'), /JSONP/);
});

/* ---------------- utcStrToEpoch：UTC 时间串解析 ---------------- */

test('utcStrToEpoch 按 UTC 解析 yyyyMMddHHmm 时间串', () => {
  assert.equal(utcStrToEpoch('202608300830'), Date.UTC(2026, 7, 30, 8, 30));
  assert.equal(utcStrToEpoch('202601010000'), Date.UTC(2026, 0, 1, 0, 0));
});

test('utcStrToEpoch 对空值返回 null', () => {
  assert.equal(utcStrToEpoch(''), null);
  assert.equal(utcStrToEpoch(null), null);
  assert.equal(utcStrToEpoch('20260830'), null); // 位数不足
});

/* ---------------- parsePoint：定位点解析 ---------------- */

/** 按官网 view_{id} 点位数组顺序构造的样例 */
function rawPoint() {
  return [
    0,                 // [0] 官方字段占位
    '202608300000',    // [1] UTC 时间串
    Date.UTC(2026, 7, 30, 0, 0), // [2] epoch ms
    'TY',              // [3] 强度码
    130.2, 18.5,       // [4] 经度 [5] 纬度
    950, 42,           // [6] 气压 hPa [7] 风速 m/s
    'NW', 20,          // [8] 移向 [9] 移速 km/h
    [[ '30KTS', 300, 250, 200, 220, 1 ]], // [10] 风圈 [等级, 东北, 东南, 西南, 西北, id]
    { BABJ: [[24, '202608300000', 133.1, 19.9, 965, 35, 'BABJ', 'TY']] }, // [11] 预报
  ];
}

test('parsePoint 解析位置/强度/风圈/预报', () => {
  const p = parsePoint(rawPoint());
  assert.equal(p.lon, 130.2);
  assert.equal(p.lat, 18.5);
  assert.equal(p.code, 'TY');
  assert.equal(p.pressure, 950);
  assert.equal(p.wind, 42);
  assert.equal(p.moveDir, 'NW');
  assert.equal(p.moveSpeed, 20);
  assert.deepEqual(p.windRadius['30KTS'], { ne: 300, se: 250, sw: 200, nw: 220 });
  const babj = p.forecast.BABJ;
  assert.equal(babj.length, 1);
  assert.equal(babj[0].h, 24);
  // 预报时间 = 发布时间 + 预报时效
  assert.equal(babj[0].time, Date.UTC(2026, 7, 30, 0, 0) + 24 * 3600e3);
  assert.equal(babj[0].lat, 19.9);
});

test('parsePoint 移向归一化：0→少动，no/空→null', () => {
  const p0 = rawPoint(); p0[8] = '0';
  assert.equal(parsePoint(p0).moveDir, '少动');
  const pNo = rawPoint(); pNo[8] = 'no';
  assert.equal(parsePoint(pNo).moveDir, null);
  const pEmpty = rawPoint(); pEmpty[8] = '';
  assert.equal(parsePoint(pEmpty).moveDir, null);
});

test('parsePoint 对字段不足的点返回 null', () => {
  assert.equal(parsePoint(null), null);
  assert.equal(parsePoint([1, '202608300000']), null);
});

/* ---------------- normalizeTyphoon：台风对象归一化 ---------------- */

test('normalizeTyphoon 按时间排序定位点并推导活跃状态', () => {
  const later = rawPoint();
  later[1] = '202608301200';
  later[2] = Date.UTC(2026, 7, 30, 12, 0);
  const ty = normalizeTyphoon([
    'AL2026', 'SOMENAME', '某某', '202601', null, null, '含义', 'start',
    [later, rawPoint()], // 故意乱序传入
  ]);
  assert.equal(ty.id, 'AL2026');
  assert.equal(ty.nameCn, '某某');
  assert.equal(ty.active, true);
  assert.equal(ty.points.length, 2);
  assert.ok(ty.points[0].time <= ty.points[1].time, '定位点应按时间升序');
  assert.equal(ty.lastUpdate, Date.UTC(2026, 7, 30, 12, 0));
});

test('normalizeTyphoon 对非数组输入返回 null', () => {
  assert.equal(normalizeTyphoon(null), null);
  assert.equal(normalizeTyphoon('x'), null);
});

/* ---------------- fingerprint：数据指纹 ---------------- */

test('fingerprint 由 id/点数/最后时间/名称组成', () => {
  const ty = normalizeTyphoon(['AL2026', 'SOMENAME', '某某', '202601', null, null, '', 'start', [rawPoint()]]);
  const fp = fingerprint({ typhoons: [ty] });
  assert.ok(fp.includes('AL2026'), '指纹应包含台风 id');
  assert.ok(fp.includes(':1:'), '指纹应包含定位点数量');
  // 相同数据指纹一致；点位变化指纹变化
  assert.equal(fp, fingerprint({ typhoons: [normalizeTyphoon(['AL2026', 'SOMENAME', '某某', '202601', null, null, '', 'start', [rawPoint()]])] }));
  const ty2 = normalizeTyphoon(['AL2026', 'SOMENAME', '某某', '202601', null, null, '', 'start', [rawPoint(), rawPoint()]]);
  assert.notEqual(fp, fingerprint({ typhoons: [ty2] }));
});
