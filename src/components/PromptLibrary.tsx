import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { PRESET_COLORS, PRESET_ICONS } from '../types';
import type { Folder, Prompt, PromptSegment } from '../types';
import { copyText } from '../utils/clipboard';
import './PromptLibrary.css';

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
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [editFolderName, setEditFolderName] = useState('');
    const [editFolderIcon, setEditFolderIcon] = useState('📁');
    const [editFolderColor, setEditFolderColor] = useState<string | undefined>(undefined);

    // Copy feedback state
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState('');
    const [feedbackPromptId, setFeedbackPromptId] = useState<string | null>(null);
    const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const folderDialog = useRef<HTMLFormElement>(null);
    const isFolderDialogOpen = creatingFolder || editingFolder !== null;
    const closeFolderDialog = useCallback(() => {
        setEditingFolder(null);
        setCreatingFolder(false);
    }, []);

    useEffect(() => () => {
        if (copyTimer.current) clearTimeout(copyTimer.current);
    }, []);

    useEffect(() => {
        if (!isFolderDialogOpen) return;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        folderDialog.current?.querySelector<HTMLInputElement>('input')?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeFolderDialog();
                return;
            }
            if (event.key !== 'Tab') return;
            const controls = folderDialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]');
            if (!controls?.length) return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || !folderDialog.current?.contains(document.activeElement))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !folderDialog.current?.contains(document.activeElement))) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [isFolderDialogOpen, closeFolderDialog]);



    const getFullContent = (segments: PromptSegment[]) => {
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

    const getCompositionSummary = (segments: PromptSegment[]) => {
        const text = getFullContent(segments);
        const words = getWordCount(text);
        const chars = text.length;
        const blockCount = segments.filter(s => s.type === 'block').length;
        return `${blockCount} blocks • ${words} words • ${chars} chars`;
    };

    const copyToClipboard = async (text: string, promptId: string) => {
        if (copyTimer.current) clearTimeout(copyTimer.current);
        setCopiedId(null);
        setFeedbackPromptId(promptId);
        setCopyFeedback('Copying prompt…');
        try {
            await copyText(text);
            setCopiedId(promptId);
            setCopyFeedback('Prompt copied.');
            copyTimer.current = setTimeout(() => setCopiedId(null), 1500);
        } catch {
            setCopyFeedback('Could not copy. Open Details to select and copy the prompt manually.');
        }
    };

    // Sort folders by position
    const sortedFolders = [...folders].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    // Filter AND Sort prompts
    const filteredFolders = currentFolderId ? [] : sortedFolders.filter(f => {
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
            if (searchTerm) return matchesSearch && (!currentFolderId || sameFolder);
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

    const movePrompt = (prompt: Prompt, targetFolderId: string | undefined) => {
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


    const openFolder = (folderId: string) => {
        setCurrentFolderId(folderId);
        setSearchTerm('');
    };

    const movePromptBy = (promptId: string, direction: -1 | 1) => {
        const index = filteredPrompts.findIndex(prompt => prompt.id === promptId);
        const other = filteredPrompts[index + direction];
        if (!other) return;
        const ordered = [...prompts].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        const currentIndex = ordered.findIndex(prompt => prompt.id === promptId);
        const otherIndex = ordered.findIndex(prompt => prompt.id === other.id);
        [ordered[currentIndex], ordered[otherIndex]] = [ordered[otherIndex], ordered[currentIndex]];
        reorderPrompts(ordered.map((prompt, position) => ({ ...prompt, position })));
    };

    const openCreateFolder = () => {
        setEditingFolder(null);
        setCreatingFolder(true);
        setEditFolderName('');
        setEditFolderIcon('📁');
        setEditFolderColor(undefined);
    };

    const openEditFolder = (folder: Folder) => {
        setCreatingFolder(false);
        setEditingFolder(folder);
        setEditFolderName(folder.name);
        setEditFolderIcon(folder.icon || '📁');
        setEditFolderColor(folder.color);
    };

    const saveFolder = () => {
        const name = editFolderName.trim();
        if (!name) return;
        if (creatingFolder) {
            addFolder(name, editFolderIcon, editFolderColor);
            setCurrentFolderId(null);
            setSearchTerm('');
        } else if (editingFolder) {
            updateFolder(editingFolder.id, { name, icon: editFolderIcon, color: editFolderColor });
        }
        closeFolderDialog();
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
        setExpandedIds(previous => {
            const allOpen = allVisibleIds.every(id => previous.has(id));
            const next = new Set(previous);
            allVisibleIds.forEach(id => allOpen ? next.delete(id) : next.add(id));
            return next;
        });
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
        <div className="prompt-library">
            {/* Create/Edit Folder Modal */}
            {isFolderDialogOpen && createPortal(
                <div className="library-modal-backdrop" onClick={closeFolderDialog}>
                    <form
                        onSubmit={event => { event.preventDefault(); saveFolder(); }}
                        ref={folderDialog}
                        className="card library-folder-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="library-folder-dialog-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="library-dialog-heading">
                            <h3 id="library-folder-dialog-title">{creatingFolder ? 'New Folder' : 'Edit Folder'}</h3>
                            <button type="button" className="btn-icon" aria-label="Close folder editor" onClick={closeFolderDialog}>×</button>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label htmlFor="library-folder-name" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Name</label>
                            <input
                                id="library-folder-name"
                                value={editFolderName}
                                onChange={e => setEditFolderName(e.target.value)}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Icon</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {PRESET_ICONS.map(icon => (
                                    <button
                                        key={icon}
                                        type="button"
                                        onClick={() => setEditFolderIcon(icon)}
                                        aria-label={`Use ${icon} icon`}
                                        aria-pressed={editFolderIcon === icon}
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
                                    type="button"
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
                                    aria-label="No folder color"
                                    aria-pressed={!editFolderColor}
                                />
                                {PRESET_COLORS.map(color => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => setEditFolderColor(color)}
                                        aria-label={`Use folder color ${color}`}
                                        aria-pressed={editFolderColor === color}
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
                            <button type="button" className="btn btn-secondary" onClick={closeFolderDialog}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={!editFolderName.trim()}>{creatingFolder ? 'Create Folder' : 'Save'}</button>
                        </div>
                    </form>
                </div>,
                document.body
            )}

            <div className="library-heading">
                <div className="library-heading-title">
                    {currentFolderId ? (
                        <>
                            <button onClick={() => setCurrentFolderId(null)} className="btn-icon" aria-label="Back to all folders">←</button>
                            <span style={{ fontSize: '1.2rem' }}>{folders.find(f => f.id === currentFolderId)?.icon || '📁'}</span>
                            <h2 style={{ margin: 0 }}>{folders.find(f => f.id === currentFolderId)?.name}</h2>
                        </>
                    ) : (
                        <h2 style={{ margin: 0 }}>Prompt Library</h2>
                    )}
                </div>

                <div className="library-toolbar">
                    <select
                        aria-label="Sort prompts"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
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
                        disabled={filteredPrompts.length === 0}
                        title="Toggle all details"
                    >
                        {filteredPrompts.length > 0 && filteredPrompts.every(p => expandedIds.has(p.id)) ? 'Collapse All' : 'Expand All'}
                    </button>

                    <button
                        className="btn btn-secondary"
                        onClick={openCreateFolder}
                    >
                        + New Folder
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', background: 'white', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        type="search"
                        aria-label={currentFolderId ? "Search prompts in this folder" : "Search prompts and folders"}
                        placeholder={currentFolderId ? "Search this folder..." : "Search prompts & folders..."}
                        style={{ width: '100%' }}
                    />
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', minWidth: 0 }}>

                {/* Folders Section */}
                {!currentFolderId && filteredFolders.length > 0 && (
                    <div className="library-folder-grid">
                        {filteredFolders.map((folder) => {
                            const idx = sortedFolders.findIndex(f => f.id === folder.id);
                            return (
                                <div
                                    key={folder.id}
                                    className="card library-folder-card"
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
                                    <button className="library-folder-open" onClick={() => openFolder(folder.id)} aria-label={`Open folder ${folder.name}`} title={folder.name}>
                                        <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>{folder.icon || '📁'}</span>
                                        <span className="library-folder-name">{folder.name}</span>
                                        <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.85rem' }}>
                                            ({prompts.filter(p => p.folderId === folder.id).length})
                                        </span>
                                    </button>
                                    <div className="library-folder-actions">
                                        {idx > 0 && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); moveFolderUp(folder); }}
                                                className="btn-icon"
                                                style={{ opacity: 0.5, fontSize: '0.8rem' }}
                                                title="Move up"
                                                aria-label={`Move folder ${folder.name} up`}
                                            >↑</button>
                                        )}
                                        {idx < sortedFolders.length - 1 && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); moveFolderDown(folder); }}
                                                className="btn-icon"
                                                style={{ opacity: 0.5, fontSize: '0.8rem' }}
                                                title="Move down"
                                                aria-label={`Move folder ${folder.name} down`}
                                            >↓</button>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); openEditFolder(folder); }}
                                            className="btn-icon"
                                            style={{ opacity: 0.5 }}
                                            title="Edit folder"
                                            aria-label={`Edit folder ${folder.name}`}
                                        >✎</button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirm('Delete folder and move prompts to root?')) deleteFolder(folder.id);
                                            }}
                                            className="btn-icon"
                                            style={{ opacity: 0.5 }}
                                            title="Delete folder"
                                            aria-label={`Delete folder ${folder.name}`}
                                        >🗑️</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Prompts Section */}
                <div className="library-prompt-grid">
                    {filteredPrompts.map((prompt, promptIndex) => (
                        <div
                            key={prompt.id}
                            className={`card library-prompt-card ${isDraggingPrompt ? 'dragging-mode' : ''}`}
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
                                    <div className="library-prompt-heading">
                                        <h3 className="library-prompt-title" title={prompt.title}>
                                            {prompt.title}
                                        </h3>

                                        <div className="library-prompt-actions">
                                            <button onClick={() => onEdit(prompt.id)} className="btn-icon" title="Edit" aria-label={`Edit prompt ${prompt.title}`}>✎</button>
                                            <button
                                                onClick={() => copyToClipboard(getFullContent(prompt.segments), prompt.id)}
                                                className="btn-icon"
                                                title="Copy"
                                                aria-label={`Copy prompt ${prompt.title}`}
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
                                                aria-label={`Delete prompt ${prompt.title}`}
                                                style={{ color: 'var(--danger)' }}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>

                                    {/* Bottom Row: Stats and Folder Selection */}
                                    <div className="library-prompt-meta">
                                        <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                                            {getCompositionSummary(prompt.segments)}
                                        </div>

                                        <select
                                            aria-label={`Move prompt ${prompt.title} to folder`}
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

                            <p className="library-copy-status" role="status" aria-live="polite">{feedbackPromptId === prompt.id ? copyFeedback : ''}</p>

                            {sortBy === 'custom' && filteredPrompts.length > 1 && (
                                <div className="library-prompt-order" aria-label={`Order for ${prompt.title}`}>
                                    <button className="btn btn-secondary" disabled={promptIndex === 0} onClick={() => movePromptBy(prompt.id, -1)} aria-label={`Move prompt ${prompt.title} up`}>↑ Move up</button>
                                    <button className="btn btn-secondary" disabled={promptIndex === filteredPrompts.length - 1} onClick={() => movePromptBy(prompt.id, 1)} aria-label={`Move prompt ${prompt.title} down`}>↓ Move down</button>
                                </div>
                            )}

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
                                <summary className="library-details-toggle">
                                    {expandedIds.has(prompt.id) ? '▲ Hide Details' : '▼ Show Details'}
                                </summary>
                                <div className="library-prompt-details" style={{ marginTop: '0.5rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--border)' }}>
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
                {filteredPrompts.length === 0 && (searchTerm ? filteredFolders.length === 0 : (currentFolderId || folders.length === 0)) && (
                    <div style={{
                        textAlign: 'center',
                        padding: '3rem',
                        color: 'var(--text-muted)',
                        border: '2px dashed var(--border)',
                        borderRadius: 'var(--radius)',
                        background: 'var(--bg-app)'
                    }}>
                        <p className="text-lg mb-2">
                            {searchTerm ? 'No matches found in library.' : currentFolderId ? 'No prompts in this folder.' : 'No saved prompts or folders.'}
                        </p>
                        {!searchTerm && !currentFolderId && <p className="text-sm">Create a folder or go to "Builder" to start.</p>}
                    </div>
                )}
            </div>
        </div>
    );
}
