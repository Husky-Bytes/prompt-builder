import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

// Exercise the real TypeScript without adding a test framework or DOM dependency.
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const transpile = (relativePath) => ts.transpileModule(
  fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
).outputText
const geometryUrl = moduleUrl(transpile('../src/utils/dragGeometry.ts'))
const geometry = await import(geometryUrl)
const hookSource = transpile('../src/hooks/usePointerDrag.ts')
let harnessId = 0

/** Minimal hook/DOM adapter: event transitions run unchanged from usePointerDrag. */
async function createHarness(context) {
  const effects = []
  const listeners = new Map()
  const timers = new Map()
  const frames = new Map()
  const captures = new Set()
  const drops = []
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  let currentState = null
  let target = 0
  let hitCount = 0
  let nextId = 0
  let hitElement = null
  let scrollY = 0
  let focused = false
  let releaseThrows = false

  const add = (name, fn, options) => {
    if (!listeners.has(name)) listeners.set(name, new Set())
    listeners.get(name).add({ fn, options })
  }
  const remove = (name, fn) => {
    for (const entry of listeners.get(name) ?? []) {
      if (entry.fn === fn) listeners.get(name).delete(entry)
    }
  }
  const dispatch = (type, values = {}) => {
    const event = {
      pointerId: 1, clientX: 100, clientY: 100, cancelable: true,
      defaultPrevented: false, propagationStopped: false,
      preventDefault() { this.defaultPrevented = true },
      stopPropagation() { this.propagationStopped = true },
      ...values,
    }
    for (const { fn } of listeners.get(type) ?? []) fn(event)
    return event
  }
  const handle = {
    focus(options) { assert.equal(options.preventScroll, true); focused = true },
    setPointerCapture(id) { captures.add(id) },
    hasPointerCapture(id) { return captures.has(id) },
    releasePointerCapture(id) {
      captures.delete(id)
      if (releaseThrows) throw new Error('Pointer already released')
      dispatch('lostpointercapture', { pointerId: id })
    },
  }
  globalThis.document = {
    elementFromPoint: () => hitElement,
    body: {}, documentElement: {},
    addEventListener: add, removeEventListener: remove,
  }
  globalThis.window = {
    innerHeight: 800, innerWidth: 400,
    setTimeout(fn) { timers.set(++nextId, fn); return nextId },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame(fn) { frames.set(++nextId, fn); return nextId },
    cancelAnimationFrame: (id) => frames.delete(id),
    addEventListener: add, removeEventListener: remove,
    getComputedStyle: () => ({ overflowY: 'auto', overflowX: 'hidden' }),
    scrollBy({ top }) { scrollY += top },
  }
  globalThis.__pointerDragTestHooks = {
    useCallback: (fn) => fn,
    useRef: (current) => ({ current }),
    useState: (initial) => {
      currentState = initial
      return [initial, (next) => { currentState = typeof next === 'function' ? next(currentState) : next }]
    },
    useLayoutEffect: (fn) => fn(),
    useEffect: (fn) => effects.push(fn()),
  }
  const reactUrl = moduleUrl(`export const { useCallback, useRef, useState, useLayoutEffect, useEffect } = globalThis.__pointerDragTestHooks;\n// harness ${++harnessId}`)
  const source = hookSource
    .replace("from 'react'", `from '${reactUrl}'`)
    .replace("from '../utils/dragGeometry'", `from '${geometryUrl}'`)
  const { usePointerDrag } = await import(moduleUrl(source))
  delete globalThis.__pointerDragTestHooks
  const hook = usePointerDrag({
    getTarget: () => { hitCount++; return target },
    onDrop: (source, value) => drops.push({ source, target: value }),
    getLabel: (source) => source,
  })
  const props = hook.getHandleProps('card')
  let mounted = true
  const unmount = () => {
    if (!mounted) return
    mounted = false
    effects.forEach((cleanup) => cleanup?.())
  }
  context.after(() => {
    unmount()
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  })
  return {
    drops, timers, frames, captures, listeners, dispatch, unmount,
    state: () => currentState,
    hits: () => hitCount,
    scroll: () => scrollY,
    focused: () => focused,
    setTarget(value) { target = value },
    setHitElement(value) { hitElement = value },
    setReleaseThrows(value) { releaseThrows = value },
    down(pointerType = 'touch') {
      let prevented = false
      props.onPointerDown({
        isPrimary: true, button: 0, currentTarget: handle,
        pointerId: 1, pointerType, clientX: 100, clientY: 100,
        preventDefault() { prevented = true }, stopPropagation() {},
      })
      return prevented
    },
    click() {
      let prevented = false
      props.onClickCapture({
        currentTarget: handle, preventDefault() { prevented = true }, stopPropagation() {},
      })
      return prevented
    },
    hold() {
      const callbacks = [...timers.values()]
      timers.clear()
      callbacks.forEach((fn) => fn())
    },
    frame(time = 16) {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((fn) => fn(time))
    },
  }
}

test('drop geometry handles boundaries, variable heights, horizontal lists and empty lists', () => {
  const rects = [
    { left: 20, top: 100, width: 200, height: 80 },
    { left: 20, top: 200, width: 200, height: 120 },
  ]
  assert.equal(geometry.calculateDropIndex(rects, 30, 105), 0)
  assert.equal(geometry.calculateDropIndex(rects, 30, 140), 1)
  assert.equal(geometry.calculateDropIndex(rects, 30, 260), 2)
  assert.equal(geometry.calculateDropIndex([], 0, 0), 0)
  assert.equal(geometry.getDropPlacement(rects[0], 119, 0, 'horizontal'), 'before')
  assert.equal(geometry.getDropPlacement(rects[0], 120, 0, 'horizontal'), 'after')
  assert.equal(geometry.isPointInRect(rects[0], 20, 100), true)
  assert.equal(geometry.isPointInRect(rects[0], 19, 100), false)
})

