export interface DispatchDraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface DispatchDraft {
  orderIds: number[]
  participantIds: number[]
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  dueAt: string
  note: string
}

export const dispatchDraftKey = 'nephh-dispatch-draft'
export const dispatchDraftTtlMs = 60 * 60 * 1000
const schemaVersion = 1
const maximumStoredLength = 16 * 1024

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function clock(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && Number.isSafeInteger(value + dispatchDraftTtlMs)
}

function ids(value: unknown, minimum: number, maximum: number): number[] | null {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum ||
      !value.every(positiveId) || new Set(value).size !== value.length) return null
  return [...value]
}

/** Copies only editable dispatch fields, never a token, password, user or server record. */
function editableDraft(value: unknown): DispatchDraft | null {
  if (!object(value)) return null
  const orderIds = ids(value.orderIds, 1, 100)
  const participantIds = ids(value.participantIds, 0, 2)
  const priority = value.priority
  if (!orderIds || !participantIds || (priority !== 'LOW' && priority !== 'MEDIUM' && priority !== 'HIGH') ||
      typeof value.dueAt !== 'string' || value.dueAt.length > 64 ||
      (value.dueAt !== '' && !Number.isFinite(Date.parse(value.dueAt))) ||
      typeof value.note !== 'string' || value.note.length > 2000) return null
  return { orderIds, participantIds, priority,
    dueAt: value.dueAt, note: value.note }
}

/** Call on cancellation, confirmed success and deliberate logout. Storage may be unavailable. */
export function clearDispatchDraft(storage: DispatchDraftStorage | null | undefined): boolean {
  if (!storage) return false
  try {
    storage.removeItem(dispatchDraftKey)
    return true
  } catch {
    return false
  }
}

/** Save editable input for one authenticated owner; saving never submits business data. */
export function saveDispatchDraft(storage: DispatchDraftStorage | null | undefined, ownerId: unknown,
  value: unknown, now = Date.now()): boolean {
  if (!storage) return false
  try {
    const draft = editableDraft(value)
    if (!positiveId(ownerId) || !clock(now) || !draft) {
      clearDispatchDraft(storage)
      return false
    }
    storage.setItem(dispatchDraftKey, JSON.stringify({ version: schemaVersion, ownerId,
      savedAt: now, expiresAt: now + dispatchDraftTtlMs, draft }))
    return true
  } catch {
    clearDispatchDraft(storage)
    return false
  }
}

/**
 * Restore only after fresh server authentication establishes the same owner ID.
 * Callers must reload records and recheck dispatch-policy before enabling submission.
 */
export function restoreDispatchDraft(storage: DispatchDraftStorage | null | undefined, ownerId: unknown,
  now = Date.now()): DispatchDraft | null {
  if (!storage) return null
  try {
    if (!positiveId(ownerId) || !clock(now)) {
      clearDispatchDraft(storage)
      return null
    }
    const raw = storage.getItem(dispatchDraftKey)
    if (raw === null) return null
    if (raw.length > maximumStoredLength) {
      clearDispatchDraft(storage)
      return null
    }
    const saved: unknown = JSON.parse(raw)
    if (!object(saved) || saved.version !== schemaVersion || saved.ownerId !== ownerId ||
        typeof saved.savedAt !== 'number' || !clock(saved.savedAt) ||
        saved.expiresAt !== saved.savedAt + dispatchDraftTtlMs ||
        saved.savedAt > now || now >= Number(saved.expiresAt)) {
      clearDispatchDraft(storage)
      return null
    }
    const draft = editableDraft(saved.draft)
    if (!draft) clearDispatchDraft(storage)
    return draft
  } catch {
    clearDispatchDraft(storage)
    return null
  }
}
