import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
const root = new URL('../entry/src/main/ets/features/profile/', import.meta.url);
const data = await readFile(new URL('ProfileData.ets', root), 'utf8');
const logic = await readFile(new URL('ProfileLogic.ets', root), 'utf8');
const source = (data + logic.replace(/^import .*$/gm, '')).replace(/^export /gm, '');
const rules = runInNewContext(stripTypeScriptTypes(source) + '\n;ProfileLogic');
test('FAQ search trims whitespace and matches answer content as in Make', () => {
  assert.equal(rules.matches(0, '  蓝牙  '), true);
  assert.equal(rules.matches(0, '数据不上传'), false);
  assert.equal(rules.matches(4, '数据不上传'), true);
  assert.equal(rules.matches(0, '   '), true);
});
test('feedback preview requires five non-padding characters', () => {
  assert.equal(rules.canPreview('     '), false);
  assert.equal(rules.canPreview('  四个汉字  '), false);
  assert.equal(rules.canPreview('  节点数据异常  '), true);
});
