import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { RecipeListItem, Recipe } from '../types';
import { ImportModal } from '../components/ImportModal';

function sourceDomain(url: string | null): string {
  if (!url) return '';
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function RecipeList() {
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.list().then((r) => { setRecipes(r); setLoading(false); }).catch(console.error);
  }, []);

  function handleImported(recipe: Recipe) {
    setShowImport(false);
    navigate(`/recipes/${recipe.id}`);
  }

  const filtered = recipes.filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="list-page">
      <div className="list-header">
        <h1>My Recipes</h1>
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            type="search"
            placeholder="Search recipes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="topbar-spacer" />
        <button className="btn btn-primary" onClick={() => setShowImport(true)}>
          + Import Recipe
        </button>
      </div>

      {loading ? (
        <div className="page-loading">
          <span className="loading-spinner loading-spinner-dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🍳</div>
          {search ? (
            <>
              <h2>No recipes match "{search}"</h2>
              <p>Try a different search term.</p>
            </>
          ) : (
            <>
              <h2>No recipes yet</h2>
              <p>Import your first recipe from any blog URL.</p>
              <button className="btn btn-primary" onClick={() => setShowImport(true)}>
                + Import your first recipe
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="recipe-grid">
          {filtered.map((recipe) => (
            <div
              key={recipe.id}
              className="recipe-card"
              onClick={() => navigate(`/recipes/${recipe.id}`)}
            >
              <div className="card-img-wrap">
                {recipe.primary_image ? (
                  <img src={recipe.primary_image} alt={recipe.title} loading="lazy" />
                ) : (
                  <div className="card-img-placeholder">🍽️</div>
                )}
              </div>
              <div className="card-body">
                <div className="card-title">{recipe.title}</div>
                <div className="card-meta">
                  {sourceDomain(recipe.source_url) && (
                    <span className="card-source" title={recipe.source_url ?? ''}>
                      🔗 {sourceDomain(recipe.source_url)}
                    </span>
                  )}
                  <span className="card-date">{formatDate(recipe.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={handleImported} />
      )}
    </div>
  );
}
