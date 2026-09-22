import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Block, Prompt, Folder, BuilderState, PromptSegment } from './types';

interface StoreContextType {
    blocks: Block[];
    prompts: Prompt[];
    folders: Folder[];
    addBlock: (block: Omit<Block, 'id' | 'createdAt'>) => string;
    updateBlock: (id: string, updates: Partial<Block>) => void;
    deleteBlock: (id: string) => void;
    savePrompt: (prompt: Omit<Prompt, 'id' | 'createdAt'> & { id?: string }) => string;
    deletePrompt: (id: string) => void;
    addFolder: (name: string, icon?: string, color?: string) => string;
    updateFolder: (id: string, updates: Partial<Folder>) => void;
    deleteFolder: (id: string) => void;
    editPromptId: string | null;
    setEditPromptId: React.Dispatch<React.SetStateAction<string | null>>;
    builderState: BuilderState;
    setBuilderState: React.Dispatch<React.SetStateAction<BuilderState>>;
    storageError: string | null;
    exportData: () => string;
    importData: (jsonData: string) => boolean;
    clearAllData: () => void;
    reorderPrompts: (prompts: Prompt[]) => void;
    expandedIds: Set<string>;
    setExpandedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    expandedBlockIds: Set<string>;
    setExpandedBlockIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    currentFolderId: string | null;
    setCurrentFolderId: React.Dispatch<React.SetStateAction<string | null>>;
}

interface LibraryData {
    blocks: Block[];
    prompts: Prompt[];
    folders: Folder[];
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);
const STORAGE_KEY = 'prompt-builder-data';
const DRAFT_STORAGE_KEY = 'prompt-builder-draft';
const EMPTY_BUILDER: BuilderState = { title: '', segments: [], rating: 0, notes: '' };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

function isSegment(value: unknown): value is PromptSegment {
    if (!isRecord(value)) return false;
    return (value.type === 'block' && typeof value.blockId === 'string') ||
        (value.type === 'text' && typeof value.content === 'string') || value.type === 'newline';
}

function isBuilderState(value: unknown): value is BuilderState {
    return isRecord(value) && typeof value.title === 'string' &&
        Array.isArray(value.segments) && value.segments.every(isSegment) &&
        isFiniteNumber(value.rating) && typeof value.notes === 'string' && isOptionalString(value.folderId);
}

function hasIdentity(value: Record<string, unknown>) {
    return typeof value.id === 'string' && value.id.length > 0 && isFiniteNumber(value.createdAt);
}

function hasUniqueIds(items: { id: string }[]) {
    return new Set(items.map(item => item.id)).size === items.length;
}

// Loading and importing share validation, including migration of pre-segment backups.
function parseLibrary(value: unknown): LibraryData {
    if (!isRecord(value) || !Array.isArray(value.blocks) || !Array.isArray(value.prompts) ||
        (value.folders !== undefined && !Array.isArray(value.folders))) {
        throw new Error('Invalid backup structure');
    }

    const blocks = value.blocks.map((block: unknown): Block => {
        if (!isRecord(block) || !hasIdentity(block) || typeof block.name !== 'string' ||
            typeof block.content !== 'string' || !isOptionalString(block.color)) {
            throw new Error('Invalid block');
        }
        return block as unknown as Block;
    });

    const prompts = value.prompts.map((prompt: unknown, index: number): Prompt => {
        if (!isRecord(prompt) || !hasIdentity(prompt) ||
            (prompt.position !== undefined && !isFiniteNumber(prompt.position))) {
            throw new Error('Invalid prompt');
        }
        let segments = prompt.segments;
        if (segments === undefined) {
            const blockIds = prompt.blockIds ?? [];
            if (!Array.isArray(blockIds) || !blockIds.every(id => typeof id === 'string')) {
                throw new Error('Invalid legacy block list');
            }
            segments = blockIds.map(blockId => ({ type: 'block', blockId }));
        }
        const migrated = { ...prompt, segments, position: prompt.position ?? index };
        if (!isBuilderState(migrated)) throw new Error('Invalid prompt content');
        return migrated as Prompt;
    });

    const folders = ((value.folders ?? []) as unknown[]).map((folder: unknown, index: number): Folder => {
        if (!isRecord(folder) || !hasIdentity(folder) || typeof folder.name !== 'string' ||
            !isOptionalString(folder.icon) || !isOptionalString(folder.color) ||
            (folder.position !== undefined && !isFiniteNumber(folder.position))) {
            throw new Error('Invalid folder');
        }
        return { ...folder, position: folder.position ?? index } as unknown as Folder;
    });

    if (![blocks, prompts, folders].every(hasUniqueIds)) throw new Error('Duplicate IDs in backup');
    return { blocks, prompts, folders };
}

