import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { PRESET_COLORS, PRESET_ICONS } from '../types';
import type { Folder, Prompt, PromptSegment } from '../types';
import { copyText } from '../utils/clipboard';
import { usePointerDrag } from '../hooks/usePointerDrag';
import './PromptLibrary.css';

type LibraryDropTarget =
    | { type: 'prompt'; id: string; side: 'before' | 'after'; axis: 'x' | 'y' }
    | { type: 'folder'; id: string };

function getPromptDropTarget(card: HTMLElement, x: number, y: number): LibraryDropTarget {
    const rect = card.getBoundingClientRect();
    const columns = card.parentElement ? getComputedStyle(card.parentElement).gridTemplateColumns.split(/\s+/).length : 1;
    const axis = columns > 1 ? 'x' : 'y';
    // In wrapped grids, a gap above/below a card means before/after that row.
    const before = y < rect.top ? true : y > rect.bottom ? false
        : axis === 'x' ? x < rect.left + rect.width / 2 : y < rect.top + rect.height / 2;
    return { type: 'prompt', id: card.dataset.libraryPrompt!, side: before ? 'before' : 'after', axis };
}

export function PromptLibrary({ onEdit }: { onEdit: (id: string) => void }) {
    const { prompts, deletePrompt, folders, deleteFolder, savePrompt, addFolder, updateFolder, blocks, reorderPrompts, expandedIds, setExpandedIds, currentFolderId, setCurrentFolderId } = useStore();
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az' | 'za' | 'custom'>('custom');

    // Search/Filter State
    const [searchTerm, setSearchTerm] = useState('');


    // DnD State for Prompts
    const [dragOverPromptId, setDragOverPromptId] = useState<string | null>(null);
    const [dropSide, setDropSide] = useState<'before' | 'after' | null>(null);
    const [dropAxis, setDropAxis] = useState<'x' | 'y'>('y');
    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
    const [isDraggingPrompt, setIsDraggingPrompt] = useState(false);
    const [moveFeedback, setMoveFeedback] = useState('');
    const libraryRef = useRef<HTMLDivElement>(null);

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
        if (prompt.folderId === targetFolderId) return;
        savePrompt({ ...prompt, folderId: targetFolderId });
        const destination = folders.find(folder => folder.id === targetFolderId)?.name || 'root';
        setMoveFeedback(`Moved ${prompt.title} to ${destination}.`);
    };

    const resetNativeDrag = () => {
        setIsDraggingPrompt(false);
        setDragOverPromptId(null);
        setDropSide(null);
        setDragOverFolderId(null);
    };

    const handleDropOnFolder = (e: React.DragEvent, folderId: string | undefined) => {
        e.preventDefault();
        resetNativeDrag();
        const promptId = e.dataTransfer.getData('promptId');
        if (promptId) {
            const prompt = prompts.find(p => p.id === promptId);
            if (prompt) movePrompt(prompt, folderId);
        }
    };

    const reorderPrompt = (draggedId: string, targetId: string, side: 'before' | 'after') => {
        if (sortBy !== 'custom' || draggedId === targetId) return;
        // Use the displayed manual order, keeping prompts outside this view in their slots.
        const visibleIds = new Set(filteredPrompts.map(prompt => prompt.id));
        if (!visibleIds.has(draggedId) || !visibleIds.has(targetId)) return;
        const ordered = [...prompts].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        const visible = ordered.filter(prompt => visibleIds.has(prompt.id));
        const fromIndex = visible.findIndex(prompt => prompt.id === draggedId);
        const [draggedPrompt] = visible.splice(fromIndex, 1);
        const targetIndex = visible.findIndex(prompt => prompt.id === targetId);
        const newIndex = targetIndex + (side === 'after' ? 1 : 0);
        visible.splice(newIndex, 0, draggedPrompt);
        if (fromIndex === newIndex) return;
        let nextVisible = 0;
        reorderPrompts(ordered.map((prompt, position) => ({
            ...(visibleIds.has(prompt.id) ? visible[nextVisible++] : prompt), position
        })));
        setMoveFeedback(`Moved ${draggedPrompt.title} to position ${newIndex + 1} of ${visible.length}.`);
    };

    const pointerDrag = usePointerDrag<string, LibraryDropTarget>({
        getLabel: id => prompts.find(prompt => prompt.id === id)?.title || 'Prompt',
        getTarget: (x, y, sourceId) => {
            const element = document.elementFromPoint(x, y);
            if (!element || !libraryRef.current?.contains(element)) return null;
            const folder = element.closest<HTMLElement>('[data-library-folder]');
            if (folder) {
                const folderId = folder.dataset.libraryFolder!;
                const source = prompts.find(prompt => prompt.id === sourceId);
                return source && (source.folderId || '') !== folderId ? { type: 'folder', id: folderId } : null;
            }
            if (sortBy !== 'custom') return null;
            const card = element.closest<HTMLElement>('[data-library-prompt]');
            if (card) return card.dataset.libraryPrompt !== sourceId ? getPromptDropTarget(card, x, y) : null;

            // Accept the gaps between cards as insertion targets as well.
            const grid = element.closest<HTMLElement>('.library-prompt-grid');
            if (!grid) return null;
            let closestCard: HTMLElement | null = null;
            let closestDistance = Infinity;
            for (const candidate of grid.querySelectorAll<HTMLElement>('[data-library-prompt]')) {
                if (candidate.dataset.libraryPrompt === sourceId) continue;
                const rect = candidate.getBoundingClientRect();
                const dx = Math.max(rect.left - x, 0, x - rect.right);
                const dy = Math.max(rect.top - y, 0, y - rect.bottom);
                const distance = dx * dx + dy * dy;
                if (distance < closestDistance) {
                    closestCard = candidate;
                    closestDistance = distance;
                }
            }
            return closestCard ? getPromptDropTarget(closestCard, x, y) : null;
        },
        onDrop: (sourceId, target) => {
            if (target.type === 'prompt') reorderPrompt(sourceId, target.id, target.side);
            else {
                const prompt = prompts.find(item => item.id === sourceId);
                if (prompt && (!target.id || folders.some(folder => folder.id === target.id))) movePrompt(prompt, target.id || undefined);
            }
        }
    });
    const pointerTarget = pointerDrag.drag?.target;
    const activePromptId = pointerTarget?.type === 'prompt' ? pointerTarget.id : dragOverPromptId;
    const activeDropSide = pointerTarget?.type === 'prompt' ? pointerTarget.side : dropSide;
    const activeDropAxis = pointerTarget?.type === 'prompt' ? pointerTarget.axis : dropAxis;
    const activeFolderId = pointerTarget?.type === 'folder' ? pointerTarget.id : dragOverFolderId;
    const dragging = isDraggingPrompt || pointerDrag.drag !== null;
    const dragInstructions = sortBy === 'custom'
        ? 'Drag the grip to reorder prompts or move them onto a folder.'
        : 'Drag the grip onto a folder to move a prompt. Choose Manual sort to reorder.';
    const pointerDropLabel = pointerTarget?.type === 'prompt'
        ? `Place ${pointerTarget.side} ${prompts.find(prompt => prompt.id === pointerTarget.id)?.title || 'prompt'}`
        : pointerTarget?.type === 'folder'
            ? `Move to ${folders.find(folder => folder.id === pointerTarget.id)?.name || 'root'}`
            : 'Move over a destination';

    const handlePromptDragStart = (e: React.DragEvent, promptId: string) => {
        if (pointerDrag.drag) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('promptId', promptId);
        e.dataTransfer.effectAllowed = 'move';
        setIsDraggingPrompt(true);
    };

    const handlePromptDragOver = (e: React.DragEvent, targetId: string) => {
        if (!isDraggingPrompt) return;
        e.preventDefault();
        if (sortBy !== 'custom') return;
        const target = getPromptDropTarget(e.currentTarget as HTMLElement, e.clientX, e.clientY);
        if (target.type !== 'prompt') return;
        setDragOverPromptId(targetId);
        setDropSide(target.side);
        setDropAxis(target.axis);
        setDragOverFolderId(null);
    };

    const handlePromptDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        resetNativeDrag();
        const draggedId = e.dataTransfer.getData('promptId');
        const target = getPromptDropTarget(e.currentTarget as HTMLElement, e.clientX, e.clientY);
        if (draggedId && target.type === 'prompt') reorderPrompt(draggedId, targetId, target.side);
    };


    const openFolder = (folderId: string) => {
        setCurrentFolderId(folderId);
        setSearchTerm('');
    };

    const movePromptBy = (promptId: string, direction: -1 | 1) => {
        const index = filteredPrompts.findIndex(prompt => prompt.id === promptId);
        const other = filteredPrompts[index + direction];
        if (!other) return;
        reorderPrompt(promptId, other.id, direction === -1 ? 'before' : 'after');
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
        <div className="prompt-library" ref={libraryRef}>
            {pointerDrag.drag && createPortal(
                <div
                    className="library-drag-preview"
                    aria-hidden="true"
                    style={{ left: Math.min(Math.max(12, pointerDrag.drag.x - 100), window.innerWidth - 212), top: Math.max(12, pointerDrag.drag.y - 84) }}
                >
                    <strong>{pointerDrag.drag.label}</strong>
                    <span>{pointerDropLabel}</span>
                </div>, document.body
            )}
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
                            <button
                                onClick={() => setCurrentFolderId(null)}
                                className={`btn btn-secondary library-root-drop ${activeFolderId === '' ? 'is-drop-target' : ''}`}
                                data-library-folder=""
                                aria-label="Back to all folders. Drop a prompt here to move it to root."
                                title="Drop a prompt here to move it to root"
                                onDragOver={event => {
                                    if (!isDraggingPrompt) return;
                                    event.preventDefault();
                                    setDragOverFolderId('');
                                    setDragOverPromptId(null);
                                }}
                                onDragLeave={() => setDragOverFolderId(null)}
                                onDrop={event => handleDropOnFolder(event, undefined)}
                            >← All folders</button>
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

            <div className="library-drag-guidance">
                <p id="library-drag-instructions">{dragInstructions}</p>
                {!currentFolderId && searchTerm && (
                    <div
                        className={`library-root-drop library-root-drop-search ${activeFolderId === '' ? 'is-drop-target' : ''}`}
                        data-library-folder=""
                        onDragOver={event => {
                            if (!isDraggingPrompt) return;
                            event.preventDefault();
                            setDragOverFolderId('');
                            setDragOverPromptId(null);
                        }}
                        onDragLeave={() => setDragOverFolderId(null)}
                        onDrop={event => handleDropOnFolder(event, undefined)}
                    >Drop here to move to root</div>
                )}
                <p className="library-drag-status" role="status" aria-live="polite" aria-atomic="true">
                    {pointerDrag.drag ? `Moving ${pointerDrag.drag.label}. ${pointerDropLabel}.` : moveFeedback}
                </p>
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
                                    className={`card library-folder-card ${activeFolderId === folder.id ? 'is-drop-target' : ''}`}
                                    data-library-folder={folder.id}
                                    onDragOver={(e) => {
                                        if (!isDraggingPrompt) return;
                                        e.preventDefault();
                                        setDragOverFolderId(folder.id);
                                        setDragOverPromptId(null);
                                    }}
                                    onDragLeave={() => setDragOverFolderId(null)}
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
                            className={`card library-prompt-card ${dragging ? 'dragging-mode' : ''} ${pointerDrag.drag?.source === prompt.id ? 'is-drag-source' : ''} ${activePromptId === prompt.id && activeDropSide ? `library-drop-${activeDropAxis}-${activeDropSide}` : ''}`}
                            data-library-prompt={prompt.id}
                            draggable
                            onDragStart={(e) => handlePromptDragStart(e, prompt.id)}
                            onDragOver={(e) => handlePromptDragOver(e, prompt.id)}
                            onDragEnd={resetNativeDrag}
                            onDragLeave={event => {
                                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                    setDragOverPromptId(null);
                                    setDropSide(null);
                                }
                            }}
                            onDrop={(e) => handlePromptDrop(e, prompt.id)}
                            style={{
                                padding: '0.75rem 1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                cursor: 'grab',
                                position: 'relative',
                                transition: 'box-shadow 0.2s'
                            }}
                        >
                            {/* Drag Indicator Overlay */}
                            {activePromptId === prompt.id && activeDropSide && <span className="library-drop-indicator" aria-hidden="true" />}
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
                                            <button
                                                type="button"
                                                className="btn-icon library-drag-handle"
                                                draggable={false}
                                                data-library-drag-handle=""
                                                aria-label={`Drag prompt ${prompt.title}`}
                                                aria-describedby="library-drag-instructions"
                                                title="Drag to reorder or move to a folder"
                                                {...pointerDrag.getHandleProps(prompt.id)}
                                            >
                                                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                    <circle cx="7" cy="4" r="1.5" /><circle cx="13" cy="4" r="1.5" />
                                                    <circle cx="7" cy="10" r="1.5" /><circle cx="13" cy="10" r="1.5" />
                                                    <circle cx="7" cy="16" r="1.5" /><circle cx="13" cy="16" r="1.5" />
                                                </svg>
                                            </button>
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
