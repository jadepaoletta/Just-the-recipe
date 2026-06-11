import { useState, useRef, useEffect } from 'react';
import { api } from '../api';
import type { Recipe, Tag } from '../types';

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
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    api.listTags().then(setAllTags).catch(() => {});
  }, []);

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed || tagNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setTagInput('');
      setTagDropdownOpen(false);
      return;
    }
    setTagNames((prev) => [...prev, trimmed]);
    setTagInput('');
    setTagDropdownOpen(false);
  }

  function removeTag(name: string) {
    setTagNames((prev) => prev.filter((n) => n !== name));
  }

  const tagSuggestions = allTags.filter(
    (t) =>
      t.name.toLowerCase().includes(tagInput.toLowerCase()) &&
      !tagNames.some((n) => n.toLowerCase() === t.name.toLowerCase())
  );
  const showCreate =
    tagInput.trim().length > 0 &&
    !tagSuggestions.some((s) => s.name.toLowerCase() === tagInput.trim().toLowerCase()) &&
    !tagNames.some((n) => n.toLowerCase() === tagInput.trim().toLowerCase());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    try {
      let recipe = mode === 'ai' ? await api.importAI(trimmed) : await api.import(trimmed);
      if (tagNames.length > 0) {
        recipe = await api.updateTags(recipe.id, tagNames);
      }
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
          <div className="modal-tag-section">
            <div className="modal-tag-input-row">
              {tagNames.map((name) => (
                <span key={name} className="tag-pill">
                  {name}
                  <button type="button" className="tag-pill-remove" onClick={() => removeTag(name)}>✕</button>
                </span>
              ))}
              <div className="tag-input-wrap">
                <input
                  className="tag-input"
                  type="text"
                  value={tagInput}
                  placeholder={tagNames.length === 0 ? 'Add tags…' : 'Add another…'}
                  disabled={loading}
                  onChange={(e) => { setTagInput(e.target.value); setTagDropdownOpen(true); }}
                  onFocus={() => setTagDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setTagDropdownOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); }
                    if (e.key === 'Escape') { setTagInput(''); setTagDropdownOpen(false); }
                  }}
                />
                {tagDropdownOpen && (tagSuggestions.length > 0 || showCreate) && (
                  <div className="tag-suggestions">
                    {tagSuggestions.map((s) => (
                      <div key={s.id} className="tag-suggestion" onMouseDown={() => addTag(s.name)}>
                        {s.name}
                      </div>
                    ))}
                    {showCreate && (
                      <div className="tag-suggestion tag-suggestion-create" onMouseDown={() => addTag(tagInput)}>
                        Create "{tagInput.trim()}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

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
