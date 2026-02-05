import { useState, useMemo } from 'react';
import { useStore } from '../store';
import { PRESET_COLORS } from '../types';

export function PromptBuilder() {
    const { blocks, prompts, savePrompt, editPromptId, setEditPromptId, addBlock, builderState, setBuilderState, updateBlock, folders } = useStore();


    // Helper to update partial state
    const updateState = (updates: Partial<typeof builderState>) => {
        setBuilderState((prev: any) => ({ ...prev, ...updates }));
    };

    const segments = builderState.segments;
    const title = builderState.title;
    const notes = builderState.notes;
    const rating = builderState.rating;
    const folderId = builderState.folderId;

    // Copy feedback state
    const [copied, setCopied] = useState(false);

    // Load prompt for editing if selected from somewhere (optional future feature)
    // For now, we'll just stick to creation/editing flow within this component

    // Check if we are editing an existing prompt

    // We need to know if we are editing.
    // Let's add a way to select a prompt to edit from the Library, OR
    // since the user asked to "edit existing prompts", let's assume we might receive an ID or selection state.
    // For this step, I'll focus on the Builder UI supporting segments first.

    const [selection, setSelection] = useState<{ index: number; start: number; end: number; text: string } | null>(null);

    // Block editing state
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const [editBlockName, setEditBlockName] = useState('');
    const [editBlockContent, setEditBlockContent] = useState('');
    const [editBlockColor, setEditBlockColor] = useState<string | undefined>(undefined);


    // Block filter/sort state
    const [searchQuery, setSearchQuery] = useState('');
    const [filterColor, setFilterColor] = useState<string | 'none' | null>(null);
    const [sortByBlocks, setSortByBlocks] = useState<'newest' | 'oldest' | 'az' | 'za' | 'color'>('newest');
    const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);

    // Calculate usage counts for blocks in the current prompt
    const blockUsageCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        if (segments) {
            segments.forEach((seg: any) => {
                if (seg.type === 'block' && seg.blockId) {
                    counts[seg.blockId] = (counts[seg.blockId] || 0) + 1;
                }
            });
        }
        return counts;
    }, [segments]);

    // Filtered and Sorted blocks
    const filteredBlocks = useMemo(() => {
        return blocks
            .filter(block => {
                const matchesSearch = !searchQuery ||
                    block.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    block.content.toLowerCase().includes(searchQuery.toLowerCase());

                let matchesColor = true;
                if (filterColor === 'none') {
                    matchesColor = !block.color;
                } else if (filterColor) {
                    matchesColor = block.color === filterColor;
                }
                return matchesSearch && matchesColor;
            })
            .sort((a, b) => {
                if (sortByBlocks === 'newest') return b.createdAt - a.createdAt;
                if (sortByBlocks === 'oldest') return a.createdAt - b.createdAt;
                if (sortByBlocks === 'az') return a.name.localeCompare(b.name);
                if (sortByBlocks === 'za') return b.name.localeCompare(a.name);
                if (sortByBlocks === 'color') return (a.color || '').localeCompare(b.color || '');
                return 0;
            });
    }, [blocks, searchQuery, filterColor, sortByBlocks]);

    const startEditingBlock = (block: any) => {
        setEditingBlockId(block.id);
        setEditBlockName(block.name);
        setEditBlockContent(block.content);
        setEditBlockColor(block.color);
    };


    const saveBlockEdit = (id: string) => {
        if (!editBlockName.trim() || !editBlockContent.trim()) return;
        updateBlock(id, {
            name: editBlockName,
            content: editBlockContent,
            color: editBlockColor
        });
        setEditingBlockId(null);
    };


    // Hydrate form when editing
    // Removed to allow persistence: Hydration now happens in App.tsx handleEdit
    // useEffect(() => { ... }, [editPromptId, prompts]);

    const handleTextSelect = (index: number, e: React.SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        const target = e.target as HTMLTextAreaElement | HTMLInputElement;
        const start = target.selectionStart;
        const end = target.selectionEnd;

        if (start !== null && end !== null && start !== end) {
            const text = target.value.substring(start, end);
            setSelection({ index, start, end, text });
        } else {
            setSelection(null);
        }
    };

    const createBlockFromSelection = () => {
        if (!selection) return;

        const name = prompt('Name for this new block:', selection.text);
        if (!name) return;

        // Create the block
        const newBlockId = addBlock({ name, content: selection.text });

        // Split the segment
        const newSegments = [...segments];
        const targetSeg = newSegments[selection.index];
        if (targetSeg.type !== 'text') return; // Should be text

        const originalText = targetSeg.content;
        const preText = originalText.substring(0, selection.start);
        const postText = originalText.substring(selection.end);

        const replacement: any[] = [];
        if (preText) replacement.push({ type: 'text', content: preText });
        replacement.push({ type: 'block', blockId: newBlockId });
        if (postText) replacement.push({ type: 'text', content: postText });

        newSegments.splice(selection.index, 1, ...replacement);

        updateState({ segments: newSegments });

        setSelection(null);
    };

    const preview = useMemo(() => {
        let result = "";
        segments.forEach((seg, i) => {
            let content = "";
            if (seg.type === 'block') content = blocks.find(b => b.id === seg.blockId)?.content || '';
            else if (seg.type === 'newline') content = '\n';
            else content = seg.content;

            // Add space between non-newline segments
            if (i > 0 && segments[i - 1].type !== 'newline' && seg.type !== 'newline') {
                result += " ";
            }
            result += content;
        });
        return result;
    }, [segments, blocks]);

    const wordCount = useMemo(() => {
        return preview.trim().split(/\s+/).filter(w => w.length > 0).length;
    }, [preview]);

    const charCount = preview.length;


    const addBlockSegment = (blockId: string) => {
        updateState({ segments: [...segments, { type: 'block', blockId }] });
    };

    const addTextSegment = () => {
        updateState({ segments: [...segments, { type: 'text', content: '' }] });
    };

    const addNewlineSegment = () => {
        updateState({ segments: [...segments, { type: 'newline' }] });
    };

    const removeSegment = (index: number) => {
        updateState({ segments: segments.filter((_: any, i: number) => i !== index) });
    };

    const updateTextSegment = (index: number, content: string) => {
        updateState({ segments: segments.map((s: any, i: number) => i === index && s.type === 'text' ? { ...s, content } : s) });
    };

    const handleCancel = () => {
        setEditPromptId(null);
        updateState({
            title: '',
            segments: [],
            rating: 0,
            notes: ''
        });
    };

    const handleSave = () => {
        if (segments.length === 0) return;

        let finalTitle = title.trim();
        if (!finalTitle) {
            const now = new Date();
            const dateStr = now.toLocaleDateString();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            finalTitle = `${dateStr} ${timeStr}`;
        }

        const savedId = savePrompt({
            id: editPromptId || undefined,
            title: finalTitle,
            segments,
            rating,
            notes,
            folderId: folderId || undefined
        });

        if (savedId) {
            setEditPromptId(savedId);
            updateState({ title: finalTitle });
        }
    };

    const handleSaveAs = () => {
        if (segments.length === 0) return;

        let finalTitle = title.trim();
        if (!finalTitle) {
            const now = new Date();
            const dateStr = now.toLocaleDateString();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            finalTitle = `${dateStr} ${timeStr}`;
        } else {
            // Only append " (Copy)" if it's the same as the original title
            const originalPrompt = prompts.find(p => p.id === editPromptId);
            if (originalPrompt && finalTitle === originalPrompt.title) {
                finalTitle = `${finalTitle} (Copy)`;
            }
        }

        const savedId = savePrompt({
            id: undefined, // Force new ID
            title: finalTitle,
            segments,
            rating,
            notes,
            folderId: folderId || undefined
        });

        if (savedId) {
            setEditPromptId(savedId);
            updateState({ title: finalTitle });
        }
    };

    const handleClear = () => {
        // If nothing to clear, do nothing
        if (segments.length === 0 && !title && !notes) return;

        let isDirty = false;

        if (editPromptId) {
            const original = prompts.find(p => p.id === editPromptId);
            if (original) {
                // Check if current state differs from original
                const hasChanges =
                    title !== original.title ||
                    notes !== original.notes ||
                    JSON.stringify(segments) !== JSON.stringify(original.segments);

                if (hasChanges) isDirty = true;
            }
        } else {
            // If new and has content
            if (segments.length > 0 || title || notes) isDirty = true;
        }

        if (isDirty) {
            if (window.confirm('Clear unsaved changes?')) {
                handleCancel();
            }
        } else {
            handleCancel();
        }
    };

    // DnD State
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);

    // Drag from sidebar (new block)
    const handleBlockDragStart = (e: React.DragEvent, blockId: string) => {
        e.dataTransfer.setData('blockId', blockId);
        e.dataTransfer.setData('source', 'sidebar');
        e.dataTransfer.effectAllowed = 'copy';
        setIsDragging(true);
        setDragSourceIndex(null);
    };

    // Drag existing segment (reorder)
    const handleSegmentDragStart = (e: React.DragEvent, index: number) => {
        e.dataTransfer.setData('segmentIndex', String(index));
        e.dataTransfer.setData('source', 'segment');
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
        setDragSourceIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        const source = e.dataTransfer.getData('source');

        if (source === 'sidebar') {
            // Adding new block from sidebar
            const blockId = e.dataTransfer.getData('blockId');
            if (blockId) {
                const newSegments = [...segments];
                newSegments.splice(dropIndex, 0, { type: 'block', blockId });
                updateState({ segments: newSegments });
            }
        } else if (source === 'segment') {
            // Reordering existing segment
            const fromIndex = parseInt(e.dataTransfer.getData('segmentIndex'), 10);
            if (!isNaN(fromIndex) && fromIndex !== dropIndex) {
                const newSegments = [...segments];
                const [movedItem] = newSegments.splice(fromIndex, 1);
                // Adjust drop index if moving forward
                const adjustedIndex = fromIndex < dropIndex ? dropIndex - 1 : dropIndex;
                newSegments.splice(adjustedIndex, 0, movedItem);
                updateState({ segments: newSegments });
            }
        }

        setDragOverIndex(null);
        setIsDragging(false);
        setDragSourceIndex(null);
    };


    return (
        <div className="builder-layout"
            onDragEnd={() => { setDragOverIndex(null); setIsDragging(false); setDragSourceIndex(null); }}
        >
            {/* Sidebar: Available Blocks */}
            <div className="builder-sidebar">
                <h2 className="text-lg">Available Blocks</h2>

                {/* Search */}
                <input
                    type="text"
                    placeholder="Search blocks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        padding: '0.5rem',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '0.85rem'
                    }}
                />

                {/* Sort Dropdown */}
                <select
                    value={sortByBlocks}
                    onChange={(e) => setSortByBlocks(e.target.value as any)}
                    style={{
                        width: '100%',
                        padding: '0.4rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        fontSize: '0.8rem',
                        background: 'var(--bg-app)'
                    }}
                >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="az">A-Z</option>
                    <option value="za">Z-A</option>
                    <option value="color">By Color</option>
                </select>

                {/* Color Filter */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                    <button
                        onClick={() => setFilterColor(null)}
                        style={{
                            width: '28px',
                            height: '20px',
                            borderRadius: '4px',
                            border: filterColor === null ? '2px solid var(--primary)' : '1px solid var(--border)',
                            background: filterColor === null ? 'var(--primary-bg)' : 'white',
                            color: filterColor === null ? 'var(--primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        title="All"
                    >ALL</button>

                    <button
                        onClick={() => setFilterColor(filterColor === 'none' ? null : 'none')}
                        style={{
                            width: '20px',
                            height: '20px',
                            border: filterColor === 'none' ? '2px solid var(--text-main)' : '1px solid var(--border)',
                            borderRadius: '50%',
                            background: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                        title="No color"
                    >
                        <div style={{
                            position: 'absolute',
                            width: '100%',
                            height: '1.2px',
                            background: 'var(--text-muted)',
                            transform: 'rotate(-45deg)',
                            opacity: 0.6
                        }} />
                    </button>
                    {PRESET_COLORS.map(color => (
                        <button
                            key={color}
                            onClick={() => setFilterColor(filterColor === color ? null : color)}
                            style={{
                                width: '20px',
                                height: '20px',
                                border: filterColor === color ? '2px solid var(--text-main)' : '2px solid transparent',
                                borderRadius: '50%',
                                background: color,
                                cursor: 'pointer',
                                transition: 'transform 0.2s',
                                transform: filterColor === color ? 'scale(1.1)' : 'scale(1)'
                            }}
                        />
                    ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {filteredBlocks.map(block => (
                        <div key={block.id} style={{ position: 'relative' }}>
                            {editingBlockId === block.id ? (
                                <div className="card" style={{ padding: '0.75rem', border: '1px solid var(--primary)' }}>
                                    {/* ... existing edit inputs ... */}
                                    <input
                                        autoFocus
                                        value={editBlockName}
                                        onChange={e => setEditBlockName(e.target.value)}
                                        placeholder="Block Name"
                                        style={{ width: '100%', marginBottom: '0.5rem', fontWeight: 600 }}
                                    />
                                    <textarea
                                        value={editBlockContent}
                                        onChange={e => setEditBlockContent(e.target.value)}
                                        placeholder="Block Content"
                                        rows={3}
                                        style={{ width: '100%', marginBottom: '0.75rem', fontSize: '0.85rem' }}
                                    />
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => setEditBlockColor(undefined)}
                                                style={{
                                                    width: '20px',
                                                    height: '20px',
                                                    border: !editBlockColor ? '2px solid var(--primary)' : '1px solid var(--border)',
                                                    borderRadius: '50%',
                                                    background: 'white',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    position: 'relative',
                                                    overflow: 'hidden'
                                                }}
                                                title="No color"
                                            >
                                                <div style={{
                                                    position: 'absolute',
                                                    width: '100%',
                                                    height: '1.2px',
                                                    background: 'var(--text-muted)',
                                                    transform: 'rotate(-45deg)',
                                                    opacity: 0.6
                                                }} />
                                            </button>
                                            {PRESET_COLORS.map(c => (
                                                <button
                                                    type="button"
                                                    key={c}
                                                    onClick={() => setEditBlockColor(c)}
                                                    style={{
                                                        width: '20px',
                                                        height: '20px',
                                                        border: editBlockColor === c ? '2px solid var(--text-main)' : '2px solid transparent',
                                                        borderRadius: '50%',
                                                        background: c,
                                                        cursor: 'pointer'
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                        <button onClick={() => setEditingBlockId(null)} className="btn btn-sm btn-secondary">Cancel</button>
                                        <button onClick={() => saveBlockEdit(block.id)} className="btn btn-sm btn-primary">Save</button>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className="card hover-trigger"
                                    draggable
                                    onDragStart={(e) => handleBlockDragStart(e, block.id)}
                                    style={{
                                        padding: '0.5rem 0.75rem',
                                        cursor: 'grab',
                                        borderLeft: `3px solid ${block.color || 'var(--primary)'}`,
                                        background: block.color ? `${block.color}08` : undefined,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div onClick={() => addBlockSegment(block.id)} style={{ flex: 1, minWidth: 0, paddingRight: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '2px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                {block.color && (
                                                    <div style={{
                                                        width: '8px',
                                                        height: '8px',
                                                        borderRadius: '50%',
                                                        background: block.color,
                                                        flexShrink: 0
                                                    }} />
                                                )}
                                                <span style={{ fontWeight: 500, fontSize: '0.9rem', lineHeight: '1.3' }}>{block.name}</span>
                                            </div>
                                            {blockUsageCounts[block.id] ? (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    background: 'var(--primary)',
                                                    color: 'white',
                                                    padding: '1px 6px',
                                                    borderRadius: '99px',
                                                    fontWeight: 600,
                                                    lineHeight: '1.2',
                                                    whiteSpace: 'nowrap',
                                                    flexShrink: 0,
                                                    alignSelf: 'flex-start',
                                                    marginTop: '2px'
                                                }} title={`Used ${blockUsageCounts[block.id]} time(s)`}>
                                                    {blockUsageCounts[block.id]}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div
                                            title={block.content}
                                            style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--text-secondary)',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}
                                        >
                                            {block.content}
                                        </div>
                                    </div>
                                    <div className="actions" style={{ display: 'flex', gap: '0.25rem', opacity: 0.6 }}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(block.content);
                                                setCopiedBlockId(block.id);
                                                setTimeout(() => setCopiedBlockId(null), 2000);
                                            }}
                                            className="btn-icon"
                                            title="Copy content"
                                            style={{ color: copiedBlockId === block.id ? 'var(--success)' : 'inherit', padding: '4px' }}
                                        >
                                            {copiedBlockId === block.id ? '✓' : '📋'}
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startEditingBlock(block);
                                            }}
                                            className="btn-icon"
                                            style={{ opacity: 0.5, padding: '4px' }}
                                            title="Edit Block"
                                        >
                                            ✎
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {blocks.length === 0 && (
                        <p className="text-muted text-sm">No blocks. Create some first.</p>
                    )}
                </div>
            </div>

            {/* Main Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', paddingRight: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>Construct Prompt</h2>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={handleClear}
                            className="btn btn-secondary"
                            title="Clear all"
                            style={{
                                color: 'var(--danger)',
                                borderColor: 'var(--danger)',
                                opacity: segments.length === 0 ? 0.5 : 1
                            }}
                        >
                            Clear
                        </button>
                        <button onClick={addTextSegment} className="btn btn-secondary">+ Text</button>
                        <button onClick={addNewlineSegment} className="btn btn-secondary" title="Force a new line">↵ Newline</button>
                    </div>
                </div>

                {/* Segments Input Area */}
                <div
                    className="card"
                    onDragOver={(e) => handleDragOver(e, segments.length)} // Default drop at end
                    onDrop={(e) => handleDrop(e, segments.length)}
                    style={{
                        padding: '1.5rem',
                        border: '1px solid var(--border)',
                        minHeight: '120px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignContent: 'flex-start',
                        gap: '0.5rem',
                        position: 'relative',
                        background: isDragging ? '#f0f9ff' : 'white',
                        transition: 'background 0.2s'
                    }}>
                    {segments.length === 0 && (
                        <div style={{ color: 'var(--text-muted)', width: '100%', userSelect: 'none', pointerEvents: 'none' }}>
                            Drag blocks here or click "Add Custom Text"...
                        </div>
                    )}

                    {segments.map((seg: any, index: number) => (
                        <div
                            key={index}
                            draggable={seg.type !== 'text'} // Allow dragging newlines too
                            onDragStart={(e) => {
                                if (seg.type !== 'text') {
                                    handleSegmentDragStart(e, index);
                                }
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                const midpoint = rect.left + rect.width / 2;
                                const dropPosition = e.clientX < midpoint ? index : index + 1;
                                setDragOverIndex(dropPosition);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                const midpoint = rect.left + rect.width / 2;
                                const dropPosition = e.clientX < midpoint ? index : index + 1;
                                handleDrop(e, dropPosition);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                position: 'relative',
                                cursor: 'grab',
                                opacity: dragSourceIndex === index ? 0.5 : 1,
                                paddingLeft: isDragging ? '8px' : '0',
                                paddingRight: isDragging ? '8px' : '0',
                                transition: 'padding 0.15s ease',
                                width: seg.type === 'newline' ? '100%' : 'auto',
                                height: seg.type === 'newline' ? '12px' : 'auto',
                                margin: seg.type === 'newline' ? '4px 0' : '0'
                            }}
                        >
                            {/* Drop Indicator - Left side */}
                            {isDragging && dragOverIndex === index && (
                                <div style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: '3px',
                                    height: '28px',
                                    background: 'var(--primary)',
                                    borderRadius: '2px',
                                    boxShadow: '0 0 6px var(--primary)'
                                }} />
                            )}

                            {/* The Segment Itself */}
                            {seg.type === 'block' ? (() => {
                                const block = blocks.find(b => b.id === seg.blockId);
                                const blockColor = block?.color;
                                return (
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        background: blockColor ? `${blockColor}20` : '#e0e7ff',
                                        color: blockColor || '#4338ca',
                                        padding: '4px 12px',
                                        borderRadius: '999px',
                                        fontSize: '0.9rem',
                                        fontWeight: 500,
                                        border: `1px solid ${blockColor ? `${blockColor}40` : '#c7d2fe'}`,
                                        userSelect: 'none',
                                        animation: 'fadeIn 0.2s ease-out'
                                    }} title={block?.content}>
                                        {block?.name || 'Unknown'}
                                        <button
                                            onClick={() => removeSegment(index)}
                                            style={{
                                                marginLeft: '6px',
                                                border: 'none',
                                                background: 'transparent',
                                                color: 'currentColor',
                                                cursor: 'pointer',
                                                fontSize: '1em',
                                                lineHeight: 1,
                                                padding: 0,
                                                opacity: 0.6
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                                        >
                                            ×
                                        </button>
                                    </span>
                                );
                            })() : seg.type === 'newline' ? (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    color: '#94a3b8',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    userSelect: 'none',
                                    width: '100%',
                                    borderBottom: '1px dashed #e2e8f0',
                                    padding: '4px 0'
                                }}>
                                    <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>↵ LINE BREAK</span>
                                    <button
                                        onClick={() => removeSegment(index)}
                                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.5 }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                                    {/* Drag Handle for text segments */}
                                    <div
                                        draggable
                                        onDragStart={(e) => {
                                            e.stopPropagation();
                                            handleSegmentDragStart(e, index);
                                        }}
                                        style={{
                                            cursor: 'grab',
                                            padding: '4px 4px 4px 0',
                                            color: '#94a3b8',
                                            fontSize: '0.8rem',
                                            userSelect: 'none',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                        title="Drag to reorder"
                                    >
                                        ⋮⋮
                                    </div>
                                    <div style={{
                                        display: 'inline-grid',
                                        verticalAlign: 'middle',
                                        alignItems: 'center',
                                        maxWidth: '100%',
                                        minWidth: '50px'
                                    }}>
                                        <div style={{
                                            gridArea: '1/1',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                            padding: '4px 8px',
                                            fontSize: '0.9rem',
                                            fontFamily: 'inherit',
                                            lineHeight: '1.4',
                                            visibility: 'hidden',
                                            pointerEvents: 'none'
                                        }}>
                                            {seg.content + ' '}
                                        </div>
                                        <textarea
                                            value={seg.content}
                                            onChange={(e) => updateTextSegment(index, e.target.value)}
                                            onSelect={(e) => handleTextSelect(index, e)}
                                            placeholder="text..."
                                            rows={1}
                                            style={{
                                                gridArea: '1/1',
                                                border: 'none',
                                                borderBottom: '2px solid #cbd5e1',
                                                outline: 'none',
                                                padding: '4px 8px',
                                                fontSize: '0.9rem',
                                                background: 'transparent',
                                                color: 'var(--text-main)',
                                                resize: 'none',
                                                overflow: 'hidden',
                                                width: '100%',
                                                height: '100%',
                                                minWidth: '0',
                                                fontFamily: 'inherit',
                                                lineHeight: '1.4',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                boxSizing: 'border-box'
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                                            onBlur={(e) => {
                                                e.target.style.borderColor = '#cbd5e1';
                                                setTimeout(() => setSelection(null), 200);
                                            }}
                                            autoFocus={!seg.content}
                                        />
                                    </div>
                                    {selection && selection.index === index && (
                                        <button
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                createBlockFromSelection();
                                            }}
                                            style={{
                                                position: 'absolute',
                                                top: '-30px',
                                                left: '0',
                                                background: 'var(--primary)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                padding: '4px 8px',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                zIndex: 100,
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            + Create Block
                                        </button>
                                    )}
                                    <button
                                        onClick={() => removeSegment(index)}
                                        style={{
                                            background: '#f1f5f9',
                                            color: '#94a3b8',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                            borderRadius: '50%',
                                            width: '16px',
                                            height: '16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginLeft: '4px'
                                        }}
                                        title="Remove text"
                                    >
                                        ×
                                    </button>
                                </div>
                            )}

                            {/* Drop Indicator - Right side (for dropping after this segment) */}
                            {isDragging && dragOverIndex === index + 1 && (
                                <div style={{
                                    position: 'absolute',
                                    right: 0,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: '3px',
                                    height: '28px',
                                    background: 'var(--primary)',
                                    borderRadius: '2px',
                                    boxShadow: '0 0 6px var(--primary)'
                                }} />
                            )}
                        </div>
                    ))}
                </div>

                <div className="card" style={{ padding: '1.5rem', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                        <h3 className="text-sm text-muted" style={{ margin: 0, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Real-time Preview</h3>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                {wordCount} words • {charCount} characters
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', background: 'white', padding: '0.2rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                <button
                                    onClick={handleSave}
                                    disabled={segments.length === 0}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '1.1rem',
                                        padding: '0.2rem 0.4rem',
                                        borderRadius: '4px',
                                        transition: 'all 0.2s',
                                        opacity: segments.length === 0 ? 0.3 : 1
                                    }}
                                    className="hover-trigger"
                                    title="Quick Save to Library"
                                >
                                    💾
                                </button>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(preview);
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 1500);
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '1.1rem',
                                        color: copied ? 'var(--success)' : 'inherit',
                                        padding: '0.2rem 0.4rem',
                                        borderRadius: '4px',
                                        transition: 'all 0.2s'
                                    }}
                                    className="hover-trigger"
                                    title="Copy to clipboard"
                                >
                                    {copied ? '✓' : '📋'}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div style={{
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        color: 'var(--text-main)',
                        lineHeight: '1.6'
                    }}>
                        {preview}
                    </div>
                </div>

                <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <h3 className="mb-4">Save Configuration</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '1rem' }}>
                        <div>
                            <label>Title</label>
                            <input value={title} onChange={e => updateState({ title: e.target.value })} placeholder="Prompt Title" />
                        </div>
                        <div>
                            <label>Rating</label>
                            <input type="number" min="0" max="100" value={rating} onChange={e => updateState({ rating: Number(e.target.value) })} />
                        </div>
                    </div>
                    <div>
                        <label>Notes</label>
                        <textarea value={notes} onChange={e => updateState({ notes: e.target.value })} rows={2} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        <select
                            value={folderId || ''}
                            onChange={e => updateState({ folderId: e.target.value || undefined })}
                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                        >
                            <option value="">No Folder (Root)</option>
                            {folders.map((f: any) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                        {editPromptId && (
                            <button onClick={handleCancel} className="btn btn-secondary">
                                Cancel Edit
                            </button>
                        )}
                        <button onClick={handleSave} disabled={segments.length === 0} className="btn btn-primary">
                            {editPromptId ? 'Update Prompt' : 'Save To Library'}
                        </button>
                        {editPromptId && (
                            <button onClick={handleSaveAs} disabled={segments.length === 0} className="btn btn-secondary">
                                Save As New
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
