const checkSuffix: RegExp = /(?:^|\n)现场检查清单：([1-5](?:,[1-5])*)?$/;

export function toggleOrderCheck(checks: number[], index: number): number[] {
  if (index < 0 || index > 4 || !Number.isInteger(index)) { return checks; }
  return checks.includes(index) ? checks.filter((item: number) => item !== index) : checks.concat([index]);
}

export function readOrderChecks(readings: string): number[] {
  const match = checkSuffix.exec(readings);
  return match && match[1] ? match[1].split(',').map((item: string) => Number(item) - 1) : [];
}

export function writeOrderChecks(readings: string, checks: number[]): string {
  const previous = readings.replace(checkSuffix, '');
  const selected = [0, 1, 2, 3, 4].filter((item: number) => checks.includes(item))
    .map((item: number) => (item + 1).toString()).join(',');
  if (!selected) { return previous; }
  return (previous ? previous + '\n' : '') + '现场检查清单：' + selected;
}

export class LiveOrderChecks {
  private static drafts: Map<number, number[]> = new Map<number, number[]>();

  static get(id: number, saved: string): number[] {
    return LiveOrderChecks.drafts.get(id) || readOrderChecks(saved);
  }

  static save(id: number, checks: number[]): void { LiveOrderChecks.drafts.set(id, checks); }
  static clear(id: number): void { LiveOrderChecks.drafts.delete(id); }
  static reset(): void { LiveOrderChecks.drafts.clear(); }
}

export function orderAction(status: string): string {
  switch (status) {
    case 'ASSIGNED': return 'accept';
    case 'ACCEPTED': return 'start';
    case 'PROCESSING': return 'submit';
    default: return '';
  }
}

export function orderPriority(priority: string): string {
  switch (priority) {
    case 'HIGH': return '高';
    case 'MEDIUM': return '中';
    case 'LOW': return '低';
    default: return '—';
  }
}

export function orderDeadline(due: string): string {
  if (!due) { return '未设置'; }
  const date = new Date(due);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : due;
}
