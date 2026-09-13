/**
 * 双语文案模块单元测试（node:test，零依赖）
 * 运行：npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, initLang, setLang, getLang } from '../web/js/i18n.js';
import { intensityOf, windLevelName, orgName, fmtBJT, windScale } from '../web/js/typhoon.js';

test('默认语言为中文，强度/风圈/机构名称正确', () => {
  initLang('zh');
  assert.equal(getLang(), 'zh');
  assert.equal(intensityOf('SuperTY').name, '超强台风');
  assert.equal(intensityOf('SuperTY').color, '#fe0000');
  assert.equal(windLevelName('30KTS'), '七级风圈');
  assert.equal(orgName('BABJ'), '中央气象台');
});

test('切换英文后名称随语言变化，颜色保持不变', () => {
  setLang('en');
  assert.equal(intensityOf('SuperTY').name, 'Super Typhoon');
  assert.equal(intensityOf('SuperTY').color, '#fe0000');
  assert.equal(windLevelName('30KTS'), '30-kt wind ring');
  assert.equal(orgName('BABJ'), 'CMA (NMC)');
  assert.equal(fmtBJT(Date.UTC(2026, 7, 30, 0, 0)), 'Aug 30, 08:00');
  assert.equal(windScale(41.5), '14–15');
  setLang('zh');
});

test('t() 支持 {param} 插值且未知键回退键名', () => {
  assert.equal(t('list.activeCount', { n: 3 }), '3 个活跃台风');
  assert.equal(t('no.such.key'), 'no.such.key');
});

test('未知强度码回落到热带气旋', () => {
  assert.equal(intensityOf('NOPE').name, '热带气旋');
});

test('中文时间格式为 MM月DD日 HH:mm', () => {
  assert.equal(fmtBJT(Date.UTC(2026, 7, 30, 0, 0)), '08月30日 08:00');
});
