import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import type { Recipe, Ingredient, Step, RecipeImage } from '../types';

type UnitMode = 'us' | 'metric';

function formatAmount(ing: Ingredient, mode: UnitMode): string {
  if (mode === 'metric' && ing.metric_amount && ing.metric_unit) {
    return `${ing.metric_amount} ${ing.metric_unit}`;
  }
  const parts = [ing.amount, ing.unit].filter(Boolean);
  return parts.join(' ');
}

function sourceDomain(url: string | null): string {
  if (!url) return '';
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Edit: Ingredients ────────────────────────────────────────────────────────

interface EditIngredient { amount: string; unit: string; name: string; }

function IngredientsEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Ingredient[];
  onSave: (rows: EditIngredient[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<EditIngredient[]>(
    initial.map((i) => ({ amount: i.amount, unit: i.unit, name: i.name }))
  );
  const [saving, setSaving] = useState(false);

  function update(idx: number, field: keyof EditIngredient, val: string) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [field]: val } : row)));
  }
  function remove(idx: number) { setRows((r) => r.filter((_, i) => i !== idx)); }
  function add() { setRows((r) => [...r, { amount: '', unit: '', name: '' }]); }

  async function save() {
    setSaving(true);
    try { await onSave(rows.filter((r) => r.name.trim())); }
    finally { setSaving(false); }
  }

  return (
    <div>
      {rows.map((row, i) => (
        <div key={i} className="edit-row">
          <span className="edit-row-handle">⠿</span>
          <input
            className="edit-ingredient-amount"
            placeholder="Amount"
            value={row.amount}
            onChange={(e) => update(i, 'amount', e.target.value)}
          />
          <input
            className="edit-ingredient-unit"
            placeholder="Unit"
            value={row.unit}
            onChange={(e) => update(i, 'unit', e.target.value)}
          />
          <input
            className="edit-ingredient-name"
            placeholder="Ingredient name"
            value={row.name}
            onChange={(e) => update(i, 'name', e.target.value)}
          />
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(i)} title="Remove">✕</button>
        </div>
      ))}
      <button className="add-row-btn" onClick={add}>+ Add ingredient</button>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? <span className="loading-spinner" /> : 'Save'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Edit: Steps ──────────────────────────────────────────────────────────────

function StepsEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Step[];
  onSave: (rows: { instruction: string }[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState(initial.map((s) => ({ instruction: s.instruction })));
  const [saving, setSaving] = useState(false);

  function update(idx: number, val: string) {
    setRows((r) => r.map((row, i) => (i === idx ? { instruction: val } : row)));
  }
  function remove(idx: number) { setRows((r) => r.filter((_, i) => i !== idx)); }
  function add() { setRows((r) => [...r, { instruction: '' }]); }

  async function save() {
    setSaving(true);
    try { await onSave(rows.filter((r) => r.instruction.trim())); }
    finally { setSaving(false); }
  }

  return (
    <div>
      {rows.map((row, i) => (
        <div key={i} className="edit-row">
          <span className="step-edit-index">{i + 1}.</span>
          <textarea
            className="edit-step-instruction"
            value={row.instruction}
            onChange={(e) => update(i, e.target.value)}
            rows={2}
          />
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(i)} title="Remove">✕</button>
        </div>
      ))}
      <button className="add-row-btn" onClick={add}>+ Add step</button>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? <span className="loading-spinner" /> : 'Save'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main detail page ─────────────────────────────────────────────────────────

export function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [unitMode, setUnitMode] = useState<UnitMode>('us');

  // Edit state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingIngredients, setEditingIngredients] = useState(false);
  const [editingSteps, setEditingSteps] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const saveNotesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    api.get(parseInt(id, 10))
      .then((r) => { setRecipe(r); setNotes(r.notes ?? ''); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [id]);

  // Auto-save notes on blur / after typing stops
  const saveNotes = useCallback(async (value: string) => {
    if (!recipe) return;
    try {
      const updated = await api.update(recipe.id, { notes: value });
      setRecipe(updated);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch { /* ignore */ }
  }, [recipe]);

  function handleNotesChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setNotes(val);
    if (saveNotesTimer.current) clearTimeout(saveNotesTimer.current);
    saveNotesTimer.current = setTimeout(() => saveNotes(val), 1200);
  }

  async function saveTitle() {
    if (!recipe || !titleDraft.trim()) { setEditingTitle(false); return; }
    const updated = await api.update(recipe.id, { title: titleDraft });
    setRecipe(updated);
    setEditingTitle(false);
  }

  async function saveIngredients(rows: EditIngredient[]) {
    if (!recipe) return;
    const updated = await api.updateIngredients(recipe.id, rows);
    setRecipe(updated);
    setEditingIngredients(false);
  }

  async function saveSteps(rows: { instruction: string }[]) {
    if (!recipe) return;
    const updated = await api.updateSteps(recipe.id, rows);
    setRecipe(updated);
    setEditingSteps(false);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!recipe || !e.target.files?.[0]) return;
    try {
      await api.uploadImage(recipe.id, e.target.files[0]);
      const updated = await api.get(recipe.id);
      setRecipe(updated);
    } catch (err) {
      alert((err as Error).message);
    }
    e.target.value = '';
  }

  async function handleDeleteImage(img: RecipeImage) {
    if (!recipe) return;
    if (!confirm('Delete this image?')) return;
    await api.deleteImage(recipe.id, img.id);
    const updated = await api.get(recipe.id);
    setRecipe(updated);
  }

  async function handleDeleteRecipe() {
    if (!recipe) return;
    if (!confirm(`Delete "${recipe.title}"? This cannot be undone.`)) return;
    await api.delete(recipe.id);
    navigate('/');
  }

  if (loading) {
    return (
      <div className="page-loading">
        <span className="loading-spinner loading-spinner-dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="detail-page" style={{ paddingTop: 48 }}>
        <div className="empty-state">
          <div className="empty-state-icon">😕</div>
          <h2>Recipe not found</h2>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-flex' }}>← Back</Link>
        </div>
      </div>
    );
  }

  const hasMetric = recipe.ingredients.some((i) => i.metric_amount);

  return (
    <div>

      <div className="detail-page">
        {/* Header */}
        <div className="detail-header">
          <div className="detail-breadcrumb">
            <Link to="/">My Recipes</Link>
            <span>›</span>
            <span>{recipe.title}</span>
          </div>

          <div className="detail-title-row">
            {editingTitle ? (
              <input
                autoFocus
                className="detail-title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              />
            ) : (
              <h1 className="detail-title">{recipe.title}</h1>
            )}
          </div>

          <div className="detail-meta">
            {recipe.source_url && (
              <a href={recipe.source_url} target="_blank" rel="noopener noreferrer">
                🔗 {sourceDomain(recipe.source_url)}
              </a>
            )}
            <span>Saved {formatDate(recipe.created_at)}</span>
          </div>

          {recipe.description && (
            <div className="detail-description-wrap">
              <p className="detail-description">{recipe.description}</p>
              {recipe.description_ai_generated === 1 && (
                <span className="ai-badge">✦ AI</span>
              )}
            </div>
          )}

          <div className="detail-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setTitleDraft(recipe.title); setEditingTitle(true); }}
            >
              ✏️ Edit title
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setEditingIngredients(!editingIngredients)}
            >
              ✏️ Edit ingredients
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setEditingSteps(!editingSteps)}
            >
              ✏️ Edit steps
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-danger btn-sm" onClick={handleDeleteRecipe}>
              🗑 Delete
            </button>
          </div>
        </div>

        {/* Ingredients */}
        <div className="detail-section">
          <div className="detail-section-title">
            Ingredients
            {hasMetric && !editingIngredients && (
              <div className="unit-toggle">
                <button
                  className={`unit-toggle-btn${unitMode === 'us' ? ' active' : ''}`}
                  onClick={() => setUnitMode('us')}
                >
                  US
                </button>
                <button
                  className={`unit-toggle-btn${unitMode === 'metric' ? ' active' : ''}`}
                  onClick={() => setUnitMode('metric')}
                >
                  Metric
                </button>
              </div>
            )}
          </div>

          {editingIngredients ? (
            <IngredientsEditor
              initial={recipe.ingredients}
              onSave={saveIngredients}
              onCancel={() => setEditingIngredients(false)}
            />
          ) : recipe.ingredients.length > 0 ? (
            <ul className="ingredient-list">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id} className="ingredient-item">
                  <span className="ingredient-amount">{formatAmount(ing, unitMode)}</span>
                  <span className="ingredient-name">{ing.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No ingredients yet.{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingIngredients(true)}>Add some →</button>
            </p>
          )}
        </div>

        {/* Steps */}
        <div className="detail-section">
          <div className="detail-section-title">Instructions</div>

          {editingSteps ? (
            <StepsEditor
              initial={recipe.steps}
              onSave={saveSteps}
              onCancel={() => setEditingSteps(false)}
            />
          ) : recipe.steps.length > 0 ? (
            <ol className="steps-list">
              {recipe.steps.map((step, i) => (
                <li key={step.id} className="step-item">
                  <span className="step-num">{i + 1}</span>
                  <span>{step.instruction}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No instructions yet.{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingSteps(true)}>Add some →</button>
            </p>
          )}
        </div>

        {/* Notes */}
        <div className="detail-section">
          <div className="detail-section-title">
            Notes
            {notesSaved && <span className="save-indicator saved">✓ Saved</span>}
          </div>
          <textarea
            className="notes-textarea"
            placeholder="Add your personal notes, substitutions, tips…"
            value={notes}
            onChange={handleNotesChange}
            onBlur={() => { if (saveNotesTimer.current) clearTimeout(saveNotesTimer.current); saveNotes(notes); }}
          />
        </div>

        {/* Images */}
        <div className="detail-section">
          <div className="detail-section-title">Photos</div>
          {recipe.images.length > 0 && (
            <div className="gallery" style={{ marginBottom: 16 }}>
              {recipe.images.map((img) => (
                <div key={img.id} className="gallery-item">
                  <img src={img.local_path ?? img.original_url ?? ''} alt="" loading="lazy" />
                  <button
                    className="gallery-item-del"
                    onClick={() => handleDeleteImage(img)}
                    title="Delete image"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageUpload}
          />
          <div
            className="upload-zone"
            onClick={() => fileInputRef.current?.click()}
          >
            📸 Click to upload a photo
          </div>
        </div>
      </div>
    </div>
  );
}
