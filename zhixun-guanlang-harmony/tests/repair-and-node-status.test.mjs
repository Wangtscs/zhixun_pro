import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const root = new URL('../entry/src/main/ets/features/inspection/', import.meta.url);

test('node trends add each actual sensor reading once and keep unchanged values at new times', async () => {
  const source = await readFile(new URL('NodeDetailPage.ets', root), 'utf8');
  const method = source.slice(source.indexOf('  private appendSample'), source.indexOf('  private async loadAlarms'))
    .replace('private appendSample', 'function appendSample');
  const append = runInNewContext(stripTypeScriptTypes(method) + '\nappendSample');
  const reading = { metric: 'methane', metric_value: 20.8, collected_at: '2026-11-18T05:29:21Z', source: 'HUAWEI_IOT' };
  const detail = { node: { latest: [reading] } };
  const first = append.call(detail, [], 'methane');
  assert.equal(first.length, 1);
  assert.equal(append.call(detail, first, 'methane'), first);
  reading.collected_at = '2026-11-18T05:29:26Z';
  assert.equal(append.call(detail, first, 'methane').length, 2);
  reading.source = 'SIMULATOR';
  assert.equal(append.call(detail, first, 'methane'), first);
});

test('live node cards use the actual alarm and data status', async () => {
  const source = await readFile(new URL('NodeCard.ets', root), 'utf8');
  const helpers = source.slice(source.indexOf('export function chartState'), source.indexOf('@Component'))
    .replace(/^export /gm, '');
  const model = await readFile(new URL('../../models/Inspection.ets', root), 'utf8');
  const label = model.slice(model.indexOf('export function riskLabel')).replace(/^export /gm, '');
  const { chartState, cardStatusLabel } = runInNewContext(stripTypeScriptTypes(label + '\n' + helpers) +
    '\n;({ chartState, cardStatusLabel })');
  const node = { live: true, backendId: 1, state: 'alarm' };
  assert.equal(chartState(node), 'alarm');
  assert.equal(chartState({ ...node, state: 'unknown' }), 'unknown');
  assert.equal(cardStatusLabel(node), '有活动告警');
  assert.equal(cardStatusLabel({ ...node, state: 'normal' }), '无活动告警');
  assert.equal(cardStatusLabel({ ...node, state: 'unknown' }), '暂无读数');
  assert.equal(chartState({ live: false, state: 'watch' }), 'watch');
});

test('repair confirmation retains the returned order id and cannot resubmit the same draft', async () => {
  const source = await readFile(new URL('RepairSheet.ets', root), 'utf8');
  const method = source.slice(source.indexOf('  private async submit'), source.indexOf('  build()'))
    .replace('private async submit', 'async function submit');
  let requests = 0;
  const submit = runInNewContext(stripTypeScriptTypes(method) + '\nsubmit', {
    MobileSession: { async post(path, body) {
      requests++;
      assert.equal(path, '/api/business/orders');
      assert.equal(JSON.parse(body).nodeId, 23);
      assert.equal(JSON.parse(body).description, '待核实设备状态');
      return { id: 81 };
    } }
  });
  const sheet = { description: ' 待核实设备状态 ', node: { id: 'N23', backendId: 23 } };
  await submit.call(sheet);
  assert.equal(sheet.orderId, 81);
  await submit.call(sheet);
  assert.equal(requests, 1);
});
