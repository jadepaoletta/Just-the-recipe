import { useState, useRef, useEffect } from 'react';
import { api } from '../api';
import type { Recipe } from '../types';

type Mode = 'scrape' | 'ai';

interface Props {
  onClose: () => void;
  onImported: (recipe: Recipe) => void;
}

export function ImportModal({ onClose, onImported }: Props) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<Mode>('scrape');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    try {
      const recipe = mode === 'ai' ? await api.importAI(trimmed) : await api.import(trimmed);
      onImported(recipe);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>📥 Import Recipe</h2>
        <p>Paste a URL from any recipe blog. Use AI mode for sites that block the scraper.</p>

        <div className="mode-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'scrape'}
            className={`mode-toggle-btn ${mode === 'scrape' ? 'is-active' : ''}`}
            onClick={() => setMode('scrape')}
            disabled={loading}
          >
            <span className="mode-toggle-title">Scraper</span>
            <span className="mode-toggle-sub">Fast · free</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'ai'}
            className={`mode-toggle-btn ${mode === 'ai' ? 'is-active' : ''}`}
            onClick={() => setMode('ai')}
            disabled={loading}
          >
            <span className="mode-toggle-title">✨ AI extract</span>
            <span className="mode-toggle-sub">Claude reads the page directly</span>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="modal-input"
            type="url"
            placeholder="https://www.seriouseats.com/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
          />
          {error && <div className="modal-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !url.trim()}>
              {loading ? (
                <>
                  <span className="loading-spinner" />
                  {mode === 'ai' ? 'Asking Claude…' : 'Importing…'}
                </>
              ) : (
                mode === 'ai' ? 'Import with AI' : 'Import Recipe'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
