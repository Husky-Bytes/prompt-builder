import { useRef, useState } from 'react';
import { BlockManager } from './components/BlockManager';
import { PromptBuilder } from './components/PromptBuilder';
import { PromptLibrary } from './components/PromptLibrary';
import { useStore } from './store';

function App() {
  const [activeTab, setActiveTab] = useState<'blocks' | 'builder' | 'library'>('builder');
  const [dataMessage, setDataMessage] = useState('');
  const [viewRevision, setViewRevision] = useState(0);
  const importInput = useRef<HTMLInputElement>(null);
  const { setEditPromptId, setBuilderState, prompts, exportData, importData, clearAllData, storageError } = useStore();

  const handleClearAll = () => {
    if (confirm('Clear ALL blocks, prompts, folders and your draft? To keep your draft, save it to Library first, then export a backup.')) {
      clearAllData();
      setViewRevision(revision => revision + 1);
      setDataMessage('All data cleared.');
    }
  };

  const handleExport = () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prompt-builder-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Let mobile browsers start the download before releasing the URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDataMessage('Backup download requested.');
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !confirm('Replace your current data and clear your draft? To keep your draft, save it to Library first, then export your current data.')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && importData(reader.result)) {
        setViewRevision(revision => revision + 1);
        setDataMessage('Backup imported successfully.');
      } else {
        setDataMessage('Could not import this backup. Check the JSON file and try again.');
      }
    };
    reader.onerror = () => setDataMessage('Could not read this file. Please try again.');
    reader.readAsText(file);
  };

  const handleEdit = (id: string) => {
    const prompt = prompts.find(item => item.id === id);
    if (!prompt) return;
    setEditPromptId(id);
    setBuilderState({ title: prompt.title, segments: prompt.segments, rating: prompt.rating, notes: prompt.notes, folderId: prompt.folderId });
    setActiveTab('builder');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <div className="app-brand">
          <h1>Prompt Builder</h1>
          <p className="text-muted">Fine-tune your prompts using modular blocks.</p>
        </div>
        <details className="backup-menu">
          <summary>Data &amp; backup</summary>
          <p className="backup-hint">Backups contain saved blocks, prompts and folders. Save your draft to Library first.</p>
          <div className="backup-actions">
            <button onClick={handleExport} className="btn btn-secondary">Export</button>
            <button onClick={() => importInput.current?.click()} className="btn btn-secondary">Import</button>
            <button onClick={handleClearAll} className="btn btn-danger">Reset all</button>
            <input ref={importInput} type="file" accept=".json,application/json" aria-label="Import backup file" onChange={handleImport} hidden />
          </div>
        </details>
      </header>
      {storageError && <p className="app-status app-error" role="alert">{storageError}</p>}
      {dataMessage && <p className="app-status" role="status">{dataMessage}</p>}
      <nav className="app-nav" aria-label="Main navigation">
        {(['blocks', 'builder', 'library'] as const).map(tab => (
          <button key={tab} className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
            aria-current={activeTab === tab ? 'page' : undefined}
            onClick={() => { setActiveTab(tab); window.scrollTo({ top: 0, behavior: 'instant' }); }}>
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>
      <main key={viewRevision} id="main-content" className="app-content" tabIndex={-1}>
        {activeTab === 'blocks' && <BlockManager />}
        {activeTab === 'builder' && <PromptBuilder />}
        {activeTab === 'library' && <PromptLibrary onEdit={handleEdit} />}
      </main>
    </div>
  );
}

export default App;
