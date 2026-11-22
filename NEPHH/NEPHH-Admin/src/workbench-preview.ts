export type WorkbenchPreviewKind = 'order' | 'alarm' | 'patrol'
export interface WorkbenchPreviewTarget {
  kind: WorkbenchPreviewKind
  id: number
  areaId: number | null
}
export type PreviewRecord = Record<string, unknown>
export type WorkbenchPreviewResult =
  | { kind: 'ready'; data: PreviewRecord }
  | { kind: 'failed'; message: string; status: number }
  | { kind: 'discarded' }

export function workbenchRecordId(value: unknown): number | null {
  const id = typeof value === 'number' ? value
    : typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** Use the record's stable ID, not a node ID or a matching title. */
export function workbenchPreviewTarget(queue: string, item: PreviewRecord, selectedArea: unknown = null): WorkbenchPreviewTarget | null {
  if (!['urgentAlarms', 'unassigned', 'review', 'overdue', 'patrol', 'assigned', 'processing'].includes(queue)) return null
  const id = workbenchRecordId(item.id)
  if (id === null) return null
  const areaId = workbenchRecordId(item.area_id)
  const expected = selectedArea === '' || selectedArea === null || selectedArea === undefined ? null : workbenchRecordId(selectedArea)
  if (selectedArea !== '' && selectedArea !== null && selectedArea !== undefined && expected === null) return null
  if (expected !== null && areaId !== expected) return null
  return { kind: queue === 'urgentAlarms' ? 'alarm' : queue === 'patrol' ? 'patrol' : 'order', id, areaId }
}

function record(value: unknown): value is PreviewRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function path(target: WorkbenchPreviewTarget): string {
  if (workbenchRecordId(target.id) === null) throw new Error('待办编号无效，无法读取详情')
  if (target.kind === 'alarm') return '/alarms/' + target.id
  if (target.kind === 'patrol') return '/patrol/runs/' + target.id
  if (target.kind === 'order') return '/orders/' + target.id
  throw new Error('待办类型未知，无法读取详情')
}

/** Reject a response for another record or area rather than displaying unrelated evidence. */
function validate(target: WorkbenchPreviewTarget, value: unknown): PreviewRecord {
  if (!record(value)) throw new Error('详情响应不完整，请重新读取')
  let area: unknown
  if (target.kind === 'alarm') {
    if (!record(value.alarm) || !record(value.node) || !record(value.state) ||
        !record(value.relatedOrders) || !Array.isArray(value.relatedOrders.items) ||
        workbenchRecordId(value.alarm.id) !== target.id || workbenchRecordId(value.node.id) === null ||
        workbenchRecordId(value.node.id) !== workbenchRecordId(value.alarm.node_id) ||
        typeof value.state.active !== 'boolean' || typeof value.state.recovered !== 'boolean' ||
        typeof value.state.acknowledged !== 'boolean') throw new Error('告警详情与当前记录不一致，请重新读取')
    area = value.node.area_id
  } else {
    if (workbenchRecordId(value.id) !== target.id ||
        (target.kind === 'order' && !Array.isArray(value.events)) ||
        (target.kind === 'patrol' && !Array.isArray(value.points))) throw new Error('详情与当前记录不一致，请重新读取')
    area = value.area_id
  }
  if (target.areaId !== null && workbenchRecordId(area) !== target.areaId) {
    throw new Error('记录所属区域已变化，请刷新待办范围')
  }
  return value
}

/** Account/context changes, a later selection and disposal all invalidate a pending read. */
export function createWorkbenchPreviewReader(dependencies: {
  read: (path: string) => Promise<unknown>
  context: () => string
}) {
  let generation = 0, disposed = false
  return {
    invalidate() { generation++ },
    dispose() { generation++; disposed = true },
    async load(target: WorkbenchPreviewTarget): Promise<WorkbenchPreviewResult> {
      if (disposed) return { kind: 'discarded' }
      const version = ++generation, owner = dependencies.context()
      const current = () => !disposed && version === generation && owner === dependencies.context()
      try {
        const response = await dependencies.read(path(target))
        if (!current()) return { kind: 'discarded' }
        return { kind: 'ready', data: validate(target, response) }
      } catch (failure) {
        if (!current()) return { kind: 'discarded' }
        return { kind: 'failed', message: failure instanceof Error ? failure.message : '无法读取详情，请重新读取',
          status: failure && typeof failure === 'object' && 'status' in failure ? Number(failure.status) || 0 : 0 }
      }
    }
  }
}
