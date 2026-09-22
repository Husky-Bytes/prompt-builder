import type { PromptSegment } from '../types';

export type BuilderDragSource = { kind: 'block'; id: string } | { kind: 'segment'; index: number };

/** Drop positions refer to gaps in the original list, before removing the source. */
export function applyBuilderDrop(segments: PromptSegment[], source: BuilderDragSource, gap: number): PromptSegment[] {
    if (!Number.isInteger(gap) || gap < 0 || gap > segments.length) return segments;
    if (source.kind === 'block') {
        const next = [...segments];
        next.splice(gap, 0, { type: 'block', blockId: source.id });
        return next;
    }
    if (!Number.isInteger(source.index) || source.index < 0 || source.index >= segments.length) return segments;
    const destination = gap > source.index ? gap - 1 : gap;
    if (destination === source.index) return segments;
    const next = [...segments];
    const [segment] = next.splice(source.index, 1);
    next.splice(destination, 0, segment);
    return next;
}