test('edge scrolling stays bounded and does not scroll in the center', () => {
  assert.equal(geometry.getEdgeScrollVelocity(400, 0, 800), 0)
  assert.equal(geometry.getEdgeScrollVelocity(0, 0, 800), -700)
  assert.equal(geometry.getEdgeScrollVelocity(800, 0, 800), 700)
  assert.equal(geometry.getEdgeScrollVelocity(-99, 0, 800), -700)
  assert.equal(geometry.getEdgeScrollVelocity(900, 0, 800), 700)
  assert.equal(geometry.getEdgeScrollVelocity(10, 10, 10), 0)
  assert.equal(geometry.getEdgeScrollVelocity(10, 0, 30), 0)
})

test('touch taps do not reorder, deliberate movement drops at index zero and suppresses its click', async (context) => {
  const h = await createHarness(context)
  assert.equal(h.down(), true)
  assert.equal(h.focused(), true)
  h.dispatch('pointerup')
  assert.equal(h.state(), null)
  assert.equal(h.drops.length, 0)
  assert.equal(h.click(), false)
  assert.equal(h.timers.size, 0)
  h.down()
  h.dispatch('pointermove', { clientX: 107 })
  assert.equal(h.state(), null)
  h.dispatch('pointermove', { clientX: 108 })
  assert.equal(h.state().label, 'card')
  assert.equal(h.state().target, 0)
  h.dispatch('pointerup', { clientX: 108 })
  assert.deepEqual(h.drops, [{ source: 'card', target: 0 }])
  assert.equal(h.state(), null)
  assert.equal(h.click(), true)
  assert.equal(h.click(), false)
  assert.equal(h.frames.size, 0)
})

test('touch hold activates; mouse and pen require the smaller movement threshold', async (context) => {
  const h = await createHarness(context)
  h.down()
  h.hold()
  assert.equal(h.state().source, 'card')
  h.dispatch('pointercancel')
  for (const pointerType of ['mouse', 'pen']) {
    h.down(pointerType)
    h.dispatch('pointermove', { clientX: 105 })
    assert.equal(h.state(), null)
    h.dispatch('pointermove', { clientX: 106 })
    assert.equal(h.state().source, 'card')
    h.dispatch('pointercancel')
  }
  assert.equal(h.drops.length, 0)
})

test('native ancestor dragstart is blocked during pending pointer gestures only', async (context) => {
  const h = await createHarness(context)
  assert.equal([...h.listeners.get('dragstart')][0].options, true)
  assert.equal(h.dispatch('dragstart').defaultPrevented, false)
  h.down('mouse')
  const pendingNative = h.dispatch('dragstart')
  assert.equal(pendingNative.defaultPrevented, true)
  assert.equal(pendingNative.propagationStopped, true)
  assert.equal(h.state(), null)
  h.dispatch('pointerup')
  assert.equal(h.dispatch('dragstart').defaultPrevented, false)
})

test('cancellation, invalid release targets and capture loss never commit a drop', async (context) => {
  const h = await createHarness(context)
  for (const [event, values] of [
    ['pointercancel', {}], ['lostpointercapture', {}], ['keydown', { key: 'Escape' }], ['blur', {}],
  ]) {
    h.down()
    h.hold()
    h.dispatch(event, values)
    assert.equal(h.state(), null)
    assert.equal(h.frames.size, 0)
    assert.equal(h.timers.size, 0)
  }
  h.down()
  h.hold()
  h.setTarget(null)
  h.dispatch('pointerup')
  assert.equal(h.drops.length, 0)
  h.down()
  h.hold()
  h.setReleaseThrows(true)
  assert.doesNotThrow(() => h.dispatch('pointercancel'))
  assert.equal(h.state(), null)
})

test('auto-scroll prioritizes overflow ancestors and recalculates targets after window scrolling', async (context) => {
  const h = await createHarness(context)
  h.down()
  h.hold()
  h.dispatch('pointermove', { clientY: 795 })
  const hitsBefore = h.hits()
  h.frame()
  assert.ok(h.scroll() > 0)
  assert.ok(h.hits() > hitsBefore)
  h.dispatch('pointercancel')
  const scrollArea = {
    clientHeight: 100, scrollHeight: 600, clientWidth: 200, scrollWidth: 200,
    scrollTop: 0, scrollLeft: 0, parentElement: null,
    getBoundingClientRect: () => ({ top: 100, bottom: 200, left: 0, right: 200 }),
  }
  h.setHitElement(scrollArea)
  h.down()
  h.hold()
  h.dispatch('pointermove', { clientY: 195 })
  const windowBefore = h.scroll()
  h.frame()
  assert.ok(scrollArea.scrollTop > 0)
  assert.equal(h.scroll(), windowBefore)
})

test('unmount removes listeners, frame, timer and capture without a drop', async (context) => {
  const h = await createHarness(context)
  h.down()
  h.hold()
  h.unmount()
  assert.equal(h.frames.size, 0)
  assert.equal(h.timers.size, 0)
  assert.equal(h.captures.size, 0)
  assert.equal(h.drops.length, 0)
  assert.ok([...h.listeners.values()].every((set) => set.size === 0))
})
