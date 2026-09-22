import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { getEdgeScrollVelocity } from '../utils/dragGeometry'

export interface PointerDragState<Source, Target> {
  source: Source
  target: Target | null
  x: number
  y: number
  label: string
}

interface PointerDragOptions<Source, Target> {
  /** Hit-test the current DOM; returning null makes this an invalid drop. */
  getTarget: (clientX: number, clientY: number, source: Source) => Target | null
  onDrop: (source: Source, target: Target) => void
  getLabel?: (source: Source) => string
}

interface DragSession<Source, Target> {
  source: Source
  target: Target | null
  handle: HTMLElement
  pointerId: number
  pointerType: string
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
  holdTimer: number | null
  frame: number | null
  lastFrameTime: number | null
}

function scrollAtPointer(x: number, y: number, elapsedSeconds: number): void {
  let element = document.elementFromPoint(x, y)
  let scrolledX = false
  let scrolledY = false
  while (element && element !== document.body && element !== document.documentElement) {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    if (!scrolledY && /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) {
      const amount = getEdgeScrollVelocity(y, Math.max(0, rect.top), Math.min(window.innerHeight, rect.bottom)) * elapsedSeconds
      const before = element.scrollTop
      element.scrollTop += amount
      scrolledY = element.scrollTop !== before
    }
    if (!scrolledX && /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth) {
      const amount = getEdgeScrollVelocity(x, Math.max(0, rect.left), Math.min(window.innerWidth, rect.right)) * elapsedSeconds
      const before = element.scrollLeft
      element.scrollLeft += amount
      scrolledX = element.scrollLeft !== before
    }
    if (scrolledX && scrolledY) return
    element = element.parentElement
  }
  const dx = scrolledX ? 0 : getEdgeScrollVelocity(x, 0, window.innerWidth) * elapsedSeconds
  const dy = scrolledY ? 0 : getEdgeScrollVelocity(y, 0, window.innerHeight) * elapsedSeconds
  if (dx || dy) window.scrollBy({ left: dx, top: dy, behavior: 'instant' })
}

/**
 * Spread getHandleProps(source) onto a dedicated 44px+ handle with
 * touch-action: none. Keep normal touch scrolling enabled on the card/body.
 * Touch starts on a 180ms hold OR 8px movement; mouse/pen start after 6px.
 * Cards can keep their separate HTML desktop drag-and-drop handlers.
 */
export function usePointerDrag<Source, Target>(options: PointerDragOptions<Source, Target>) {
  const [drag, setDrag] = useState<PointerDragState<Source, Target> | null>(null)
  const optionsRef = useRef(options)
  const sessionRef = useRef<DragSession<Source, Target> | null>(null)
  const suppressClickRef = useRef<{ handle: HTMLElement; until: number } | null>(null)

  useLayoutEffect(() => {
    optionsRef.current = options
  }, [options])

  const updateDrag = useCallback((session: DragSession<Source, Target>) => {
    session.target = optionsRef.current.getTarget(session.x, session.y, session.source)
    setDrag({
      source: session.source,
      target: session.target,
      x: session.x,
      y: session.y,
      label: optionsRef.current.getLabel?.(session.source) ?? '',
    })
  }, [])

  const finish = useCallback((commit: boolean, updateState = true) => {
    const session = sessionRef.current
    if (!session) return
    sessionRef.current = null
    if (session.holdTimer !== null) window.clearTimeout(session.holdTimer)
    if (session.frame !== null) window.cancelAnimationFrame(session.frame)
    try {
      if (session.handle.hasPointerCapture(session.pointerId)) session.handle.releasePointerCapture(session.pointerId)
    } catch {
      // The browser may already have released this pointer or detached its handle.
    }
    if (session.active) suppressClickRef.current = { handle: session.handle, until: performance.now() + 700 }
    if (updateState) setDrag(null)
    if (commit && session.active) {
      // Recalculate on release, including any scrolling in the final frame.
      const target = optionsRef.current.getTarget(session.x, session.y, session.source)
      if (target !== null) optionsRef.current.onDrop(session.source, target)
    }
  }, [])

  const activate = useCallback((session: DragSession<Source, Target>) => {
    if (sessionRef.current !== session || session.active) return
    session.active = true
    if (session.holdTimer !== null) window.clearTimeout(session.holdTimer)
    session.holdTimer = null
    updateDrag(session)
    const frame = (time: number) => {
      if (sessionRef.current !== session) return
      const elapsed = session.lastFrameTime === null ? 1 / 60 : Math.min(32, time - session.lastFrameTime) / 1000
      session.lastFrameTime = time
      scrollAtPointer(session.x, session.y, elapsed)
      updateDrag(session)
      session.frame = window.requestAnimationFrame(frame)
    }
    session.frame = window.requestAnimationFrame(frame)
  }, [updateDrag])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const session = sessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      session.x = event.clientX
      session.y = event.clientY
      const threshold = session.pointerType === 'touch' ? 8 : 6
      if (!session.active && Math.hypot(session.x - session.startX, session.y - session.startY) >= threshold) activate(session)
      if (session.active) {
        if (event.cancelable) event.preventDefault()
        updateDrag(session)
      }
    }
    const up = (event: PointerEvent) => {
      const session = sessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      session.x = event.clientX
      session.y = event.clientY
      finish(true)
    }
    const cancelPointer = (event: PointerEvent) => {
      if (sessionRef.current?.pointerId === event.pointerId) finish(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && sessionRef.current) {
        event.preventDefault()
        finish(false)
      }
    }
    const blur = () => finish(false)
    const blockNativeDrag = (event: DragEvent) => {
      // Native dragstart may target a draggable ancestor instead of the handle.
      if (sessionRef.current) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('dragstart', blockNativeDrag, true)
    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', cancelPointer)
    document.addEventListener('lostpointercapture', cancelPointer)
    document.addEventListener('keydown', escape)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('dragstart', blockNativeDrag, true)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', cancelPointer)
      document.removeEventListener('lostpointercapture', cancelPointer)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('blur', blur)
      finish(false, false)
    }
  }, [activate, finish, updateDrag])

  const getHandleProps = useCallback((source: Source) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (!event.isPrimary || event.button !== 0 || sessionRef.current) return
      event.preventDefault()
      event.stopPropagation()
      const handle = event.currentTarget
      // Cancel native ancestor dragging while keeping keyboard focus on the handle.
      handle.focus({ preventScroll: true })
      const session: DragSession<Source, Target> = {
        source,
        target: null,
        handle,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        active: false,
        holdTimer: null,
        frame: null,
        lastFrameTime: null,
      }
      sessionRef.current = session
      suppressClickRef.current = null
      handle.setPointerCapture(event.pointerId)
      if (event.pointerType === 'touch') session.holdTimer = window.setTimeout(() => activate(session), 180)
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      const suppressed = suppressClickRef.current
      if (suppressed && suppressed.handle === event.currentTarget && performance.now() < suppressed.until) {
        event.preventDefault()
        event.stopPropagation()
        suppressClickRef.current = null
      }
    },
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      // A long press is a drag gesture on this handle, never a browser menu.
      event.preventDefault()
    },
    onDragStart: (event: ReactDragEvent<HTMLElement>) => {
      // Handles use pointer events; card bodies may still use native desktop DnD.
      event.preventDefault()
      event.stopPropagation()
    },
  }), [activate])

  const cancel = useCallback(() => finish(false), [finish])
  return { drag, getHandleProps, cancel }
}
