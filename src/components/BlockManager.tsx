import { useState, useMemo } from 'react';
import { useStore } from '../store';
import { PRESET_COLORS } from '../types';

export function BlockManager() {
    const { blocks, addBlock, expandedBlockIds, setExpandedBlockIds } = useStore();
    const [isCreating, setIsCreating] = useState(false);
    const [newBlockName, setNewBlockName] = useState('');
    const [newBlockContent, setNewBlockContent] = useState('');
    const [newBlockColor, setNewBlockColor] = useState<string | undefined>(undefined);

    // Filter/Sort State
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az' | 'za' | 'color'>('newest');

    const [filterColor, setFilterColor] = useState<string | 'none' | undefined>(undefined);

    const filteredBlocks = useMemo(() => {
        return blocks
            .filter(b => {
                const matchesSearch = b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    b.content.toLowerCase().includes(searchTerm.toLowerCase());

                let matchesColor = true;
                if (filterColor === 'none') {
                    matchesColor = !b.color;
                } else if (filterColor) {
                    matchesColor = b.color === filterColor;
                }

                return matchesSearch && matchesColor;
            })
            .sort((a, b) => {
                if (sortBy === 'newest') return b.createdAt - a.createdAt;
                if (sortBy === 'oldest') return a.createdAt - b.createdAt;
                if (sortBy === 'az') return a.name.localeCompare(b.name);
                if (sortBy === 'za') return b.name.localeCompare(a.name);
                if (sortBy === 'color') return (a.color || '').localeCompare(b.color || '');
                return 0;
            });
    }, [blocks, searchTerm, sortBy, filterColor]);

    const toggleAllDetails = () => {
        const allVisibleIds = filteredBlocks.map(b => b.id);
        const allOpen = allVisibleIds.every(id => expandedBlockIds.has(id));
        if (allOpen) {
            setExpandedBlockIds(new Set());
        } else {
            setExpandedBlockIds(new Set(allVisibleIds));
        }
    };


    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        const name = newBlockName.trim();
        const content = newBlockContent.trim();

        if (!name && !content) return;

        addBlock({
            name: name || content,
            content: content || name,
            color: newBlockColor
        });

        setNewBlockName('');
        setNewBlockContent('');
        setNewBlockColor(undefined);
        setIsCreating(false);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>My Blocks</h2>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="btn btn-primary"
                    >
                        + New Block
                    </button>
                </div>

                {/* Toolbar */}
                <div style={{
                    display: 'flex',
                    gap: '1rem',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    background: 'white',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <input
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search blocks..."
                            style={{ width: '100%' }}
                        />
                    </div>

                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as any)}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="az">A-Z</option>
                        <option value="za">Z-A</option>
                        <option value="color">By Color</option>
                    </select>

                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
                        {/* "All" button */}
                        <button
                            onClick={() => setFilterColor(undefined)}
                            style={{
                                width: '28px',
                                height: '22px',
                                borderRadius: '4px',
                                border: filterColor === undefined ? '2px solid var(--primary)' : '1px solid var(--border)',
                                background: filterColor === undefined ? 'var(--primary-bg)' : 'white',
                                color: filterColor === undefined ? 'var(--primary)' : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            title="Show All"
                        >ALL</button>

                        {/* "No Color" Filter button */}
                        <button
                            onClick={() => setFilterColor(filterColor === 'none' ? undefined : 'none')}
                            style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                border: filterColor === 'none' ? '2px solid var(--text-main)' : '1px solid var(--border)',
                                background: 'white',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden'
                            }}
                            title="Filter: No Color"
                        >
                            <div style={{
                                position: 'absolute',
                                width: '100%',
                                height: '1.5px',
                                background: 'var(--text-muted)',
                                transform: 'rotate(-45deg)',
                                opacity: 0.6
                            }} />
                        </button>

                        {/* Preset color buttons */}
                        {PRESET_COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => setFilterColor(c === filterColor ? undefined : c)}
                                style={{
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    border: filterColor === c ? '2px solid var(--text-main)' : '2px solid transparent',
                                    background: c,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    transform: filterColor === c ? 'scale(1.1)' : 'scale(1)'
                                }}
                            />
                        ))}
                    </div>

                    <button
                        className="btn btn-secondary"
                        onClick={toggleAllDetails}
                        style={{ fontSize: '0.85rem' }}
                    >
                        {filteredBlocks.length > 0 && filteredBlocks.every(b => expandedBlockIds.has(b.id)) ? 'Collapse All' : 'Expand All'}
                    </button>
                </div>
            </div>

            {isCreating && (
                <form onSubmit={handleCreate} className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--primary)' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div style={{ flex: 1 }}>
                            <input
                                value={newBlockName}
                                onChange={e => setNewBlockName(e.target.value)}
                                placeholder="Block Name"
                                autoFocus
                                style={{ width: '100%', fontWeight: 600 }}
                            />
                        </div>
                    </div>
                    <div>
                        <textarea
                            value={newBlockContent}
                            onChange={e => setNewBlockContent(e.target.value)}
                            placeholder="Block Content..."
                            rows={2}
                            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.9rem' }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.85rem', marginBottom: '0.25rem', display: 'block' }}>Color Tag</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <button
                                type="button"
                                onClick={() => setNewBlockColor(undefined)}
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    border: !newBlockColor ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #fff 45%, #ccc 55%)',
                                    cursor: 'pointer'
                                }}
                                title="No color"
                            />
                            {PRESET_COLORS.map(color => (
                                <button
                                    type="button"
                                    key={color}
                                    onClick={() => setNewBlockColor(color)}
                                    style={{
                                        width: '24px',
                                        height: '24px',
                                        border: newBlockColor === color ? '2px solid var(--text-main)' : '2px solid transparent',
                                        borderRadius: '50%',
                                        background: color,
                                        cursor: 'pointer'
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setIsCreating(false)} className="btn btn-sm btn-secondary">Cancel</button>
                        <button type="submit" disabled={!newBlockName.trim() && !newBlockContent.trim()} className="btn btn-sm btn-primary">Save Block</button>
                    </div>
                </form>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                {filteredBlocks.map(block => (
                    <BlockItem key={block.id} block={block} />
                ))}
                {filteredBlocks.length === 0 && !isCreating && (
                    <div style={{
                        gridColumn: '1 / -1',
                        textAlign: 'center',
                        padding: '3rem',
                        color: 'var(--text-muted)',
                        border: '2px dashed var(--border)',
                        borderRadius: 'var(--radius)',
                        background: 'var(--bg-app)'
                    }}>
                        <p>{searchTerm || filterColor ? 'No blocks match your search/filter.' : 'No blocks yet. Create one to get started!'}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function BlockItem({ block }: { block: any }) {
    const { updateBlock, deleteBlock, expandedBlockIds, setExpandedBlockIds } = useStore();
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(block.name);
    const [content, setContent] = useState(block.content);
    const [color, setColor] = useState<string | undefined>(block.color);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const isExpanded = expandedBlockIds.has(block.id);

    const toggleExpand = () => {
        setExpandedBlockIds((prev: Set<string>) => {
            const next = new Set(prev);
            if (isExpanded) next.delete(block.id);
            else next.add(block.id);
            return next;
        });
    };

    const handleSave = () => {
        const finalName = name.trim();
        const finalContent = content.trim();

        if (!finalName && !finalContent) return;

        updateBlock(block.id, {
            name: finalName || finalContent,
            content: finalContent || finalName,
            color
        });
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className="card" style={{ padding: '0.75rem', border: '1px solid var(--primary)' }}>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Block Name"
                    style={{ width: '100%', marginBottom: '0.5rem', fontWeight: 600 }}
                    autoFocus
                />
                <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Block Content"
                    rows={2}
                    style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.9rem', fontFamily: 'monospace' }}
                />
                <div style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block' }}>Color Tag</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <button
                            type="button"
                            onClick={() => setColor(undefined)}
                            style={{
                                width: '20px',
                                height: '20px',
                                border: !color ? '2px solid var(--primary)' : '1px solid var(--border)',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #fff 45%, #ccc 55%)',
                                cursor: 'pointer'
                            }}
                            title="No color"
                        />
                        {PRESET_COLORS.map(c => (
                            <button
                                type="button"
                                key={c}
                                onClick={() => setColor(c)}
                                style={{
                                    width: '20px',
                                    height: '20px',
                                    border: color === c ? '2px solid var(--text-main)' : '2px solid transparent',
                                    borderRadius: '50%',
                                    background: c,
                                    cursor: 'pointer'
                                }}
                            />
                        ))}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button onClick={() => setIsEditing(false)} className="btn btn-sm btn-secondary">Cancel</button>
                    <button onClick={handleSave} className="btn btn-sm btn-primary">Save</button>
                </div>
            </div>
        );
    }

    return (
        <div className="card hover-trigger" style={{
            padding: '0.75rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            transition: 'all 0.2s',
            borderLeft: `4px solid ${block.color || 'var(--primary)'}`,
            background: block.color ? `${block.color}10` : undefined,
            cursor: 'pointer'
        }} onClick={toggleExpand}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {block.color && (
                            <div style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: block.color,
                                flexShrink: 0
                            }} />
                        )}
                        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{block.name}</h3>
                    </div>
                    {!isExpanded && (
                        <div
                            className="text-muted"
                            style={{
                                fontSize: '0.85rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                marginTop: '0.25rem'
                            }}
                            title={block.content}
                        >
                            {block.content}
                        </div>
                    )}
                </div>
                <div className="actions" style={{ display: 'flex', gap: '0.25rem', opacity: 0.6 }}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(block.content);
                            setCopiedId(block.id);
                            setTimeout(() => setCopiedId(null), 2000);
                        }}
                        className="btn-icon"
                        title="Copy content"
                        style={{ color: copiedId === block.id ? 'var(--success)' : 'inherit' }}
                    >
                        {copiedId === block.id ? '✓' : '📋'}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                        className="btn-icon"
                        title="Edit block"
                    >
                        ✎
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this block?')) deleteBlock(block.id);
                        }}
                        className="btn-icon"
                        title="Delete block"
                        style={{ color: 'var(--danger)' }}
                    >
                        🗑️
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.5)',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    border: '1px solid rgba(0,0,0,0.05)',
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    {block.content}
                </div>
            )}

            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', alignSelf: 'flex-end', marginTop: 'auto' }}>
                {isExpanded ? '▲ Collapse' : '▼ Expand'}
            </div>
        </div>
    );
}
