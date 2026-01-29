import { useState } from 'react';
import { useStore } from '../store';
import { PRESET_COLORS, PRESET_ICONS } from '../types';
import type { Folder } from '../types';

export function PromptLibrary({ onEdit }: { onEdit: (id: string) => void }) {
    const { prompts, deletePrompt, folders, deleteFolder, savePrompt, addFolder, updateFolder, blocks, reorderPrompts, expandedIds, setExpandedIds, currentFolderId, setCurrentFolderId } = useStore();
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az' | 'za' | 'custom'>('custom');

    // Search/Filter State
    const [searchTerm, setSearchTerm] = useState('');


    // DnD State for Prompts
    const [dragOverPromptId, setDragOverPromptId] = useState<string | null>(null);
    const [dropSide, setDropSide] = useState<'before' | 'after' | null>(null);
    const [isDraggingPrompt, setIsDraggingPrompt] = useState(false);

    // Folder edit modal state
    const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
    const [editFolderName, setEditFolderName] = useState('');
    const [editFolderIcon, setEditFolderIcon] = useState('📁');
    const [editFolderColor, setEditFolderColor] = useState<string | undefined>(undefined);

    // Copy feedback state
    const [copiedId, setCopiedId] = useState<string | null>(null);



    const getFullContent = (segments: any[]) => {
        let result = "";
        segments.forEach((seg, i) => {
            let content = "";
            if (seg.type === 'block') content = blocks.find(b => b.id === seg.blockId)?.content || '';
            else if (seg.type === 'newline') content = '\n';
            else content = seg.content;

            if (i > 0 && segments[i - 1].type !== 'newline' && seg.type !== 'newline') {
                result += " ";
            }
            result += content;
        });
        return result;
    };

    const getWordCount = (text: string) => {
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    };

    const getCompositionSummary = (segments: any[]) => {
        const text = getFullContent(segments);
        const words = getWordCount(text);
        const chars = text.length;
        const blockCount = segments.filter(s => s.type === 'block').length;
        return `${blockCount} blocks • ${words} words • ${chars} chars`;
    };

    const copyToClipboard = (text: string, promptId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(promptId);
        setTimeout(() => setCopiedId(null), 1500);
    };

    // Sort folders by position
    const sortedFolders = [...folders].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    // Filter AND Sort prompts
    const filteredFolders = sortedFolders.filter(f => {
        return f.name.toLowerCase().includes(searchTerm.toLowerCase());
    });

    // Filter AND Sort prompts
    const filteredPrompts = prompts
        .filter(p => {
            const sameFolder = currentFolderId ? p.folderId === currentFolderId : !p.folderId;
            const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                getFullContent(p.segments).toLowerCase().includes(searchTerm.toLowerCase());

            // In root view, if searching, show all matches. Otherwise show root prompts.
            // When inside a folder, show folder prompts.
            if (searchTerm) return matchesSearch;
            return sameFolder;
        })
        .sort((a, b) => {
            if (sortBy === 'newest') return b.createdAt - a.createdAt;
            if (sortBy === 'oldest') return a.createdAt - b.createdAt;
            if (sortBy === 'az') return a.title.localeCompare(b.title);
            if (sortBy === 'za') return b.title.localeCompare(a.title);
            if (sortBy === 'custom') return (a.position ?? 0) - (b.position ?? 0);
            return 0;
        });

    const movePrompt = (prompt: any, targetFolderId: string | undefined) => {
        savePrompt({ ...prompt, folderId: targetFolderId });
    };

    const handleDropOnFolder = (e: React.DragEvent, folderId: string) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).style.background = '';
        const promptId = e.dataTransfer.getData('promptId');
        if (promptId) {
            const prompt = prompts.find(p => p.id === promptId);
            if (prompt) movePrompt(prompt, folderId);
        }
    };

    const handlePromptDragStart = (e: React.DragEvent, promptId: string) => {
        e.dataTransfer.setData('promptId', promptId);
        e.dataTransfer.effectAllowed = 'move';
        setIsDraggingPrompt(true);
    };

    const handlePromptDragOver = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (sortBy !== 'custom') return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        const side = e.clientX < midpoint ? 'before' : 'after';

        setDragOverPromptId(targetId);
        setDropSide(side);
    };

    const handlePromptDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        setIsDraggingPrompt(false);
        setDragOverPromptId(null);
        setDropSide(null);

        if (sortBy !== 'custom') return;

        const draggedId = e.dataTransfer.getData('promptId');
        if (!draggedId || draggedId === targetId) return;

        const currentPrompts = [...prompts];
        const draggedIdx = currentPrompts.findIndex(p => p.id === draggedId);
        const targetIdx = currentPrompts.findIndex(p => p.id === targetId);

        if (draggedIdx === -1 || targetIdx === -1) return;

        const [draggedPrompt] = currentPrompts.splice(draggedIdx, 1);

        // Calculate new index
        let newIdx = currentPrompts.findIndex(p => p.id === targetId);
        if (dropSide === 'after') newIdx += 1;

        currentPrompts.splice(newIdx, 0, draggedPrompt);

        // Re-assign positions for all prompts in this context (folder or root)
        const updatedPrompts = currentPrompts.map((p, i) => ({ ...p, position: i }));
        reorderPrompts(updatedPrompts);
    };


    const openEditFolder = (folder: Folder) => {
        setEditingFolder(folder);
        setEditFolderName(folder.name);
        setEditFolderIcon(folder.icon || '📁');
        setEditFolderColor(folder.color);
    };

    const saveEditFolder = () => {
        if (editingFolder && editFolderName.trim()) {
            updateFolder(editingFolder.id, {
                name: editFolderName.trim(),
                icon: editFolderIcon,
                color: editFolderColor
            });
            setEditingFolder(null);
        }
    };

    const moveFolderUp = (folder: Folder) => {
        const idx = sortedFolders.findIndex(f => f.id === folder.id);
        if (idx > 0) {
            const prevFolder = sortedFolders[idx - 1];
            updateFolder(folder.id, { position: (prevFolder.position ?? 0) });
            updateFolder(prevFolder.id, { position: (folder.position ?? 0) });
        }
    };

    const moveFolderDown = (folder: Folder) => {
        const idx = sortedFolders.findIndex(f => f.id === folder.id);
        if (idx < sortedFolders.length - 1) {
            const nextFolder = sortedFolders[idx + 1];
            updateFolder(folder.id, { position: (nextFolder.position ?? 0) });
            updateFolder(nextFolder.id, { position: (folder.position ?? 0) });
        }
    };

    const toggleAllDetails = () => {
        // If all currently filtered prompts are open, close them. Otherwise open them.
        const allVisibleIds = filteredPrompts.map(p => p.id);
        const allOpen = allVisibleIds.every(id => expandedIds.has(id));

        if (allOpen) {
            setExpandedIds(new Set());
        } else {
            setExpandedIds(new Set(allVisibleIds));
        }
    };

    const handleApplySortToCustom = () => {
        if (sortBy === 'custom') return;
        if (!confirm(`Apply "${sortBy}" order as the new manual sort?`)) return;

        // Sort EVERYTHING in the store by the current criteria
        const allSorted = [...prompts].sort((a, b) => {
            if (sortBy === 'newest') return b.createdAt - a.createdAt;
            if (sortBy === 'oldest') return a.createdAt - b.createdAt;
            if (sortBy === 'az') return a.title.localeCompare(b.title);
            if (sortBy === 'za') return b.title.localeCompare(a.title);
            return 0;
        });

        const updated = allSorted.map((p, i) => ({ ...p, position: i }));
        reorderPrompts(updated);
        setSortBy('custom');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Edit Folder Modal */}
            {editingFolder && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }} onClick={() => setEditingFolder(null)}>
                    <div
                        className="card"
                        style={{ padding: '1.5rem', minWidth: '320px', maxWidth: '400px' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 style={{ marginBottom: '1rem' }}>Edit Folder</h3>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Name</label>
                            <input
                                value={editFolderName}
                                onChange={e => setEditFolderName(e.target.value)}
                                style={{ width: '100%' }}
                                autoFocus
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Icon</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {PRESET_ICONS.map(icon => (
                                    <button
                                        key={icon}
                                        onClick={() => setEditFolderIcon(icon)}
                                        style={{
                                            width: '36px',
                                            height: '36px',
                                            fontSize: '1.2rem',
                                            border: editFolderIcon === icon ? '2px solid var(--primary)' : '1px solid var(--border)',
                                            borderRadius: '6px',
                                            background: editFolderIcon === icon ? '#e0e7ff' : 'white',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {icon}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Color</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <button
                                    onClick={() => setEditFolderColor(undefined)}
                                    style={{
                                        width: '28px',
                                        height: '28px',
                                        border: !editFolderColor ? '2px solid var(--primary)' : '1px solid var(--border)',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #fff 45%, #ccc 55%)',
                                        cursor: 'pointer'
                                    }}
                                    title="No color"
                                />
                                {PRESET_COLORS.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => setEditFolderColor(color)}
                                        style={{
                                            width: '28px',
                                            height: '28px',
                                            border: editFolderColor === color ? '2px solid var(--text-main)' : '2px solid transparent',
                                            borderRadius: '50%',
                                            background: color,
                                            cursor: 'pointer'
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setEditingFolder(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveEditFolder}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {currentFolderId ? (
                        <>
                            <button onClick={() => setCurrentFolderId(null)} className="btn-icon">←</button>
                            <span style={{ fontSize: '1.2rem' }}>{folders.find(f => f.id === currentFolderId)?.icon || '📁'}</span>
                            <h2 style={{ margin: 0 }}>{folders.find(f => f.id === currentFolderId)?.name}</h2>
                        </>
                    ) : (
                        <h2 style={{ margin: 0 }}>Prompt Library</h2>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                    >
                        <option value="newest">Time: Newest First</option>
                        <option value="oldest">Time: Oldest First</option>
                        <option value="az">Name: A-Z</option>
                        <option value="za">Name: Z-A</option>
                        <option value="custom">Manual: Custom Sort</option>
                    </select>

                    {sortBy !== 'custom' && (
                        <button
                            className="btn btn-secondary"
                            onClick={handleApplySortToCustom}
                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                            title="Apply this sorting to the Manual/Custom order"
                        >
                            Apply to Manual
                        </button>
                    )}

                    <button
                        className="btn btn-secondary"
                        onClick={toggleAllDetails}
                        title="Toggle all details"
                    >
                        {filteredPrompts.length > 0 && filteredPrompts.every(p => expandedIds.has(p.id)) ? 'Collapse All' : 'Expand All'}
                    </button>

                    <button
                        className="btn btn-secondary"
                        onClick={() => {
                            const name = prompt('Folder Name:');
                            if (name) addFolder(name);
                        }}
                    >
                        + New Folder
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', background: 'white', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <input
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search prompts & folders..."
                        style={{ width: '100%' }}
                    />
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                {/* Folders Section */}
                {(!currentFolderId || searchTerm) && filteredFolders.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                        {filteredFolders.map((folder) => {
                            const idx = sortedFolders.findIndex(f => f.id === folder.id);
                            return (
                                <div
                                    key={folder.id}
                                    className="card hover-trigger"
                                    onClick={() => setCurrentFolderId(folder.id)}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        (e.currentTarget as HTMLElement).style.background = '#e2e8f0';
                                    }}
                                    onDragLeave={(e) => {
                                        (e.currentTarget as HTMLElement).style.background = folder.color ? `${folder.color}15` : '#f8fafc';
                                    }}
                                    onDrop={(e) => handleDropOnFolder(e, folder.id)}
                                    style={{
                                        padding: '1rem',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        background: folder.color ? `${folder.color}15` : '#f8fafc',
                                        border: folder.color ? `1px solid ${folder.color}40` : '1px solid var(--border)',
                                        borderLeft: folder.color ? `4px solid ${folder.color}` : '4px solid var(--border)',
                                        transition: 'background 0.2s'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600, overflow: 'hidden' }}>
                                        <span style={{ fontSize: '1.2rem' }}>{folder.icon || '📁'}</span>
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</span>
                                        <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.85rem' }}>
                                            ({prompts.filter(p => p.folderId === folder.id).length})
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                        {idx > 0 && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); moveFolderUp(folder); }}
                                                className="btn-icon"
                                                style={{ opacity: 0.5, fontSize: '0.8rem' }}
                                                title="Move up"
                                            >↑</button>
                                        )}
                                        {idx < sortedFolders.length - 1 && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); moveFolderDown(folder); }}
                                                className="btn-icon"
                                                style={{ opacity: 0.5, fontSize: '0.8rem' }}
                                                title="Move down"
                                            >↓</button>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); openEditFolder(folder); }}
                                            className="btn-icon"
                                            style={{ opacity: 0.5 }}
                                            title="Edit folder"
                                        >✎</button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirm('Delete folder and move prompts to root?')) deleteFolder(folder.id);
                                            }}
                                            className="btn-icon"
                                            style={{ opacity: 0.5 }}
                                            title="Delete folder"
                                        >🗑️</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Prompts Section */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
                    {filteredPrompts.length === 0 && filteredFolders.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: 'var(--radius)' }}>
                            <p>No matches found in library.</p>
                        </div>
                    )}
                    {filteredPrompts.map(prompt => (
                        <div
                            key={prompt.id}
                            className={`card ${isDraggingPrompt ? 'dragging-mode' : ''}`}
                            draggable
                            onDragStart={(e) => handlePromptDragStart(e, prompt.id)}
                            onDragOver={(e) => handlePromptDragOver(e, prompt.id)}
                            onDragEnd={() => {
                                setIsDraggingPrompt(false);
                                setDragOverPromptId(null);
                                setDropSide(null);
                            }}
                            onDrop={(e) => handlePromptDrop(e, prompt.id)}
                            style={{
                                padding: '0.75rem 1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                cursor: 'grab',
                                position: 'relative',
                                transition: 'all 0.2s',
                                border: (dragOverPromptId === prompt.id && dropSide) ? '2px solid var(--primary)' : undefined,
                                filter: isDraggingPrompt && dragOverPromptId !== prompt.id ? 'opacity(0.8)' : undefined,
                                transform: dragOverPromptId === prompt.id ? (dropSide === 'before' ? 'translateX(5px)' : 'translateX(-5px)') : undefined
                            }}
                        >
                            {/* Drag Indicator Overlay */}
                            {dragOverPromptId === prompt.id && dropSide && (
                                <div style={{
                                    position: 'absolute',
                                    [dropSide === 'before' ? 'left' : 'right']: '-4px',
                                    top: '0',
                                    bottom: '0',
                                    width: '4px',
                                    background: 'var(--primary)',
                                    borderRadius: '2px',
                                    boxShadow: '0 0 8px var(--primary)',
                                    zIndex: 10
                                }} />
                            )}
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                {/* Rating indicator */}
                                <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '6px',
                                    background: prompt.rating >= 80 ? 'var(--success-bg)' : prompt.rating >= 50 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                                    color: prompt.rating >= 80 ? 'var(--success)' : prompt.rating >= 50 ? 'var(--warning)' : 'var(--danger)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: '0.75rem',
                                    flexShrink: 0,
                                    marginTop: '2px'
                                }}>
                                    {prompt.rating}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {/* Top Row: Title and Actions */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={prompt.title}>
                                            {prompt.title}
                                        </h3>

                                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexShrink: 0 }}>
                                            <button onClick={() => onEdit(prompt.id)} className="btn-icon" title="Edit">✎</button>
                                            <button
                                                onClick={() => copyToClipboard(getFullContent(prompt.segments), prompt.id)}
                                                className="btn-icon"
                                                title="Copy"
                                                style={{ color: copiedId === prompt.id ? 'var(--success)' : undefined }}
                                            >
                                                {copiedId === prompt.id ? '✓' : '📋'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (confirm('Delete this prompt?')) deletePrompt(prompt.id);
                                                }}
                                                className="btn-icon"
                                                title="Delete"
                                                style={{ color: 'var(--danger)' }}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>

                                    {/* Bottom Row: Stats and Folder Selection */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                                        <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                                            {getCompositionSummary(prompt.segments)}
                                        </div>

                                        <select
                                            value={prompt.folderId || ''}
                                            onChange={(e) => movePrompt(prompt, e.target.value || undefined)}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                fontSize: '0.7rem',
                                                padding: '2px 4px',
                                                border: '1px solid var(--border)',
                                                borderRadius: '4px',
                                                maxWidth: '120px',
                                                background: 'white',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="">(Root)</option>
                                            {folders.map(f => (
                                                <option key={f.id} value={f.id}>{f.icon} {f.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <details
                                style={{ marginTop: 'auto' }}
                                open={expandedIds.has(prompt.id)}
                                onToggle={(e) => {
                                    const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                                    setExpandedIds((prev: Set<string>) => {
                                        const next = new Set(prev);
                                        if (isOpen) next.add(prompt.id);
                                        else next.delete(prompt.id);
                                        return next;
                                    });
                                }}
                            >
                                <summary style={{ fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer', listStyle: 'none' }}>
                                    {expandedIds.has(prompt.id) ? '▲ Hide Details' : '▼ Show Details'}
                                </summary>
                                <div style={{ marginTop: '0.5rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--border)' }}>
                                    {prompt.notes && (
                                        <div style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            <strong>Notes:</strong> {prompt.notes}
                                        </div>
                                    )}
                                    <div style={{
                                        whiteSpace: 'pre-wrap',
                                        fontSize: '0.8rem',
                                        color: 'var(--text-main)',
                                        fontFamily: 'monospace',
                                        background: 'var(--bg-app)',
                                        padding: '0.5rem',
                                        borderRadius: '4px',
                                        maxHeight: '150px',
                                        overflowY: 'auto'
                                    }}>
                                        {getFullContent(prompt.segments)}
                                    </div>
                                </div>
                            </details>
                        </div>
                    ))}
                </div>

                {/* Empty State */}
                {filteredPrompts.length === 0 && (!currentFolderId ? folders.length === 0 : true) && (
                    <div style={{
                        textAlign: 'center',
                        padding: '3rem',
                        color: 'var(--text-muted)',
                        border: '2px dashed var(--border)',
                        borderRadius: 'var(--radius)',
                        background: 'var(--bg-app)'
                    }}>
                        <p className="text-lg mb-2">
                            {currentFolderId ? 'No prompts in this folder.' : 'No saved prompts or folders.'}
                        </p>
                        {!currentFolderId && <p className="text-sm">Create a folder or go to "Builder" to start.</p>}
                    </div>
                )}
            </div>
        </div>
    );
}
