import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DragEvent, SyntheticEvent } from 'react';
import { useStore } from '../store';
import { PRESET_COLORS } from '../types';
import type { Block, PromptSegment } from '../types';
import { copyText } from '../utils/clipboard';
import { usePointerDrag } from '../hooks/usePointerDrag';
import { applyBuilderDrop } from '../utils/builderDrag';
import type { BuilderDragSource } from '../utils/builderDrag';
import './PromptBuilder.css';

const COLOR_NAMES = ['Indigo', 'Violet', 'Pink', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Sky', 'Slate'];

export function PromptBuilder() {
    const { blocks, prompts, savePrompt, editPromptId, setEditPromptId, addBlock, builderState, setBuilderState, updateBlock, folders } = useStore();
    const { title, notes, rating, folderId } = builderState;
    const segments = builderState.segments as PromptSegment[];
    const updateState = (updates: Partial<typeof builderState>) => {
        setBuilderState((previous: typeof builderState) => ({ ...previous, ...updates }));
        setCopied(false);
        setStatus('');
    };

    const [blocksExpanded, setBlocksExpanded] = useState(false);
    const [status, setStatus] = useState('');
    const [copied, setCopied] = useState(false);
    const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
    const [selection, setSelection] = useState<{ index: number; start: number; end: number; text: string } | null>(null);
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const [editBlockName, setEditBlockName] = useState('');
    const [editBlockContent, setEditBlockContent] = useState('');
    const [editBlockColor, setEditBlockColor] = useState<string | undefined>();
    const [searchQuery, setSearchQuery] = useState('');
    const [filterColor, setFilterColor] = useState<string | null>(null);
    const [sortByBlocks, setSortByBlocks] = useState('newest');
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);
    const segmentsElement = useRef<HTMLDivElement>(null);

    const dropIntoBuilder = (source: BuilderDragSource, gap: number) => {
        if (source.kind === 'block' && !blocks.some(block => block.id === source.id)) return;
        const next = applyBuilderDrop(segments, source, gap);
        if (next === segments) return;
        updateState({ segments: next });
        setSelection(null);
        setStatus(source.kind === 'block' ? 'Block added at the drop position.' : 'Prompt order updated.');
    };

    const pointerDrag = usePointerDrag<BuilderDragSource, number>({
        getLabel: source => source.kind === 'block' ? blocks.find(block => block.id === source.id)?.name || 'Block' : `Item ${source.index + 1}`,
        getTarget: (x, y) => {
            const zone = segmentsElement.current;
            const hit = document.elementFromPoint(x, y);
            if (!zone || !hit || !zone.contains(hit)) return null;
            const items = Array.from(zone.querySelectorAll<HTMLElement>('[data-builder-index]'));
            if (!items.length) return 0;
            // Nearest card also handles the gaps between wrapped rows of segments.
            const nearest = items.reduce((best, item) => {
                const rect = item.getBoundingClientRect();
                const dx = Math.max(rect.left - x, 0, x - rect.right);
                const dy = Math.max(rect.top - y, 0, y - rect.bottom);
                const distance = dx * dx + dy * dy;
                return distance < best.distance ? { item, distance } : best;
            }, { item: items[0], distance: Infinity }).item;
            const rect = nearest.getBoundingClientRect();
            const index = Number(nearest.dataset.builderIndex);
            const vertical = window.matchMedia('(max-width: 800px)').matches || rect.width > zone.clientWidth * 0.8;
            const before = y < rect.top || (y <= rect.bottom && (vertical ? y < rect.top + rect.height / 2 : x < rect.left + rect.width / 2));
            return before ? index : index + 1;
        },
        onDrop: dropIntoBuilder,
    });
    const activeDrag = pointerDrag.drag;
    const activeDropIndex = activeDrag ? activeDrag.target : dragOverIndex;
    const activeSourceIndex = activeDrag ? (activeDrag.source.kind === 'segment' ? activeDrag.source.index : null) : dragSourceIndex;
    const dragging = !!activeDrag || isDragging;

    const blockUsageCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        segments.forEach(segment => {
            if (segment.type === 'block') counts[segment.blockId] = (counts[segment.blockId] || 0) + 1;
        });
        return counts;
    }, [segments]);

    const filteredBlocks = useMemo(() => blocks.filter(block => {
        const query = searchQuery.toLowerCase();
        const matchesSearch = !query || block.name.toLowerCase().includes(query) || block.content.toLowerCase().includes(query);
        const matchesColor = filterColor === 'none' ? !block.color : !filterColor || block.color === filterColor;
        return matchesSearch && matchesColor;
    }).sort((a, b) => {
        if (sortByBlocks === 'oldest') return a.createdAt - b.createdAt;
        if (sortByBlocks === 'az') return a.name.localeCompare(b.name);
        if (sortByBlocks === 'za') return b.name.localeCompare(a.name);
        if (sortByBlocks === 'color') return (a.color || '').localeCompare(b.color || '');
        return b.createdAt - a.createdAt;
    }), [blocks, searchQuery, filterColor, sortByBlocks]);

    const preview = useMemo(() => segments.map((segment, index) => {
        const content = segment.type === 'block'
            ? blocks.find(block => block.id === segment.blockId)?.content || ''
            : segment.type === 'newline' ? '\n' : segment.content;
        const prefix = index > 0 && segments[index - 1].type !== 'newline' && segment.type !== 'newline' ? ' ' : '';
        return prefix + content;
    }).join(''), [segments, blocks]);
    const wordCount = preview.trim().split(/\s+/).filter(Boolean).length;

    const startEditingBlock = (block: Block) => {
        setEditingBlockId(block.id);
        setEditBlockName(block.name);
        setEditBlockContent(block.content);
        setEditBlockColor(block.color);
    };

    const saveBlockEdit = (id: string) => {
        if (!editBlockName.trim() || !editBlockContent.trim()) return;
        updateBlock(id, { name: editBlockName, content: editBlockContent, color: editBlockColor });
        setEditingBlockId(null);
        setCopied(false);
        setCopiedBlockId(null);
        setStatus('Block updated.');
    };

    const handleTextSelect = (index: number, event: SyntheticEvent<HTMLTextAreaElement>) => {
        const target = event.currentTarget;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        setSelection(start !== end ? { index, start, end, text: target.value.substring(start, end) } : null);
    };

    const createBlockFromSelection = () => {
        if (!selection) return;
        const target = segments[selection.index];
        if (!target || target.type !== 'text' || target.content.substring(selection.start, selection.end) !== selection.text) {
            setSelection(null);
            return;
        }
        const name = window.prompt('Name for this new block:', selection.text);
        if (!name?.trim()) return;
        const blockId = addBlock({ name: name.trim(), content: selection.text });
        const before = target.content.substring(0, selection.start);
        const after = target.content.substring(selection.end);
        const replacement: PromptSegment[] = [];
        if (before) replacement.push({ type: 'text', content: before });
        replacement.push({ type: 'block', blockId });
        if (after) replacement.push({ type: 'text', content: after });
        const updated = [...segments];
        updated.splice(selection.index, 1, ...replacement);
        updateState({ segments: updated });
        setSelection(null);
        setStatus(`Created block: ${name.trim()}.`);
    };

    const addBlockSegment = (blockId: string) => {
        updateState({ segments: [...segments, { type: 'block', blockId }] });
        setSelection(null);
        setStatus(`Added ${blocks.find(block => block.id === blockId)?.name || 'block'} to prompt.`);
    };

    const addTextSegment = () => {
        updateState({ segments: [...segments, { type: 'text', content: '' }] });
        setSelection(null);
    };

    const addNewlineSegment = () => {
        updateState({ segments: [...segments, { type: 'newline' }] });
        setSelection(null);
    };

    const removeSegment = (index: number) => {
        updateState({ segments: segments.filter((_, segmentIndex) => segmentIndex !== index) });
        setSelection(null);
    };

    const moveSegment = (index: number, offset: number) => {
        const destination = index + offset;
        if (destination < 0 || destination >= segments.length) return;
        const updated = [...segments];
        const [segment] = updated.splice(index, 1);
        updated.splice(destination, 0, segment);
        updateState({ segments: updated });
        setSelection(null);
        setStatus(`Moved item ${index + 1} to position ${destination + 1}.`);
    };

    const updateTextSegment = (index: number, content: string) => {
        updateState({ segments: segments.map((segment, segmentIndex) => segmentIndex === index && segment.type === 'text' ? { ...segment, content } : segment) });
        setSelection(null);
        setCopied(false);
    };

    const handleCancel = () => {
        setEditPromptId(null);
        updateState({ title: '', segments: [], rating: 0, notes: '', folderId: undefined });
        setSelection(null);
        setStatus('Edit cancelled.');
    };

    const hasDraft = segments.length > 0 || Boolean(title || notes || rating || folderId || editPromptId);
    const handleClearDraft = () => {
        if (hasDraft && !window.confirm('Clear the current draft and start a new prompt? Saved prompts and blocks will stay.')) return;
        setEditPromptId(null);
        updateState({ title: '', segments: [], rating: 0, notes: '', folderId: undefined });
        setSelection(null);
        setStatus('Draft cleared. Ready for a new prompt.');
    };

    const handleSave = (asNew = false) => {
        if (segments.length === 0) return;
        let finalTitle = title.trim();
        if (!finalTitle) {
            const now = new Date();
            finalTitle = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;
        } else if (asNew && prompts.find(prompt => prompt.id === editPromptId)?.title === finalTitle) {
            finalTitle += ' (Copy)';
        }
        const savedId = savePrompt({
            id: asNew ? undefined : editPromptId || undefined,
            title: finalTitle, segments, rating, notes, folderId: folderId || undefined
        });
        if (savedId) {
            setEditPromptId(savedId);
            updateState({ title: finalTitle });
            setStatus(asNew ? 'Saved a new copy to Library.' : 'Prompt saved to Library.');
        }
    };

    const handleCopy = async (text: string, blockId?: string) => {
        setStatus('');
        try {
            await copyText(text);
            if (blockId) {
                setCopiedBlockId(blockId);
                window.setTimeout(() => setCopiedBlockId(null), 2000);
            } else {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
            }
            setStatus(blockId ? 'Block copied.' : 'Prompt copied.');
        } catch {
            setStatus('Copy failed. Select the text and use your device’s Copy option.');
        }
    };

    const resetDrag = () => {
        setDragOverIndex(null);
        setIsDragging(false);
        setDragSourceIndex(null);
    };

    const handleBlockDragStart = (event: DragEvent, blockId: string) => {
        event.dataTransfer.setData('blockId', blockId);
        event.dataTransfer.setData('source', 'sidebar');
        event.dataTransfer.effectAllowed = 'copy';
        setIsDragging(true);
        setDragSourceIndex(null);
    };

    const handleSegmentDragStart = (event: DragEvent, index: number) => {
        event.dataTransfer.setData('segmentIndex', String(index));
        event.dataTransfer.setData('source', 'segment');
        event.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
        setDragSourceIndex(index);
    };

    const handleDrop = (event: DragEvent, dropIndex: number) => {
        event.preventDefault();
        const source = event.dataTransfer.getData('source');
        if (source === 'sidebar') {
            const blockId = event.dataTransfer.getData('blockId');
            dropIntoBuilder({ kind: 'block', id: blockId }, dropIndex);
        } else if (source === 'segment') {
            const fromIndex = Number.parseInt(event.dataTransfer.getData('segmentIndex'), 10);
            dropIntoBuilder({ kind: 'segment', index: fromIndex }, dropIndex);
        }
        setSelection(null);
        resetDrag();
    };

    const getDropPosition = (event: DragEvent<HTMLDivElement>, index: number) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const before = window.matchMedia('(max-width: 800px)').matches
            ? event.clientY < bounds.top + bounds.height / 2
            : event.clientX < bounds.left + bounds.width / 2;
        return before ? index : index + 1;
    };

    return (
        <div className="prompt-builder" onDragEnd={resetDrag}>
            {activeDrag && createPortal(<div className="pointer-drag-preview" aria-hidden="true" style={{ left: activeDrag.x, top: activeDrag.y }}>
                <strong>{activeDrag.label}</strong><span>{activeDrag.target === null ? 'Drag into the prompt editor' : 'Release to place here'}</span>
            </div>, document.body)}
            <aside className="builder-sidebar" aria-label="Available blocks">
                <h2 className="builder-sidebar-title">Available Blocks</h2>
                <button className="builder-blocks-toggle btn btn-secondary" aria-expanded={blocksExpanded} aria-controls="builder-available-blocks" onClick={() => setBlocksExpanded(!blocksExpanded)}>
                    <span>Available Blocks <span className="builder-count">{blocks.length}</span></span>
                    <span>{blocksExpanded ? 'Hide ▴' : 'Show ▾'}</span>
                </button>
                <div id="builder-available-blocks" className={`builder-blocks-panel ${blocksExpanded ? 'is-expanded' : ''}`}>
                    <input aria-label="Search available blocks" type="search" placeholder="Search blocks..." value={searchQuery} onChange={event => setSearchQuery(event.target.value)} />
                    <select aria-label="Sort available blocks" value={sortByBlocks} onChange={event => setSortByBlocks(event.target.value)}>
                        <option value="newest">Newest First</option><option value="oldest">Oldest First</option>
                        <option value="az">A-Z</option><option value="za">Z-A</option><option value="color">By Color</option>
                    </select>
                    <div className="builder-colors" role="group" aria-label="Filter blocks by color">
                        <button className="builder-color-all" aria-label="Show all block colors" aria-pressed={filterColor === null} onClick={() => setFilterColor(null)}>ALL</button>
                        <button className="builder-color" aria-label="Show blocks without a color" aria-pressed={filterColor === 'none'} onClick={() => setFilterColor(filterColor === 'none' ? null : 'none')} title="No color"><span className="builder-color-swatch is-empty" /></button>
                        {PRESET_COLORS.map((color, index) => (
                            <button key={color} className="builder-color" aria-label={`Filter ${COLOR_NAMES[index]} blocks`} title={COLOR_NAMES[index]} aria-pressed={filterColor === color} onClick={() => setFilterColor(filterColor === color ? null : color)}><span className="builder-color-swatch" style={{ backgroundColor: color }} /></button>
                        ))}
                    </div>
                    <p className="builder-hint">Tap a block to add it, or hold its ⠿ handle and drag it into the editor.</p>
                    <div className="builder-block-list">
                        {filteredBlocks.map(block => editingBlockId === block.id ? (
                            <div key={block.id} className="card builder-edit-block">
                                <label htmlFor={`builder-block-name-${block.id}`}>Block name</label>
                                <input id={`builder-block-name-${block.id}`} autoFocus value={editBlockName} onChange={event => setEditBlockName(event.target.value)} />
                                <label htmlFor={`builder-block-content-${block.id}`}>Block content</label>
                                <textarea id={`builder-block-content-${block.id}`} rows={3} value={editBlockContent} onChange={event => setEditBlockContent(event.target.value)} />
                                <div className="builder-colors" role="group" aria-label="Block color">
                                    <button className="builder-color" aria-label="No block color" aria-pressed={!editBlockColor} onClick={() => setEditBlockColor(undefined)}><span className="builder-color-swatch is-empty" /></button>
                                    {PRESET_COLORS.map((color, index) => <button key={color} className="builder-color" aria-label={`${COLOR_NAMES[index]} block color`} aria-pressed={editBlockColor === color} onClick={() => setEditBlockColor(color)}><span className="builder-color-swatch" style={{ backgroundColor: color }} /></button>)}
                                </div>
                                <div className="builder-actions">
                                    <button onClick={() => setEditingBlockId(null)} className="btn btn-secondary">Cancel</button>
                                    <button onClick={() => saveBlockEdit(block.id)} disabled={!editBlockName.trim() || !editBlockContent.trim()} className="btn btn-primary">Save</button>
                                </div>
                            </div>
                        ) : (
                            <div key={block.id} className="card builder-block-card" draggable onDragStart={event => handleBlockDragStart(event, block.id)} style={{ borderLeftColor: block.color || 'var(--primary)', background: block.color ? `${block.color}08` : undefined }}>
                                <button type="button" className="btn-icon pointer-drag-handle" aria-label={`Drag ${block.name} into prompt`} title="Hold and drag into prompt" draggable={false} {...pointerDrag.getHandleProps({ kind: 'block', id: block.id })}>⠿</button>
                                <button className="builder-add-block" onClick={() => addBlockSegment(block.id)} aria-label={`Add ${block.name} to prompt`}>
                                    <span className="builder-block-heading"><span>{block.name}</span>{blockUsageCounts[block.id] ? <span className="builder-count" aria-label={`Used ${blockUsageCounts[block.id]} times`}>{blockUsageCounts[block.id]}</span> : null}</span>
                                    <span className="builder-block-excerpt" title={block.content}>{block.content}</span>
                                </button>
                                <div className="builder-block-actions">
                                    <button className="btn-icon" aria-label={`Copy ${block.name}`} title="Copy content" onClick={() => void handleCopy(block.content, block.id)}>{copiedBlockId === block.id ? '✓' : '📋'}</button>
                                    <button className="btn-icon" aria-label={`Edit ${block.name}`} title="Edit block" onClick={() => startEditingBlock(block)}>✎</button>
                                </div>
                            </div>
                        ))}
                        {filteredBlocks.length === 0 && <p className="builder-hint">{blocks.length === 0 ? 'No blocks yet. Create one in Blocks, or select text in your prompt.' : 'No matching blocks. Try another search or color.'}</p>}
                    </div>
                </div>
            </aside>

            <section className="builder-main" aria-label="Prompt editor">
                <div className="builder-toolbar">
                    <h2>Construct Prompt</h2>
                    <div className="builder-actions">
                        <button onClick={addTextSegment} className="btn btn-secondary">+ Text</button>
                        <button onClick={addNewlineSegment} className="btn btn-secondary" title="Force a new line">↵ Newline</button>
                        <button onClick={handleClearDraft} disabled={!hasDraft} className="btn btn-secondary">Clear Draft</button>
                    </div>
                </div>
                <p className="builder-status" role="status" aria-live="polite">{status}</p>
                {segments.length > 0 && <p className="builder-hint" id="builder-drag-help">Hold ⠿ and drag to reorder. You can also use ↑ ↓.</p>}
                <div ref={segmentsElement} className={`card builder-segments ${dragging ? 'is-dragging' : ''} ${activeDrag?.target !== null && activeDrag ? 'is-valid-drop' : ''}`} onDragOver={event => { event.preventDefault(); setDragOverIndex(segments.length); }} onDrop={event => handleDrop(event, segments.length)}>
                    {segments.length === 0 && <p className="builder-hint">Tap “+ Text” to start, or open Available Blocks and tap a block to add it.</p>}
                    {segments.map((segment, index) => (
                        <div key={index} data-builder-index={index} className={`builder-segment builder-segment-${segment.type} ${activeSourceIndex === index ? 'is-drag-source' : ''} ${dragging && activeDropIndex === index ? 'is-drop-before' : ''} ${dragging && activeDropIndex === index + 1 ? 'is-drop-after' : ''}`}
                            draggable={segment.type !== 'text'} onDragStart={event => { if (segment.type !== 'text') handleSegmentDragStart(event, index); }}
                            onDragOver={event => { event.preventDefault(); event.stopPropagation(); setDragOverIndex(getDropPosition(event, index)); }}
                            onDrop={event => { event.preventDefault(); event.stopPropagation(); handleDrop(event, getDropPosition(event, index)); }}>
                            <div className="builder-segment-content">
                                {segment.type === 'block' ? (() => {
                                    const block = blocks.find(item => item.id === segment.blockId);
                                    return <span className="builder-block-chip" title={block?.content} style={{ background: block?.color ? `${block.color}20` : undefined, color: block?.color, borderColor: block?.color ? `${block.color}40` : undefined }}>{block?.name || 'Unknown block'}</span>;
                                })() : segment.type === 'newline' ? <span className="builder-newline">↵ LINE BREAK</span> : (
                                    <div className="builder-text-editor">
                                        <div className="builder-text-sizer">
                                            <span className="builder-text-mirror" aria-hidden="true">{segment.content + ' '}</span>
                                            <textarea aria-label={`Prompt text ${index + 1}`} value={segment.content} placeholder="Write prompt text..." rows={1} onChange={event => updateTextSegment(index, event.target.value)} onSelect={event => handleTextSelect(index, event)} onPointerUp={event => handleTextSelect(index, event)} onKeyUp={event => handleTextSelect(index, event)} autoFocus={!segment.content} />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="builder-segment-controls" role="group" aria-label={`Item ${index + 1} controls`}>
                                <button type="button" className="btn-icon pointer-drag-handle" aria-label={`Drag item ${index + 1} to reorder`} aria-describedby="builder-drag-help" draggable={false} {...pointerDrag.getHandleProps({ kind: 'segment', index })}>⠿</button>
                                <button className="btn-icon" onClick={() => moveSegment(index, -1)} disabled={index === 0} aria-label={`Move item ${index + 1} up`} title="Move earlier">↑</button>
                                <button className="btn-icon" onClick={() => moveSegment(index, 1)} disabled={index === segments.length - 1} aria-label={`Move item ${index + 1} down`} title="Move later">↓</button>
                                <button className="btn-icon builder-remove-segment" onClick={() => removeSegment(index)} aria-label={`Remove item ${index + 1}`} title="Remove item">×</button>
                            </div>
                            {selection?.index === index && segment.type === 'text' && (
                                <div className="builder-selection-action"><button className="btn btn-primary" onClick={createBlockFromSelection}>+ Create Block from Selection</button></div>
                            )}
                        </div>
                    ))}
                </div>

                <section className="card builder-preview" aria-labelledby="builder-preview-title">
                    <div className="builder-preview-header">
                        <h3 id="builder-preview-title">Real-time Preview</h3>
                        <div className="builder-preview-tools">
                            <span className="builder-hint">{wordCount} words • {preview.length} characters</span>
                            <div className="builder-actions">
                                <button onClick={() => handleSave()} disabled={segments.length === 0} className="btn btn-secondary" title="Quick Save to Library">💾 Save</button>
                                <button onClick={() => void handleCopy(preview)} disabled={!preview} className="btn btn-secondary">{copied ? '✓ Copied' : '📋 Copy'}</button>
                            </div>
                        </div>
                    </div>
                    <div className="builder-preview-text">{preview || <span className="builder-hint">Your assembled prompt will appear here.</span>}</div>
                </section>

                <section className="card builder-save" aria-labelledby="builder-save-title">
                    <h3 id="builder-save-title">Save Configuration</h3>
                    <div className="builder-save-fields">
                        <div><label htmlFor="builder-title">Title</label><input id="builder-title" value={title} onChange={event => updateState({ title: event.target.value })} placeholder="Prompt Title" /></div>
                        <div><label htmlFor="builder-rating">Rating</label><input id="builder-rating" type="number" min="0" max="100" inputMode="numeric" value={rating} onChange={event => updateState({ rating: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} /></div>
                    </div>
                    <div><label htmlFor="builder-notes">Notes</label><textarea id="builder-notes" value={notes} onChange={event => updateState({ notes: event.target.value })} rows={2} /></div>
                    <div className="builder-save-actions">
                        <div className="builder-folder-field"><label htmlFor="builder-folder">Save in folder</label><select id="builder-folder" value={folderId || ''} onChange={event => updateState({ folderId: event.target.value || undefined })}><option value="">No Folder (Root)</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></div>
                        {editPromptId && <button onClick={handleCancel} className="btn btn-secondary">Cancel Edit</button>}
                        <button onClick={() => handleSave()} disabled={segments.length === 0} className="btn btn-primary">{editPromptId ? 'Update Prompt' : 'Save To Library'}</button>
                        {editPromptId && <button onClick={() => handleSave(true)} disabled={segments.length === 0} className="btn btn-secondary">Save As New</button>}
                    </div>
                </section>
            </section>
        </div>
    );
}
