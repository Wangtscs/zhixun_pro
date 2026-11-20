type Row = Record<string, any>
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export const pendingWriteKey = 'nephh-pending-order-write'

/** Persist evidence and editable order fields only. Never persist a session, credentials or server records. */
export function savePendingOrderWrite(storage: Storage | null, operation: Row): boolean {
  if (!storage) return false
  const kind = operation.kind, body = operation.body || {}
  if (!['assign', 'action', 'schedule'].includes(kind) || !Number.isSafeInteger(operation.actorId) || !Array.isArray(operation.before)) return false
  const fields = kind === 'assign' ? ['participantIds', 'assigneeId', 'priority', 'dueAt', 'note'] : kind === 'action' ? ['action', 'note', 'result', 'readings'] : ['priority', 'dueAt', 'note']
  const safeBody = Object.fromEntries(fields.filter(key => body[key] !== undefined).map(key => [key, body[key]]))
  const before = operation.before.map((row: Row) => ({ id: row.id, events: [{ id: Math.max(0, ...(row.events || []).map((event: Row) => Number(event.id) || 0)) }] }))
  try { storage.setItem(pendingWriteKey, JSON.stringify({ version: 1, kind, actorId: operation.actorId, body: safeBody, before })); return true } catch { return false }
}
export function clearPendingOrderWrite(storage: Storage | null): void { try { storage?.removeItem(pendingWriteKey) } catch {} }
export function restorePendingOrderWrite(storage: Storage | null, actorId: number): Row | null {
  try {
    const raw = storage?.getItem(pendingWriteKey); if (!raw) return null
    if (raw.length > 65536) { clearPendingOrderWrite(storage); return null }
    const value = JSON.parse(raw)
    if (value.version !== 1 || value.actorId !== actorId || !['assign', 'action', 'schedule'].includes(value.kind) || !value.body || !Array.isArray(value.before) || !value.before.length || value.before.length > 100 || value.before.some((row: Row) => !Number.isSafeInteger(row.id) || row.id <= 0 || !Array.isArray(row.events))) { clearPendingOrderWrite(storage); return null }
    // Reuse the allowlist even when storage has been modified outside the application.
    const scratch = new Map<string, string>()
    savePendingOrderWrite({ getItem: key => scratch.get(key) || null, setItem: (key, text) => { scratch.set(key, text) }, removeItem: key => { scratch.delete(key) } }, value)
    return JSON.parse(scratch.get(pendingWriteKey)!)
  } catch { clearPendingOrderWrite(storage); return null }
}
type Outcome = { kind: 'blocked' | 'committed' | 'unknown' | 'rejected' | 'abandoned'; error?: unknown; refreshError?: unknown }
interface CommitWork { commit: () => void; refresh: () => Promise<unknown>; current?: () => boolean }

/** A lost response never authorizes a retry. A confirmed write closes its form before refreshing. */
export function createWriteWorkflow() {
  let phase: 'idle' | 'saving' | 'unknown' = 'idle', generation = 0, checking = false
  async function committed(work: CommitWork, version: number): Promise<Outcome> {
    if (version !== generation || work.current?.() === false) return { kind: 'abandoned' }
    work.commit()
    try { await work.refresh(); return { kind: 'committed' } }
    catch (refreshError) { return { kind: 'committed', refreshError } }
    finally { if (version === generation) phase = 'idle' }
  }
  return {
    locked: () => phase !== 'idle',
    abandon: () => { generation++; phase = 'idle'; checking = false },
    resumeUnknown: () => { if (phase === 'idle') phase = 'unknown' },
    async submit(work: CommitWork & { write: () => Promise<unknown> }): Promise<Outcome> {
      if (phase !== 'idle') return { kind: 'blocked' }
      const version = generation; phase = 'saving'
      try { await work.write() }
      catch (error) {
        if (version !== generation || work.current?.() === false) return { kind: 'abandoned' }
        const unknown = !!error && typeof error === 'object' && (error as Row).outcomeUnknown === true
        phase = unknown ? 'unknown' : 'idle'
        return { kind: unknown ? 'unknown' : 'rejected', error }
      }
      return committed(work, version)
    },
    async verify(work: CommitWork & { read: () => Promise<unknown>; provesCommit: (value: unknown) => boolean }): Promise<Outcome> {
      if (phase !== 'unknown' || checking) return { kind: 'blocked' }
      const version = generation; checking = true
      try {
        const evidence = await work.read()
        if (version !== generation || work.current?.() === false) return { kind: 'abandoned' }
        if (!work.provesCommit(evidence)) return { kind: 'unknown' }
        return await committed(work, version)
      } catch (error) { return { kind: 'unknown', error } }
      finally { if (version === generation) checking = false }
    }
  }
}

