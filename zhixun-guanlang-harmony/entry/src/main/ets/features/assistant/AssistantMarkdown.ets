export interface MarkdownRun {
  text: string;
  style: string;
}

export interface MarkdownBlock {
  kind: string;
  runs: MarkdownRun[];
  marker: string;
  indent: number;
  level: number;
}

function inline(text: string): MarkdownRun[] {
  const runs: MarkdownRun[] = [];
  const tokens = /\\([\\`*_#>\[\]~+.-])|(`+)([^\n]+?)\2(?!`)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|(?<!\*)\*([^*\s][^*\n]*?)\*(?!\*)|(?<![\w_])_([^_\s][^_\n]*?)_(?![\w_])/g;
  let offset = 0;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(text)) !== null) {
    if (match.index > offset) {
      runs.push({ text: text.slice(offset, match.index), style: 'plain' });
    }
    if (match[1]) {
      runs.push({ text: match[1], style: 'plain' });
    } else if (match[3]) {
      runs.push({ text: match[3], style: 'code' });
    } else if (match[4] || match[5]) {
      runs.push({ text: match[4] || match[5], style: 'bold' });
    } else {
      runs.push({ text: match[6] || match[7], style: 'italic' });
    }
    offset = tokens.lastIndex;
  }
  if (offset < text.length) {
    runs.push({ text: text.slice(offset), style: 'plain' });
  }
  return runs;
}

function block(kind: string, text: string, marker: string = '', indent: number = 0, level: number = 0): MarkdownBlock {
  const runs: MarkdownRun[] = kind === 'code' ? [{ text: text, style: 'code' }] : inline(text);
  return { kind: kind, runs: runs, marker: marker, indent: indent, level: level };
}

export function parseAssistantMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const body = line.trim();
    if (!body) {
      continue;
    }
    const fence = /^(\x60{3,}|~{3,})(?:[^\x60~]*)$/.exec(body);
    const heading = /^(#{1,6})\s+(.+)$/.exec(body);
    const list = /^(\s*)([-+*]|\d{1,9}[.)])\s+(.+)$/.exec(line);
    if (fence) {
      const code: string[] = [];
      const closing = new RegExp('^' + fence[1][0] + '{' + fence[1].length + ',}$');
      for (i++; i < lines.length && !closing.test(lines[i].trim()); i++) {
        code.push(lines[i]);
      }
      blocks.push(block('code', code.join('\n')));
    } else if (heading) {
      blocks.push(block('heading', heading[2].replace(/\s+#+$/, ''), '', 0, heading[1].length));
    } else if (/^(?:-(?:\s*-){2,}|\*(?:\s*\*){2,}|_(?:\s*_){2,})$/.test(body)) {
      blocks.push(block('rule', ''));
    } else if (list) {
      const indent = Math.min(3, Math.floor(list[1].replace(/\t/g, '    ').length / 2));
      const marker = /^\d/.test(list[2]) ? list[2] : '•';
      blocks.push(block('list', list[3], marker, indent));
    } else if (body.startsWith('>')) {
      blocks.push(block('quote', body.slice(1).trimStart()));
    } else {
      blocks.push(block('paragraph', body));
    }
  }
  return blocks;
}

export function assistantPlainText(source: string): string {
  return parseAssistantMarkdown(source).filter((item: MarkdownBlock) => item.kind !== 'rule')
    .map((item: MarkdownBlock) => {
      const prefix = item.kind === 'list' && item.marker !== '•' ? item.marker + ' ' : '';
      return prefix + item.runs.map((run: MarkdownRun) => run.text).join('');
    }).join('\n');
}
