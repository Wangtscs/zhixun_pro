import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const root = new URL('../entry/src/main/ets/', import.meta.url);

test('live inspection groups authorized nodes and keeps missing readings distinct from zero', async () => {
  const files = await Promise.all(['models/Inspection.ets', 'services/LiveInspection.ets']
    .map(path => readFile(new URL(path, root), 'utf8')));
  const source = files.join('\n').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const zonesFromRows = runInNewContext(stripTypeScriptTypes(source) + '\n;zonesFromRows');
  const zones = zonesFromRows([
    { id: 10, area_id: 2, area_name: 'A区', code: 'TN-A01', location: '北入口',
      active_alarms: 1, latest: [{ metric: 'methane', metric_value: 0 }] },
    { id: 11, area_id: 2, area_name: 'A区', code: 'TN-A02', location: '通道', latest: [] },
    { id: 12, area_id: 3, area_name: 'B区', code: 'TN-B01', location: '中段', latest: [] }
  ]);
  assert.equal(zones.length, 2);
  assert.equal(zones[0].count, 2);
  assert.equal(zones[0].nodes[0].id, 'TN-A01');
  assert.equal(zones[0].nodes[0].methane, '0');
  assert.equal(zones[0].nodes[0].state, 'alarm');
  assert.equal(zones[0].nodes[1].methane, '—');
  assert.equal(zones[0].nodes[1].state, 'unknown');
});
