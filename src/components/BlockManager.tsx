import { useState, useMemo, useRef, useId } from 'react';
import type { FormEvent } from 'react';
import { useStore } from '../store';
import { PRESET_COLORS } from '../types';
import type { Block } from '../types';
import { copyText } from '../utils/clipboard';
import './BlockManager.css';

const COLOR_NAMES: Record<string, string> = {
    '#6366f1': 'Indigo', '#8b5cf6': 'Violet', '#ec4899': 'Pink',
    '#ef4444': 'Red', '#f97316': 'Orange', '#eab308': 'Yellow',
    '#22c55e': 'Green', '#14b8a6': 'Teal', '#0ea5e9': 'Sky', '#64748b': 'Slate'
};

function BlockColorPicker({ value, onChange, filter = false }: {
    value: string | undefined;
    onChange: (color: string | undefined) => void;
    filter?: boolean;
}) {
    const options = [
        ...(filter ? [{ value: undefined, label: 'All colors' }] : []),
        { value: filter ? 'none' : undefined, label: 'No color' },
        ...PRESET_COLORS.map(color => ({ value: color, label: COLOR_NAMES[color] || color }))
    ];
    return (
        <fieldset className="bm-color-field">
            <legend>{filter ? 'Filter by color' : 'Color tag'}</legend>
            <div className="bm-color-options">
                {options.map(option => {
                    const selected = value === option.value;
                    const isColor = option.value?.startsWith('#');
                    return (
                        <button key={option.label} type="button" className="bm-color-choice"
                            aria-label={option.label} aria-pressed={selected} title={option.label}
                            onClick={() => onChange(filter && selected ? undefined : option.value)}>
                            {isColor ? <span className="bm-color-swatch" style={{ background: option.value }} aria-hidden="true" />
                                : <span className="bm-color-text">{option.label === 'All colors' ? 'All' : 'None'}</span>}
                            {selected && <span className="bm-color-check" aria-hidden="true">✓</span>}
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}

export function BlockManager() {
    const { blocks, addBlock, expandedBlockIds, setExpandedBlockIds } = useStore();
    const [isCreating, setIsCreating] = useState(false);
    const [newBlockName, setNewBlockName] = useState('');
    const [newBlockContent, setNewBlockContent] = useState('');
    const [newBlockColor, setNewBlockColor] = useState<string | undefined>(undefined);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az' | 'za' | 'color'>('newest');
    const [filterColor, setFilterColor] = useState<string | undefined>(undefined);
    const [notice, setNotice] = useState('');
    const newBlockButton = useRef<HTMLButtonElement>(null);
    const id = useId();

    const filteredBlocks = useMemo(() => blocks
        .filter(block => {
            const matchesSearch = block.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                block.content.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesColor = filterColor === 'none' ? !block.color : !filterColor || block.color === filterColor;
            return matchesSearch && matchesColor;
        })
        .sort((a, b) => {
            if (sortBy === 'newest') return b.createdAt - a.createdAt;
            if (sortBy === 'oldest') return a.createdAt - b.createdAt;
            if (sortBy === 'az') return a.name.localeCompare(b.name);
            if (sortBy === 'za') return b.name.localeCompare(a.name);
            return (a.color || '').localeCompare(b.color || '');
        }), [blocks, searchTerm, sortBy, filterColor]);

    const allExpanded = filteredBlocks.length > 0 && filteredBlocks.every(block => expandedBlockIds.has(block.id));
    const toggleAllDetails = () => {
        setExpandedBlockIds((previous: Set<string>) => {
            const next = new Set(previous);
            filteredBlocks.forEach(block => allExpanded ? next.delete(block.id) : next.add(block.id));
            return next;
        });
    };
    const closeCreateForm = () => {
        setIsCreating(false);
        newBlockButton.current?.focus();
    };
    const handleCreate = (event: FormEvent) => {
        event.preventDefault();
        const name = newBlockName.trim();
        const content = newBlockContent.trim();
        if (!name && !content) return;
        addBlock({ name: name || content, content: content || name, color: newBlockColor });
        setNewBlockName('');
        setNewBlockContent('');
        setNewBlockColor(undefined);
        setNotice('Block saved.');
        closeCreateForm();
    };

    return (
        <section className="bm-layout" aria-labelledby={`${id}-heading`}>
            <div className="bm-heading">
                <h2 id={`${id}-heading`}>My Blocks</h2>
                <button ref={newBlockButton} onClick={() => { setIsCreating(true); setNotice(''); }}
                    className="btn btn-primary" aria-expanded={isCreating} aria-controls={isCreating ? `${id}-create` : undefined}>
                    + New Block
                </button>
            </div>
            <div className="bm-toolbar">
                <div className="bm-search">
                    <label htmlFor={`${id}-search`}>Search blocks</label>
                    <input id={`${id}-search`} type="search" value={searchTerm}
                        onChange={event => setSearchTerm(event.target.value)} placeholder="Search name or content…" />
                </div>
                <div className="bm-sort">
                    <label htmlFor={`${id}-sort`}>Sort blocks</label>
                    <select id={`${id}-sort`} value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)}>
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="az">A-Z</option>
                        <option value="za">Z-A</option>
                        <option value="color">By Color</option>
                    </select>
                </div>
                <button className="btn btn-secondary bm-expand-all" onClick={toggleAllDetails} disabled={!filteredBlocks.length}>
                    {allExpanded ? 'Collapse All' : 'Expand All'}
                </button>
                <BlockColorPicker value={filterColor} onChange={setFilterColor} filter />
            </div>
            <p className="bm-notice" role="status" aria-live="polite">{notice}</p>
            {isCreating && (
                <form id={`${id}-create`} onSubmit={handleCreate} className="card bm-form">
                    <h3>New block</h3>
                    <div>
                        <label htmlFor={`${id}-name`}>Block name</label>
                        <input id={`${id}-name`} value={newBlockName} onChange={event => setNewBlockName(event.target.value)}
                            placeholder="Give this block a name" autoFocus aria-describedby={`${id}-hint`} />
                    </div>
                    <div>
                        <label htmlFor={`${id}-content`}>Block content</label>
                        <textarea id={`${id}-content`} value={newBlockContent} onChange={event => setNewBlockContent(event.target.value)}
                            placeholder="Write the text to reuse in your prompts…" rows={4} aria-describedby={`${id}-hint`} />
                        <p id={`${id}-hint`} className="bm-hint">Add a name or content. If one is empty, the other will be used for both.</p>
                    </div>
                    <BlockColorPicker value={newBlockColor} onChange={setNewBlockColor} />
                    <div className="bm-form-actions">
                        <button type="button" onClick={closeCreateForm} className="btn btn-secondary">Cancel</button>
                        <button type="submit" disabled={!newBlockName.trim() && !newBlockContent.trim()} className="btn btn-primary">Save Block</button>
                    </div>
                </form>
            )}
            <div className="bm-grid">
                {filteredBlocks.map(block => <BlockItem key={block.id} block={block} />)}
                {filteredBlocks.length === 0 && !isCreating && (
                    <div className="bm-empty">
                        <p>{searchTerm || filterColor ? 'No blocks match your search or color filter.' : 'No blocks yet. Create one to get started!'}</p>
                        {(searchTerm || filterColor) && (
                            <button className="btn btn-secondary" onClick={() => { setSearchTerm(''); setFilterColor(undefined); }}>Clear filters</button>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

function BlockItem({ block }: { block: Block }) {
    const { updateBlock, deleteBlock, expandedBlockIds, setExpandedBlockIds } = useStore();
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(block.name);
    const [content, setContent] = useState(block.content);
    const [color, setColor] = useState<string | undefined>(block.color);
    const [copyState, setCopyState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
    const [notice, setNotice] = useState('');
    const editButton = useRef<HTMLButtonElement>(null);
    const id = useId();
    const isExpanded = expandedBlockIds.has(block.id);

    const toggleExpand = () => setExpandedBlockIds((previous: Set<string>) => {
        const next = new Set(previous);
        if (next.has(block.id)) next.delete(block.id);
        else next.add(block.id);
        return next;
    });
    const closeEditor = () => {
        setIsEditing(false);
        requestAnimationFrame(() => editButton.current?.focus());
    };
    const handleSave = (event: FormEvent) => {
        event.preventDefault();
        const finalName = name.trim();
        const finalContent = content.trim();
        if (!finalName && !finalContent) return;
        updateBlock(block.id, { name: finalName || finalContent, content: finalContent || finalName, color });
        setNotice('Block updated.');
        closeEditor();
    };
    const handleCopy = async () => {
        setCopyState('pending');
        setNotice('Copying…');
        try {
            await copyText(block.content);
            setCopyState('success');
            setNotice('Block content copied.');
        } catch {
            setCopyState('error');
            setNotice('Could not copy. Expand the block and select its text to copy manually.');
        }
    };

    if (isEditing) {
        return (
            <form onSubmit={handleSave} className="card bm-form">
                <h3>Edit block</h3>
                <div>
                    <label htmlFor={`${id}-name`}>Block name</label>
                    <input id={`${id}-name`} value={name} onChange={event => setName(event.target.value)} autoFocus />
                </div>
                <div>
                    <label htmlFor={`${id}-content`}>Block content</label>
                    <textarea id={`${id}-content`} value={content} onChange={event => setContent(event.target.value)} rows={4} />
                </div>
                <BlockColorPicker value={color} onChange={setColor} />
                <div className="bm-form-actions">
                    <button type="button" onClick={closeEditor} className="btn btn-secondary">Cancel</button>
                    <button type="submit" disabled={!name.trim() && !content.trim()} className="btn btn-primary">Save</button>
                </div>
            </form>
        );
    }

    return (
        <article className="card bm-card" style={{ borderLeftColor: block.color || 'var(--primary)', background: block.color ? `${block.color}10` : undefined }}>
            <div className="bm-card-heading">
                <div className="bm-card-main">
                    <h3>
                        <button type="button" className="bm-title" onClick={toggleExpand} aria-expanded={isExpanded} aria-controls={`${id}-details`}>
                            {block.color && <span className="bm-card-dot" style={{ background: block.color }} aria-hidden="true" />}
                            <span>{block.name}</span>
                        </button>
                    </h3>
                    {!isExpanded && <p className="bm-card-summary" title={block.content}>{block.content}</p>}
                </div>
                <div className="bm-card-actions">
                    <button onClick={handleCopy} className="btn-icon" title="Copy content" aria-label={`Copy ${block.name}`}
                        disabled={copyState === 'pending'} style={{ color: copyState === 'success' ? 'var(--success)' : undefined }}>
                        <span aria-hidden="true">{copyState === 'success' ? '✓' : '📋'}</span>
                    </button>
                    <button ref={editButton} onClick={() => { setName(block.name); setContent(block.content); setColor(block.color); setNotice(''); setCopyState('idle'); setIsEditing(true); }}
                        className="btn-icon" title="Edit block" aria-label={`Edit ${block.name}`}>
                        <span aria-hidden="true">✎</span>
                    </button>
                    <button onClick={() => { if (confirm('Delete this block?')) deleteBlock(block.id); }}
                        className="btn-icon" title="Delete block" aria-label={`Delete ${block.name}`} style={{ color: 'var(--danger)' }}>
                        <span aria-hidden="true">🗑️</span>
                    </button>
                </div>
            </div>
            <div id={`${id}-details`} className="bm-card-content" hidden={!isExpanded}>{block.content}</div>
            <p className={`bm-notice${copyState === 'error' ? ' bm-notice-error' : ''}`} role="status" aria-live="polite">{notice}</p>
            <button className="bm-details-toggle" onClick={toggleExpand} aria-expanded={isExpanded} aria-controls={`${id}-details`}>
                <span aria-hidden="true">{isExpanded ? '▲' : '▼'}</span> {isExpanded ? 'Collapse' : 'Expand'}
            </button>
        </article>
    );
}