export function allowedOrderActions(order: Row, actor: { id: number; role: string; readonly?: boolean }): string[] {
  if (actor.readonly || !Number.isSafeInteger(actor.id) || actor.id <= 0) return []
  const manager = ['ADMIN', 'MANAGER'].includes(actor.role)
  const owner = order.assignee_id === actor.id || (Array.isArray(order.participant_ids) && order.participant_ids.includes(actor.id))
  const actions: string[] = []
  if (owner && order.status === 'ASSIGNED') actions.push('accept')
  if (owner && order.status === 'ACCEPTED') actions.push('start')
  if (owner && order.status === 'PROCESSING') actions.push('submit')
  if (manager && order.status === 'REVIEW') { if (order.assignee_id !== actor.id) actions.push('approve'); actions.push('reject') }
  if (manager && !['COMPLETED', 'CANCELLED'].includes(order.status)) actions.push('cancel')
  return actions
}

function sameIds(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  return [...left].map(Number).sort((a, b) => a - b).every((value, index) => value === [...right].map(Number).sort((a, b) => a - b)[index])
}

/** Only a fresh matching target state plus a new actor event is positive evidence, never an unchanged GET. */
export function provesOrderWrite(kind: string, body: Row, before: readonly Row[], after: readonly Row[], actorId: number): boolean {
  const expected: Record<string, string> = { accept: 'ACCEPTED', start: 'PROCESSING', submit: 'REVIEW', reject: 'PROCESSING', approve: 'COMPLETED', cancel: 'CANCELLED' }
  if (!['assign', 'action', 'schedule'].includes(kind) || !before.length || before.length !== after.length) return false
  return before.every(previous => {
    const current = after.find(row => row.id === previous.id)
    if (!current || !Array.isArray(current.events)) return false
    const baseline = Math.max(0, ...(Array.isArray(previous.events) ? previous.events.map((event: Row) => Number(event.id) || 0) : []))
    const action = kind === 'assign' ? 'ASSIGN' : kind === 'schedule' ? 'UPDATE_SCHEDULE' : String(body.action || '').toUpperCase()
    const event = current.events.some((row: Row) => Number(row.id) > baseline && row.actor_id === actorId && row.action === action && String(row.note || '').trim() === String(body.note || '').trim())
    if (!event) return false
    if (kind === 'assign' && (current.status !== 'ASSIGNED' || current.assignee_id !== Number(body.assigneeId) || !sameIds(current.participant_ids, body.participantIds))) return false
    if (kind === 'action' && current.status !== expected[body.action]) return false
    if (kind === 'action' && body.action === 'submit' && (current.result_text !== String(body.result || '').trim() || current.readings !== String(body.readings || ''))) return false
    if (kind === 'assign' || kind === 'schedule') {
      if (current.priority !== body.priority) return false
      if ((current.due_at ? Date.parse(current.due_at) : null) !== (body.dueAt ? Date.parse(body.dueAt) : null)) return false
    }
    return true
  })
}

/** Restored dispatches are new drafts only; reads must be individual stable-ID requests. */
export async function restoreDraftRecords(ids: readonly number[], read: (id: number) => Promise<Row>): Promise<Row[]> {
  const rows = await Promise.all(ids.map(id => read(id)))
  if (rows.length !== ids.length || rows.some((row, index) => row.id !== ids[index] || row.status !== 'DRAFT')) throw new Error('草稿关联工单已不可派发，未恢复旧派单')
  return rows
}

/** Escape closes one topmost layer; a writing or uncertain form cannot be dismissed. */
export function topEscapeLayer(layers: { form: boolean; locked: boolean; run: boolean; alarm: boolean; audit: boolean; node: boolean; menu: boolean }): string | null {
  if (layers.form) return layers.locked ? null : 'form'
  if (layers.run) return 'run'
  if (layers.alarm) return 'alarm'
  if (layers.audit) return 'audit'
  if (layers.node) return 'node'
  if (layers.menu) return 'menu'
  return null
}
