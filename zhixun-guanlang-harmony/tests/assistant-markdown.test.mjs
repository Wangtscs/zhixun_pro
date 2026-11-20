import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

const source = await readFile(new URL('../entry/src/main/ets/features/assistant/AssistantMarkdown.ets', import.meta.url), 'utf8');
const { parseAssistantMarkdown, assistantPlainText } = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`);

test('formats a Chinese AI reply while keeping its steps usable as plain text', () => {
  const reply = '## 处置建议\r\n\r\n1. **先确认**告警\r\n   - 检查 `CH4`\r\n> *注意通风*\r\n---';
  const blocks = parseAssistantMarkdown(reply);
  assert.deepEqual(blocks.map(b => b.kind), ['heading', 'list', 'list', 'quote', 'rule']);
  assert.deepEqual(blocks[1].runs, [{ text: '先确认', style: 'bold' }, { text: '告警', style: 'plain' }]);
  assert.equal(blocks[2].indent, 1);
  assert.deepEqual(blocks[2].runs[1], { text: 'CH4', style: 'code' });
  assert.match(assistantPlainText(reply), /1\. 先确认告警\n检查 CH4\n注意通风/);
});

test('preserves literal Markdown in code, escapes and unpaired markers', () => {
  const blocks = parseAssistantMarkdown('```text\n# x\n**y**\n```\n\\*字面星号；a_b_c；**未闭合');
  assert.equal(blocks[0].kind, 'code');
  assert.equal(blocks[0].runs[0].text, '# x\n**y**');
  assert.equal(blocks[1].runs.map(run => run.text).join(''), '*字面星号；a_b_c；**未闭合');
});
