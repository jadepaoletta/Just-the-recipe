import type { Recipe, RecipeListItem, User } from './types';

const BASE = '/api/recipes';
const AUTH = '/api/auth';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const opts: RequestInit = { credentials: 'include' };
const jsonOpts = (method: string, body?: unknown): RequestInit => ({
  method,
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: body !== undefined ? JSON.stringify(body) : undefined,
});

export const api = {
  list(): Promise<RecipeListItem[]> {
    return fetch(BASE, opts).then((r) => handleResponse<RecipeListItem[]>(r));
  },

  get(id: number): Promise<Recipe> {
    return fetch(`${BASE}/${id}`, opts).then((r) => handleResponse<Recipe>(r));
  },

  import(url: string): Promise<Recipe> {
    return fetch(`${BASE}/import`, jsonOpts('POST', { url })).then((r) => handleResponse<Recipe>(r));
  },

  importAI(url: string): Promise<Recipe> {
    return fetch(`${BASE}/import-ai`, jsonOpts('POST', { url })).then((r) => handleResponse<Recipe>(r));
  },

  update(id: number, data: Partial<{ title: string; description: string; notes: string }>): Promise<Recipe> {
    return fetch(`${BASE}/${id}`, jsonOpts('PUT', data)).then((r) => handleResponse<Recipe>(r));
  },

  updateIngredients(id: number, ingredients: Array<{ name: string; amount?: string; unit?: string }>): Promise<Recipe> {
    return fetch(`${BASE}/${id}/ingredients`, jsonOpts('PUT', { ingredients })).then((r) => handleResponse<Recipe>(r));
  },

  updateSteps(id: number, steps: Array<{ instruction: string }>): Promise<Recipe> {
    return fetch(`${BASE}/${id}/steps`, jsonOpts('PUT', { steps })).then((r) => handleResponse<Recipe>(r));
  },

  uploadImage(id: number, file: File): Promise<{ id: number; local_path: string }> {
    const form = new FormData();
    form.append('image', file);
    return fetch(`${BASE}/${id}/images`, { method: 'POST', credentials: 'include', body: form })
      .then((r) => handleResponse<{ id: number; local_path: string }>(r));
  },

  deleteImage(recipeId: number, imageId: number): Promise<{ ok: boolean }> {
    return fetch(`${BASE}/${recipeId}/images/${imageId}`, { method: 'DELETE', credentials: 'include' })
      .then((r) => handleResponse<{ ok: boolean }>(r));
  },

  delete(id: number): Promise<{ ok: boolean }> {
    return fetch(`${BASE}/${id}`, { method: 'DELETE', credentials: 'include' })
      .then((r) => handleResponse<{ ok: boolean }>(r));
  },
};

export const authApi = {
  config(): Promise<{ googleClientId: string | null }> {
    return fetch(`${AUTH}/config`, opts).then((r) => handleResponse<{ googleClientId: string | null }>(r));
  },

  me(): Promise<{ user: User } | null> {
    return fetch(`${AUTH}/me`, opts).then(async (r) => {
      if (r.status === 401) return null;
      return handleResponse<{ user: User }>(r);
    });
  },

  signInWithGoogle(credential: string): Promise<{ user: User }> {
    return fetch(`${AUTH}/google`, jsonOpts('POST', { credential })).then((r) => handleResponse<{ user: User }>(r));
  },

  logout(): Promise<{ ok: boolean }> {
    return fetch(`${AUTH}/logout`, jsonOpts('POST')).then((r) => handleResponse<{ ok: boolean }>(r));
  },
};