function loadInitialState() {
    let library: LibraryData = { blocks: [], prompts: [], folders: [] };
    let builderState = EMPTY_BUILDER;
    let editPromptId: string | null = null;
    let libraryError: string | null = null;
    let draftError: string | null = null;

    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved !== null) library = parseLibrary(JSON.parse(saved));
    } catch {
        libraryError = 'Saved data could not be read. Automatic saving is paused to protect it. Import a valid backup or reset to continue.';
    }

    try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (saved !== null) {
            const draft: unknown = JSON.parse(saved);
            if (!isRecord(draft) || draft.version !== 1 || !isBuilderState(draft.builderState) ||
                (draft.editPromptId !== null && typeof draft.editPromptId !== 'string')) {
                throw new Error('Invalid draft');
            }
            builderState = draft.builderState;
            // A deleted prompt must become a new draft instead of a save that silently does nothing.
            editPromptId = library.prompts.some(prompt => prompt.id === draft.editPromptId)
                ? draft.editPromptId as string : null;
        }
    } catch {
        draftError = 'The previous draft could not be read. Draft autosave is paused to protect it. Export your saved prompts before importing or resetting.';
    }

    return { library, builderState, editPromptId, libraryError, draftError };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
    const [initial] = useState(loadInitialState);
    const [blocks, setBlocks] = useState(initial.library.blocks);
    const [prompts, setPrompts] = useState(initial.library.prompts);
    const [folders, setFolders] = useState(initial.library.folders);
    const [builderState, setBuilderState] = useState<BuilderState>(initial.builderState);
    const [editPromptId, setEditPromptId] = useState(initial.editPromptId);
    const [canSaveLibrary, setCanSaveLibrary] = useState(!initial.libraryError);
    const [canSaveDraft, setCanSaveDraft] = useState(!initial.draftError);
    const [libraryError, setLibraryError] = useState(initial.libraryError);
    const [draftError, setDraftError] = useState(initial.draftError);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [expandedBlockIds, setExpandedBlockIds] = useState<Set<string>>(new Set());
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

    useEffect(() => {
        if (!canSaveLibrary) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ blocks, prompts, folders }));
            // Browser storage failures must be reflected in the UI, including recovery after a successful write.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLibraryError(null);
        } catch {
            setLibraryError('Changes could not be saved on this device. Export a backup before closing this page.');
        }
    }, [blocks, prompts, folders, canSaveLibrary]);

    useEffect(() => {
        if (!canSaveDraft) return;
        try {
            localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ version: 1, builderState, editPromptId }));
            // Keep storage health visible when browser privacy settings or storage limits reject writes.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setDraftError(null);
        } catch {
            setDraftError('Draft autosave is unavailable on this device. Copy your draft before closing this page.');
        }
    }, [builderState, editPromptId, canSaveDraft]);

    const addFolder = (name: string, icon?: string, color?: string) => {
        const id = crypto.randomUUID();
        setFolders(prev => [...prev, { id, name, icon: icon || '📁', color, position: prev.length, createdAt: Date.now() }]);
        return id;
    };

    const updateFolder = (id: string, updates: Partial<Folder>) => {
        setFolders(prev => prev.map(folder => folder.id === id ? { ...folder, ...updates } : folder));
    };

    const deleteFolder = (id: string) => {
        setFolders(prev => prev.filter(folder => folder.id !== id));
        setPrompts(prev => prev.map(prompt => prompt.folderId === id ? { ...prompt, folderId: undefined } : prompt));
        setBuilderState(prev => prev.folderId === id ? { ...prev, folderId: undefined } : prev);
        setCurrentFolderId(prev => prev === id ? null : prev);
    };

    const addBlock = (data: Omit<Block, 'id' | 'createdAt'>) => {
        const id = crypto.randomUUID();
        setBlocks(prev => [...prev, { ...data, id, createdAt: Date.now() }]);
        return id;
    };

    const updateBlock = (id: string, updates: Partial<Block>) => {
        setBlocks(prev => prev.map(block => block.id === id ? { ...block, ...updates } : block));
    };

    const deleteBlock = (id: string) => {
        setBlocks(prev => prev.filter(block => block.id !== id));
    };

    const savePrompt = (data: Omit<Prompt, 'id' | 'createdAt'> & { id?: string }) => {
        const existing = prompts.find(prompt => prompt.id === data.id);
        const savedId = existing?.id ?? crypto.randomUUID();
        setPrompts(prev => existing
            ? prev.map(prompt => prompt.id === savedId ? { ...prompt, ...data, id: savedId } : prompt)
            : [...prev, { ...data, id: savedId, createdAt: Date.now(), position: prev.length }]);
        return savedId;
    };

    const deletePrompt = (id: string) => {
        setPrompts(prev => prev.filter(prompt => prompt.id !== id));
        setEditPromptId(prev => prev === id ? null : prev);
    };

    const resetEditorContext = () => {
        setBuilderState(EMPTY_BUILDER);
        setEditPromptId(null);
        setExpandedIds(new Set());
        setExpandedBlockIds(new Set());
        setCurrentFolderId(null);
        setCanSaveLibrary(true);
        setCanSaveDraft(true);
        setLibraryError(null);
        setDraftError(null);
    };

    const exportData = () => JSON.stringify({ blocks, prompts, folders }, null, 2);

    const importData = (jsonData: string) => {
        try {
            // Validate every nested entry before changing any saved or in-memory data.
            const parsed = parseLibrary(JSON.parse(jsonData));
            setBlocks(parsed.blocks);
            setPrompts(parsed.prompts);
            setFolders(parsed.folders);
            resetEditorContext();
            return true;
        } catch {
            alert('This backup contains invalid data. Your current data has not been changed.');
            return false;
        }
    };

    const clearAllData = () => {
        setBlocks([]);
        setPrompts([]);
        setFolders([]);
        resetEditorContext();
    };

    return (
        <StoreContext.Provider value={{
            blocks, prompts, folders, addBlock, updateBlock, deleteBlock, savePrompt, deletePrompt,
            addFolder, updateFolder, deleteFolder,
            editPromptId, setEditPromptId,
            builderState, setBuilderState,
            storageError: [libraryError, draftError].filter(Boolean).join(' ') || null,
            exportData, importData, clearAllData,
            reorderPrompts: setPrompts,
            expandedIds, setExpandedIds,
            expandedBlockIds, setExpandedBlockIds,
            currentFolderId, setCurrentFolderId
        }}>
            {children}
        </StoreContext.Provider>
    );
}

// This module deliberately keeps the provider and its single consumer hook together.
// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
    const context = useContext(StoreContext);
    if (context === undefined) throw new Error('useStore must be used within a StoreProvider');
    return context;
}
