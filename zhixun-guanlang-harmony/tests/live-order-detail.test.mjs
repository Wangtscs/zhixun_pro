import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

test('available order actions reflect the current server status', async () => {
  const path = '../entry/src/main/ets/features/orders/OrderDetailState.ets';
  const source = await readFile(new URL(path, import.meta.url), 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return '';
  });
  const actionFor = runInNewContext(stripTypeScriptTypes(source.replace(/^export /gm, '')) + '\norderAction');
  const cases = [
    ['DRAFT', ''], ['ASSIGNED', 'accept'], ['ACCEPTED', 'start'],
    ['PROCESSING', 'submit'], ['REVIEW', ''], ['COMPLETED', ''],
    ['CANCELLED', ''], ['UNRECOGNIZED', '']
  ];
  for (const [status, action] of cases) {
    assert.equal(actionFor(status), action, status);
  }
});

test('field checks can be toggled out of order and round-trip with existing readings', async () => {
  const source = await readFile(new URL('../entry/src/main/ets/features/orders/OrderDetailState.ets', import.meta.url), 'utf8');
  const { toggle, read, write } = runInNewContext(stripTypeScriptTypes(source.replace(/^export /gm, '')) +
    '\n;({ toggle: typeof toggleOrderCheck === "function" ? toggleOrderCheck : undefined, ' +
    'read: typeof readOrderChecks === "function" ? readOrderChecks : undefined, ' +
    'write: typeof writeOrderChecks === "function" ? writeOrderChecks : undefined })');
  assert.equal(typeof toggle, 'function');
  const before = [0];
  const selected = toggle(toggle(before, 4), 0);
  assert.deepEqual(Array.from(selected), [4]);
  assert.deepEqual(before, [0]);
  assert.deepEqual(Array.from(read('甲烷读数 0.3')), []);
  const value = write('甲烷读数 0.3', selected);
  assert.ok(value.startsWith('甲烷读数 0.3'));
  assert.deepEqual(Array.from(read(value)), [4]);
  assert.deepEqual(Array.from(read(write(value, [2]))), [2]);
});
