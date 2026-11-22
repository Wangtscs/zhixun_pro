import { onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue'

let lockCount = 0
let savedY = 0
let savedStyle: Pick<CSSStyleDeclaration, 'position' | 'top' | 'left' | 'width' | 'overflow'> | undefined

function acquire() {
  if (lockCount++ > 0) return
  savedY = window.scrollY
  const style = document.body.style
  savedStyle = { position: style.position, top: style.top, left: style.left, width: style.width, overflow: style.overflow }
  Object.assign(style, { position: 'fixed', top: `-${savedY}px`, left: '0', width: '100%', overflow: 'hidden' })
}

function release() {
  if (--lockCount > 0) return
  if (savedStyle) Object.assign(document.body.style, savedStyle)
  savedStyle = undefined
  window.scrollTo(0, savedY)
}

/** Preserve the underlying page while focus moves through a fixed overlay. */
export function useOverlayScrollLock(active: MaybeRefOrGetter<boolean>) {
  let held = false
  const stop = watch(() => toValue(active), value => {
    if (value === held) return
    held = value
    if (value) acquire()
    else release()
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    stop()
    if (held) release()
  })
}
