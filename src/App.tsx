import { useState } from 'react';
import { BlockManager } from './components/BlockManager';
import { PromptBuilder } from './components/PromptBuilder';
import { PromptLibrary } from './components/PromptLibrary';
import { useStore } from './store';

function App() {
  const [activeTab, setActiveTab] = useState<'blocks' | 'builder' | 'library'>('builder');
  const { setEditPromptId, setBuilderState, prompts, exportData, importData, clearAllData } = useStore();

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear ALL data? This will delete all blocks, prompts, and folders!')) {
      clearAllData();
      alert('Application reset to brand new state.');
      window.location.reload();
    }
  };

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');
    a.download = `prompt-builder-backup-${dateStr}-${timeStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content && importData(content)) {
        alert('Data imported successfully!');
        window.location.reload(); // Reload to refresh state cleanly
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleEdit = (id: string) => {
    const promptToEdit = prompts.find(p => p.id === id);
    if (promptToEdit) {
      setEditPromptId(id);
      setBuilderState({
        title: promptToEdit.title,
        segments: promptToEdit.segments,
        rating: promptToEdit.rating,
        notes: promptToEdit.notes,
        folderId: promptToEdit.folderId
      });
      setActiveTab('builder');
    }
  };

  return (
    <div className="container">
      <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', color: 'var(--primary)', margin: 0 }}>Prompt Builder</h1>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.4rem' }}>
            <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>Fine-tune your prompts using modular blocks.</p>
            <div style={{
              display: 'flex',
              gap: '0.25rem',
              background: '#f1f5f9',
              padding: '0.2rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}>
              <button
                onClick={handleExport}
                className="btn-icon"
                title="Export Backup"
                style={{ fontSize: '0.85rem', padding: '0.25rem 0.6rem', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem', borderRadius: '6px' }}
              >
                <span>📤</span> <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Export</span>
              </button>
              <label
                className="btn-icon"
                title="Import Backup"
                style={{
                  fontSize: '0.85rem',
                  padding: '0.25rem 0.6rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  borderRadius: '6px',
                  margin: 0
                }}
              >
                <span>📥</span> <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Import</span>
                <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
              </label>
              <button
                onClick={handleClearAll}
                className="btn-icon"
                title="Clear Everything"
                style={{
                  fontSize: '0.85rem',
                  padding: '0.25rem 0.6rem',
                  height: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  borderRadius: '6px',
                  color: 'var(--danger)'
                }}
              >
                <span>🗑️</span> <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Reset</span>
              </button>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn ${activeTab === 'blocks' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('blocks')}
          >
            Blocks
          </button>
          <button
            className={`btn ${activeTab === 'builder' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('builder')}
          >
            Builder
          </button>
          <button
            className={`btn ${activeTab === 'library' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('library')}
          >
            Library
          </button>
        </div>
      </header>

      <div style={{ background: 'white', padding: '2rem', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)' }}>
        {activeTab === 'blocks' && <BlockManager />}
        {activeTab === 'builder' && <PromptBuilder />}
        {activeTab === 'library' && <PromptLibrary onEdit={handleEdit} />}
      </div>
    </div>
  )
}

export default App
