export interface WeeklyReportPoint {
  label: string
  planned: number | null
  completed: number | null
}

function percentage(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

/** Consume supplied percentage fields; absent values never become zero or another series' derivative. */
export function weeklyReportPoints(values: unknown): WeeklyReportPoint[] {
  if (!Array.isArray(values)) return []
  return values.map((value, index) => {
    const record = value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : null
    return {
      label: typeof record?.label === 'string' && record.label.trim() ? record.label.trim() : `记录${index + 1}（周标签未提供）`,
      planned: percentage(record?.planned),
      completed: percentage(record?.completed)
    }
  })
}
