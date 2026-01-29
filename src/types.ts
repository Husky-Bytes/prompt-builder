export interface Block {
    id: string;
    name: string;
    content: string;
    color?: string; // Color tag for the block
    createdAt: number;
}

export type PromptSegment =
    | { type: 'block', blockId: string }
    | { type: 'text', content: string };

export interface Folder {
    id: string;
    name: string;
    icon?: string;      // Emoji or icon
    color?: string;     // Folder color
    position?: number;  // For manual ordering
    createdAt: number;
}

export interface Prompt {
    id: string;
    title: string;
    segments: PromptSegment[];
    rating: number; // 0-100
    notes: string;
    createdAt: number;
    folderId?: string; // Optional folder association
    position?: number; // For manual ordering
}

// Preset colors for blocks and folders
export const PRESET_COLORS = [
    '#6366f1', // Indigo
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Green
    '#14b8a6', // Teal
    '#0ea5e9', // Sky
    '#64748b', // Slate
];

export const PRESET_ICONS = ['📁', '🗂️', '📂', '⭐', '💼', '📝', '🎯', '💡', '🔥', '🚀', '💎', '🎨'];
