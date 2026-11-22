import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
const root = new URL('../entry/src/main/ets/', import.meta.url);
const source = await readFile(new URL('services/TaskRepository.ets', root), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^export /gm, ''));
const repo = runInNewContext(code + '\n;TaskRepository');
test('task snapshots retain evidence and progress across reopening without mixing nodes', () => {
  repo.save('A-05', [0, 1, 2], ['photo://one'], '现场已复核', false);
  const reopened = repo.get('A-05');
  assert.equal(reopened.completed.length, 3);
  assert.equal(reopened.photos[0], 'photo://one');
  assert.equal(reopened.note, '现场已复核');
  assert.equal(repo.get('B-03').photos.length, 0);
  reopened.photos.push('photo://external-change');
  assert.equal(repo.get('A-05').photos.length, 1);
});
test('reporting retains the snapshot and resetting one task leaves other tasks intact', () => {
  repo.save('C-01', [0, 1, 2, 3, 4], ['photo://two'], '已处置', true);
  assert.equal(repo.get('C-01').reported, true);
  assert.equal(repo.get('C-01').completed.length, 5);
  repo.reset('A-05');
  assert.equal(repo.get('A-05').completed.length, 2);
  assert.equal(repo.get('A-05').photos.length, 0);
  assert.equal(repo.get('C-01').reported, true);
});
