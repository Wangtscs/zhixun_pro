export interface DispatchWorker {
  id?: number
  username?: string
  display_name?: string
  role_code?: string
  enabled?: boolean
  areas?: readonly unknown[]
}

export interface DispatchOrder {
  id?: number
  node_id?: number
  area_id?: number
  status?: string
}

interface DispatchNode {
  id?: number
  area_id?: number
}

/** Resolve every selected order; missing records, areas or non-dispatchable states fail closed. */
export function dispatchAreaIds(orderIds: readonly unknown[], orders: readonly DispatchOrder[], nodes: readonly DispatchNode[]): number[] | null {
  const ids = orderIds.map(Number)
  if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) return null
  const areas = new Set<number>()
  for (const id of ids) {
    const order = orders.find(row => row.id === id)
    if (!order || !['DRAFT', 'ASSIGNED', 'ACCEPTED', 'PROCESSING'].includes(order.status || '')) return null
    const area = Number(order.area_id ?? nodes.find(node => node.id === order.node_id)?.area_id)
    if (!Number.isSafeInteger(area) || area <= 0) return null
    areas.add(area)
  }
  return [...areas]
}

/** Return enabled inspectors authorized for every requested area; unknown areas fail closed. */
export function eligibleDispatchWorkers<T extends DispatchWorker>(workers: readonly T[], areaIds: readonly unknown[], search = ''): T[] {
  const areas = areaIds.map(Number)
  if (!areas.length || areas.some(area => !Number.isSafeInteger(area) || area <= 0)) return []
  const query = search.trim().toLocaleLowerCase('zh-CN')
  return workers.filter(worker => worker.enabled === true && worker.role_code === 'INSPECTOR' &&
    Number.isSafeInteger(worker.id) && Number(worker.id) > 0 && Array.isArray(worker.areas) &&
    areas.every(area => worker.areas!.some(value => Number(value) === area)) &&
    (!query || `${worker.display_name || ''} ${worker.username || ''}`.toLocaleLowerCase('zh-CN').includes(query)))
    .sort((left, right) => (left.display_name || left.username || '').localeCompare(right.display_name || right.username || '', 'zh-CN') || Number(left.id) - Number(right.id))
}

/** A selected crew must contain one or two distinct eligible users, regardless of search. */
export function validDispatchCrew(workers: readonly DispatchWorker[], areaIds: readonly unknown[], selected: readonly unknown[]): boolean {
  if (selected.length < 1 || selected.length > 2 || new Set(selected.map(Number)).size !== selected.length) return false
  const eligible = new Set(eligibleDispatchWorkers(workers, areaIds).map(worker => worker.id))
  return selected.every(id => Number.isSafeInteger(Number(id)) && eligible.has(Number(id)))
}
