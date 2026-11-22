import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

// Execute the actual pure-data ArkTS modules without a HarmonyOS device.
const root = new URL('../entry/src/main/ets/', import.meta.url);
const models = await readFile(new URL('models/Inspection.ets', root), 'utf8');
const data = await readFile(new URL('services/DemoRepository.ets', root), 'utf8');
const code = stripTypeScriptTypes((models + '\n' + data).replace(/^import .*;$/gm, '').replace(/^export /gm, ''));
const { zones, label } = runInNewContext(code + '\n;({zones: ZONES, label: riskLabel})');

test('each zone owns distinct nodes and valid connection counts', () => {
  const ids = new Set();
  assert.equal(zones.length, 3);
  for (const zone of zones) {
    assert.ok(zone.connected <= zone.count);
    assert.ok(zone.nodes.length > 0);
    for (const node of zone.nodes) {
      assert.equal(node.zone, zone.id);
      assert.ok(node.id.startsWith(zone.id[0] + '-'));
      assert.ok(!ids.has(node.id));
      ids.add(node.id);
      assert.ok(node.score >= 0 && node.score <= 100);
      for (const key of ['methane', 'temp', 'humidity', 'infrared']) assert.ok(Number.isFinite(Number(node[key])));
    }
  }
  assert.equal(ids.size, 9);
});

test('risk labels cover all demo sensor states', () => {
  const states = new Set();
  for (const zone of zones) {
    for (const node of zone.nodes) {
      states.add(node.state);
      assert.ok(['高风险', '需关注', '正常'].includes(label(node)));
      if (node.state === 'normal') assert.equal(label(node), '正常');
      if (node.state === 'alarm') assert.equal(label(node), '高风险');
    }
  }
  assert.equal(states.size, 3);
});
