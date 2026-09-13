/**
 * 前端领域工具单元测试（node:test，零依赖）
 * web/js/typhoon.js 为纯函数模块（不依赖 Leaflet 全局），可在 Node 中直接导入。
 * 运行：npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  windScale, windCircleLatLngs, haversine, fmtBJT, dirAngle, stronger, intensityOf,
} from '../web/js/typhoon.js';

/* ---------------- windScale：蒲福风力等级换算 ---------------- */

test('windScale 换算中国风力等级', () => {
  assert.equal(windScale(52.0), '16级以上');
  assert.equal(windScale(46.2), '17级');
  assert.equal(windScale(41.5), '14-15级');
  assert.equal(windScale(32.7), '12-13级');
  assert.equal(windScale(24.5), '10级');
  assert.equal(windScale(17.2), '8级');
  assert.equal(windScale(10.0), '<6级');
});

test('windScale 对空值返回 --', () => {
  assert.equal(windScale(null), '--');
  assert.equal(windScale(undefined), '--');
});

/* ---------------- haversine：大圆距离 ---------------- */

test('haversine 同一点距离为 0', () => {
  assert.equal(haversine(31.23, 121.47, 31.23, 121.47), 0);
});

test('haversine 上海—北京约 1068 km（误差 <40km）', () => {
  const d = haversine(31.23, 121.47, 39.90, 116.40);
  assert.ok(Math.abs(d - 1068) < 40, `实际 ${d.toFixed(1)} km`);
});

/* ---------------- fmtBJT：北京时间格式化 ---------------- */

test('fmtBJT 将 UTC 时间戳转换为北京时间为 MM月DD日 HH:mm', () => {
  assert.equal(fmtBJT(Date.UTC(2026, 7, 30, 0, 0)), '08月30日 08:00');
  assert.equal(fmtBJT(Date.UTC(2026, 0, 1, 16, 5)), '01月02日 00:05');
});

test('fmtBJT 对空值返回 --，可省略日期', () => {
  assert.equal(fmtBJT(null), '--');
  assert.equal(fmtBJT(Date.UTC(2026, 7, 30, 0, 0), false), '08:00');
});

/* ---------------- dirAngle / stronger / intensityOf ---------------- */

test('dirAngle 十六方位角转换与未知方位', () => {
  assert.equal(dirAngle('N'), 0);
  assert.equal(dirAngle('NE'), 45);
  assert.equal(dirAngle('NNW'), 337.5);
  assert.equal(dirAngle(''), null);
  assert.equal(dirAngle('XX'), null);
});

test('stronger 返回两者中更强的强度码', () => {
  assert.equal(stronger('TD', 'SuperTY'), 'SuperTY');
  assert.equal(stronger('TY', 'TD'), 'TY');
  assert.equal(stronger('STS', 'STS'), 'STS');
  assert.equal(stronger('TY', '未知'), 'TY');
});

test('intensityOf 返回名称与官方配色，未知码回落到 TC', () => {
  assert.equal(intensityOf('SuperTY').name, '超强台风');
  assert.equal(intensityOf('SuperTY').color, '#fe0000');
  assert.equal(intensityOf('NOPE').name, '热带气旋');
});

/* ---------------- windCircleLatLngs：四象限风圈几何 ---------------- */

test('windCircleLatLngs 生成闭合曲线且北象限半径等于东北象限值', () => {
  const lat = 18.5, lon = 130.2;
  const pts = windCircleLatLngs(lat, lon, { ne: 300, se: 250, sw: 200, nw: 220 });
  assert.ok(Array.isArray(pts) && pts.length >= 3, '至少生成 3 个点');
  // 正北方向（方位 0°）应落在东北象限半径 300km 处
  const maxDlat = Math.max(...pts.map(p => p[0])) - lat;
  const expected = 300 / 110.574;
  assert.ok(Math.abs(maxDlat - expected) < 0.05, `北向半径 ${maxDlat.toFixed(3)}°，期望约 ${expected.toFixed(3)}°`);
  // 所有点均位于四象限半径包络之内（留 1° 过渡余量）
  for (const [la, lo] of pts) {
    assert.ok(Math.abs(la - lat) <= expected + 0.2);
    assert.ok(Math.abs(lo - lon) <= 300 / (111.32 * Math.cos(lat * Math.PI / 180)) + 0.2);
  }
});

test('windCircleLatLngs 半径全为 0 时返回 null', () => {
  assert.equal(windCircleLatLngs(18.5, 130.2, { ne: 0, se: 0, sw: 0, nw: 0 }), null);
});
