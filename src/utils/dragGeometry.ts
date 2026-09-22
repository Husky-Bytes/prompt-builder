/** Geometry shared by pointer drag hit-testing and edge scrolling. */
export interface DragRect {
  left: number
  top: number
  width: number
  height: number
}

export type DragAxis = 'vertical' | 'horizontal'
export type DropPlacement = 'before' | 'after'

export function isPointInRect(rect: DragRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height
}

/** A card's first half inserts before it; its second half inserts after it. */
export function getDropPlacement(rect: DragRect, x: number, y: number, axis: DragAxis = 'vertical'): DropPlacement {
  const after = axis === 'vertical' ? y >= rect.top + rect.height / 2 : x >= rect.left + rect.width / 2
  return after ? 'after' : 'before'
}

/** Find an insertion slot in a list whose rectangles follow its visual order. */
export function calculateDropIndex(rects: readonly DragRect[], x: number, y: number, axis: DragAxis = 'vertical'): number {
  const index = rects.findIndex((rect) => getDropPlacement(rect, x, y, axis) === 'before')
  return index === -1 ? rects.length : index
}

/** Signed pixels/second, smoothly increasing toward either edge. */
export function getEdgeScrollVelocity(position: number, start: number, end: number, edgeSize = 56, maxSpeed = 700): number {
  const edge = Math.min(edgeSize, (end - start) / 3)
  if (edge <= 0) return 0
  if (position < start + edge) return -maxSpeed * Math.min(1, Math.max(0, (start + edge - position) / edge))
  if (position > end - edge) return maxSpeed * Math.min(1, Math.max(0, (position - end + edge) / edge))
  return 0
}
