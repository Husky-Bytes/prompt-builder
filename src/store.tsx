import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Block, Prompt, Folder } from './types';

interface StoreContextType {
    blocks: Block[];
    prompts: Prompt[];
    folders: Folder[];
    addBlock: (block: Omit<Block, 'id' | 'createdAt'>) => string;
    updateBlock: (id: string, updates: Partial<Block>) => void;
    deleteBlock: (id: string) => void;
    savePrompt: (prompt: Omit<Prompt, 'id' | 'createdAt'> & { id?: string; folderId?: string }) => string | undefined;
    deletePrompt: (id: string) => void;
    addFolder: (name: string, icon?: string, color?: string) => string;
    updateFolder: (id: string, updates: Partial<Folder>) => void;
    deleteFolder: (id: string) => void;
    editPromptId: string | null;
    setEditPromptId: (id: string | null) => void;
    builderState: {
        title: string;
        segments: any[];
        rating: number;
        notes: string;
        folderId?: string;
    };
    setBuilderState: (state: any) => void;
    exportData: () => string;
    importData: (jsonData: string) => boolean;
    clearAllData: () => void;
    reorderPrompts: (prompts: Prompt[]) => void;
    expandedIds: Set<string>;
    setExpandedIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    expandedBlockIds: Set<string>;
    setExpandedBlockIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    currentFolderId: string | null;
    setCurrentFolderId: (id: string | null) => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const STORAGE_KEY = 'prompt-builder-data';

export function StoreProvider({ children }: { children: React.ReactNode }) {
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [prompts, setPrompts] = useState<Prompt[]>([]);
    const [loaded, setLoaded] = useState(false);

    // Folders state
    const [folders, setFolders] = useState<Folder[]>([]);

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setBlocks(parsed.blocks || []);
                // Migrate old prompts with blockIds to segments and add position
                const migratedPrompts = (parsed.prompts || []).map((p: any, idx: number) => ({
                    ...p,
                    segments: p.segments || (p.blockIds || []).map((id: string) => ({ type: 'block', blockId: id })),
                    position: p.position ?? idx
                }));
                setPrompts(migratedPrompts);
                // Migrate folders with position
                const migratedFolders = (parsed.folders || []).map((f: any, idx: number) => ({
                    ...f,
                    position: f.position ?? idx
                }));
                setFolders(migratedFolders);
            } catch (e) {
                console.error('Failed to parse saved data', e);
            }
        }
        setLoaded(true);
    }, []);

    useEffect(() => {
        if (!loaded) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ blocks, prompts, folders }));
    }, [blocks, prompts, folders, loaded]);

    const addFolder = (name: string, icon?: string, color?: string) => {
        const id = crypto.randomUUID();
        const position = folders.length;
        setFolders(prev => [...prev, { id, name, icon: icon || '📁', color, position, createdAt: Date.now() }]);
        return id;
    };

    const updateFolder = (id: string, updates: Partial<Folder>) => {
        setFolders(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const deleteFolder = (id: string) => {
        setFolders(prev => prev.filter(f => f.id !== id));
        // Move prompts in this folder to root (remove folderId)
        setPrompts(prev => prev.map(p => p.folderId === id ? { ...p, folderId: undefined } : p));
    };

    const addBlock = (data: Omit<Block, 'id' | 'createdAt'>) => {
        const id = crypto.randomUUID();
        const newBlock: Block = {
            ...data,
            id,
            createdAt: Date.now(),
        };
        setBlocks(prev => [...prev, newBlock]);
        return id;
    };

    const updateBlock = (id: string, updates: Partial<Block>) => {
        setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    };

    const deleteBlock = (id: string) => {
        setBlocks(prev => prev.filter(b => b.id !== id));
    };

    const savePrompt = (data: Omit<Prompt, 'id' | 'createdAt'> & { id?: string }) => {
        let savedId = data.id;
        if (data.id) {
            // Update existing
            setPrompts(prev => prev.map(p => p.id === data.id ? { ...p, ...data, id: data.id! } : p));
        } else {
            // Create new
            savedId = crypto.randomUUID();
            const newPrompt: Prompt = {
                title: data.title,
                segments: data.segments,
                rating: data.rating,
                notes: data.notes,
                folderId: data.folderId,
                id: savedId,
                createdAt: Date.now(),
                position: prompts.length,
            };
            setPrompts(prev => [...prev, newPrompt]);
        }
        return savedId;
    };

    const deletePrompt = (id: string) => {
        setPrompts(prev => prev.filter(p => p.id !== id));
    };

    const [editPromptId, setEditPromptId] = useState<string | null>(null);

    const [builderState, setBuilderState] = useState({
        title: '',
        segments: [] as any[],
        rating: 0,
        notes: '',
        folderId: undefined as string | undefined
    });

    const exportData = () => {
        return JSON.stringify({ blocks, prompts, folders }, null, 2);
    };

    const importData = (jsonData: string) => {
        try {
            const parsed = JSON.parse(jsonData);
            // Basic validation
            if (!Array.isArray(parsed.blocks) || !Array.isArray(parsed.prompts)) {
                alert('Invalid data format');
                return false;
            }

            setBlocks(parsed.blocks || []);
            setPrompts(parsed.prompts || []);
            setFolders(parsed.folders || []);
            return true;
        } catch (e) {
            console.error('Import failed', e);
            alert('Failed to parse JSON');
            return false;
        }
    };

    const clearAllData = () => {
        setBlocks([]);
        setPrompts([]);
        setFolders([]);
    };

    const reorderPrompts = (newPrompts: Prompt[]) => {
        setPrompts(newPrompts);
    };


    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [expandedBlockIds, setExpandedBlockIds] = useState<Set<string>>(new Set());
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);



    return (
        <StoreContext.Provider value={{
            blocks, prompts, folders, addBlock, updateBlock, deleteBlock, savePrompt, deletePrompt,
            addFolder, updateFolder, deleteFolder,
            editPromptId, setEditPromptId,
            builderState, setBuilderState,
            exportData, importData, clearAllData,
            reorderPrompts,
            expandedIds, setExpandedIds,
            expandedBlockIds, setExpandedBlockIds,
            currentFolderId, setCurrentFolderId
        }}>
            {children}
        </StoreContext.Provider>
    );
}

export function useStore() {
    const context = useContext(StoreContext);
    if (context === undefined) {
        throw new Error('useStore must be used within a StoreProvider');
    }
    return context;
}
