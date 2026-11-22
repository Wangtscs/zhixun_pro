/** Deterministic simulation only: never used for real device readings. */
export function demoWave(base: number, nodeId: number, metric: string, time: number): number {
  const phase = time / 10000 + nodeId * .71
  const amplitude = metric === 'methane' ? 2.5 : metric === 'humidity' ? 2 : .6
  const value = base + amplitude * (Math.sin(phase) * .7 + Math.sin(phase * .43) * .3)
  return Math.round(Math.max(0, Math.min(metric === 'methane' || metric === 'humidity' ? 100 : 150, value)) * 10) / 10
}
