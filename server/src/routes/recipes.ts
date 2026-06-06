import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { cleanScrapedRecipe, importRecipeFromUrl } from '../claude';
import { scrapeRecipe } from '../scraper';
import { downloadImage } from '../imageDownloader';
import { toMetric } from '../units';
import { requireAuth } from '../auth';

const router = Router();
const DATA_DIR = path.join(__dirname, '../../../data');

router.use(requireAuth);

function getFullRecipe(id: number, userId: number) {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(id, userId) as Record<string, unknown> | undefined;
  if (!recipe) return null;
  const ingredients = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY order_index').all(id);
  const steps = db.prepare('SELECT * FROM steps WHERE recipe_id = ? ORDER BY order_index').all(id);
  const images = db.prepare('SELECT * FROM images WHERE recipe_id = ? ORDER BY is_primary DESC, id ASC').all(id);
  return { ...recipe, ingredients, steps, images };
}

function ownsRecipe(id: number, userId: number): boolean {
  const row = db.prepare('SELECT 1 FROM recipes WHERE id = ? AND user_id = ?').get(id, userId);
  return Boolean(row);
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// GET /api/recipes — list current user's recipes
router.get('/', (req: Request, res: Response) => {
  const recipes = db.prepare(`
    SELECT r.*, i.local_path as primary_image
    FROM recipes r
    LEFT JOIN images i ON i.recipe_id = r.id AND i.is_primary = 1
    WHERE r.user_id = ?
    ORDER BY r.created_at DESC
  `).all(req.user!.id);
  res.json(recipes);
});

// GET /api/recipes/:id — single recipe (must belong to current user)
router.get('/:id', (req: Request, res: Response) => {
  const recipe = getFullRecipe(parseInt(req.params.id, 10), req.user!.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  res.json(recipe);
});

// POST /api/recipes/import
router.post('/import', async (req: Request, res: Response) => {
  const { url } = req.body as { url?: string };
  if (!url) return res.status(400).json({ error: 'url is required' });
  if (!isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL' });

  let scraped;
  try {
    scraped = await scrapeRecipe(url);
  } catch (err) {
    return res.status(422).json({ error: `Scraping failed: ${(err as Error).message}` });
  }

  let cleaned = { ...scraped, aiGenerated: false };
  try {
    const result = await cleanScrapedRecipe(scraped);
    cleaned = { ...scraped, ...result, imageUrls: scraped.imageUrls, aiGenerated: true };
  } catch { /* continue with raw scraped data */ }

  const insertRecipe = db.prepare(
    `INSERT INTO recipes (user_id, title, source_url, description, notes, description_ai_generated, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', ?, datetime('now'), datetime('now'))`
  );
  const recipeRow = insertRecipe.run(req.user!.id, cleaned.title, url, cleaned.description, cleaned.aiGenerated ? 1 : 0);
  const recipeId = recipeRow.lastInsertRowid as number;

  const insertIngredient = db.prepare(
    `INSERT INTO ingredients (recipe_id, name, amount, unit, metric_amount, metric_unit, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (let i = 0; i < cleaned.ingredients.length; i++) {
    const ing = cleaned.ingredients[i];
    const metric = toMetric(ing.amount, ing.unit);
    insertIngredient.run(
      recipeId, ing.name, ing.amount, ing.unit,
      metric?.metric_amount ?? null, metric?.metric_unit ?? null, i
    );
  }

  const insertStep = db.prepare(
    `INSERT INTO steps (recipe_id, instruction, order_index) VALUES (?, ?, ?)`
  );
  for (let i = 0; i < cleaned.steps.length; i++) {
    insertStep.run(recipeId, cleaned.steps[i], i);
  }

  if (scraped.imageUrls.length > 0) {
    const insertImage = db.prepare(
      `INSERT INTO images (recipe_id, local_path, original_url, is_primary) VALUES (?, ?, ?, ?)`
    );
    const imageDir = path.join(DATA_DIR, 'images', String(recipeId));
    fs.mkdirSync(imageDir, { recursive: true });

    const results = await Promise.allSettled(
      scraped.imageUrls.map((imgUrl, idx) =>
        downloadImage(imgUrl, recipeId).then((localPath) => ({ localPath, imgUrl, idx }))
      )
    );

    let primarySet = false;
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.localPath) {
        const isPrimary = !primarySet ? 1 : 0;
        insertImage.run(recipeId, r.value.localPath, r.value.imgUrl, isPrimary);
        primarySet = true;
      }
    }
  }

  res.status(201).json(getFullRecipe(recipeId, req.user!.id));
});

// POST /api/recipes/import-ai — fetch + extract via Claude (no local scraper)
router.post('/import-ai', async (req: Request, res: Response) => {
  const { url } = req.body as { url?: string };
  if (!url) return res.status(400).json({ error: 'url is required' });
  if (!isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL' });

  let extracted;
  try {
    extracted = await importRecipeFromUrl(url);
  } catch (err) {
    return res.status(422).json({ error: `AI import failed: ${(err as Error).message}` });
  }

  const insertRecipe = db.prepare(
    `INSERT INTO recipes (user_id, title, source_url, description, notes, description_ai_generated, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', 1, datetime('now'), datetime('now'))`
  );
  const recipeRow = insertRecipe.run(req.user!.id, extracted.title, url, extracted.description);
  const recipeId = recipeRow.lastInsertRowid as number;

  const insertIngredient = db.prepare(
    `INSERT INTO ingredients (recipe_id, name, amount, unit, metric_amount, metric_unit, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (let i = 0; i < extracted.ingredients.length; i++) {
    const ing = extracted.ingredients[i];
    const metric = toMetric(ing.amount, ing.unit);
    insertIngredient.run(
      recipeId, ing.name, ing.amount, ing.unit,
      metric?.metric_amount ?? null, metric?.metric_unit ?? null, i
    );
  }

  const insertStep = db.prepare(
    `INSERT INTO steps (recipe_id, instruction, order_index) VALUES (?, ?, ?)`
  );
  for (let i = 0; i < extracted.steps.length; i++) {
    insertStep.run(recipeId, extracted.steps[i], i);
  }

  if (extracted.imageUrls.length > 0) {
    const insertImage = db.prepare(
      `INSERT INTO images (recipe_id, local_path, original_url, is_primary) VALUES (?, ?, ?, ?)`
    );
    const imageDir = path.join(DATA_DIR, 'images', String(recipeId));
    fs.mkdirSync(imageDir, { recursive: true });

    const results = await Promise.allSettled(
      extracted.imageUrls.map((imgUrl) =>
        downloadImage(imgUrl, recipeId).then((localPath) => ({ localPath, imgUrl }))
      )
    );

    let primarySet = false;
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.localPath) {
        const isPrimary = !primarySet ? 1 : 0;
        insertImage.run(recipeId, r.value.localPath, r.value.imgUrl, isPrimary);
        primarySet = true;
      }
    }
  }

  res.status(201).json(getFullRecipe(recipeId, req.user!.id));
});

// POST /api/recipes — manual create
router.post('/', (req: Request, res: Response) => {
  const { title, source_url, description } = req.body as {
    title?: string; source_url?: string; description?: string;
  };
  if (!title) return res.status(400).json({ error: 'title is required' });

  const row = db.prepare(
    `INSERT INTO recipes (user_id, title, source_url, description, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', datetime('now'), datetime('now'))`
  ).run(req.user!.id, title, source_url ?? null, description ?? '');

  res.status(201).json(getFullRecipe(row.lastInsertRowid as number, req.user!.id));
});

// PUT /api/recipes/:id
router.put('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!ownsRecipe(id, req.user!.id)) return res.status(404).json({ error: 'Recipe not found' });
  const { title, description, notes } = req.body as {
    title?: string; description?: string; notes?: string;
  };
  db.prepare(
    `UPDATE recipes SET title = COALESCE(?, title), description = COALESCE(?, description),
     notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?`
  ).run(title ?? null, description ?? null, notes ?? null, id);
  res.json(getFullRecipe(id, req.user!.id));
});

// PUT /api/recipes/:id/ingredients — replace
router.put('/:id/ingredients', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!ownsRecipe(id, req.user!.id)) return res.status(404).json({ error: 'Recipe not found' });
  const { ingredients } = req.body as {
    ingredients: Array<{ name: string; amount?: string; unit?: string }>;
  };
  if (!Array.isArray(ingredients)) return res.status(400).json({ error: 'ingredients must be an array' });

  db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').run(id);
  const ins = db.prepare(
    `INSERT INTO ingredients (recipe_id, name, amount, unit, metric_amount, metric_unit, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i];
    const metric = toMetric(ing.amount ?? null, ing.unit ?? null);
    ins.run(id, ing.name, ing.amount ?? '', ing.unit ?? '',
      metric?.metric_amount ?? null, metric?.metric_unit ?? null, i);
  }
  db.prepare(`UPDATE recipes SET updated_at = datetime('now') WHERE id = ?`).run(id);
  res.json(getFullRecipe(id, req.user!.id));
});

// PUT /api/recipes/:id/steps — replace
router.put('/:id/steps', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!ownsRecipe(id, req.user!.id)) return res.status(404).json({ error: 'Recipe not found' });
  const { steps } = req.body as { steps: Array<{ instruction: string }> };
  if (!Array.isArray(steps)) return res.status(400).json({ error: 'steps must be an array' });

  db.prepare('DELETE FROM steps WHERE recipe_id = ?').run(id);
  const ins = db.prepare('INSERT INTO steps (recipe_id, instruction, order_index) VALUES (?, ?, ?)');
  for (let i = 0; i < steps.length; i++) {
    ins.run(id, steps[i].instruction, i);
  }
  db.prepare(`UPDATE recipes SET updated_at = datetime('now') WHERE id = ?`).run(id);
  res.json(getFullRecipe(id, req.user!.id));
});

// POST /api/recipes/:id/images — upload user photo
router.post('/:id/images', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!ownsRecipe(id, req.user!.id)) return res.status(404).json({ error: 'Recipe not found' });
  const dir = path.join(DATA_DIR, 'images', String(id));
  fs.mkdirSync(dir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
  });
  const up = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }).single('image');
  up(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const localPath = `/data/images/${id}/${req.file.filename}`;
    const isPrimary = db.prepare('SELECT COUNT(*) as c FROM images WHERE recipe_id = ?').get(id) as { c: number };
    const row = db.prepare(
      `INSERT INTO images (recipe_id, local_path, original_url, is_primary) VALUES (?, ?, '', ?)`
    ).run(id, localPath, isPrimary.c === 0 ? 1 : 0);
    res.status(201).json(db.prepare('SELECT * FROM images WHERE id = ?').get(row.lastInsertRowid));
  });
});

// DELETE /api/recipes/:id/images/:imageId
router.delete('/:id/images/:imageId', (req: Request, res: Response) => {
  const recipeId = parseInt(req.params.id, 10);
  if (!ownsRecipe(recipeId, req.user!.id)) return res.status(404).json({ error: 'Recipe not found' });
  const imageId = parseInt(req.params.imageId, 10);
  const image = db.prepare('SELECT * FROM images WHERE id = ? AND recipe_id = ?').get(imageId, recipeId) as
    { local_path: string; is_primary: number } | undefined;
  if (!image) return res.status(404).json({ error: 'Image not found' });

  if (image.local_path) {
    const filePath = path.join(DATA_DIR, image.local_path.replace('/data/', ''));
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
  db.prepare('DELETE FROM images WHERE id = ?').run(imageId);

  if (image.is_primary) {
    db.prepare('UPDATE images SET is_primary = 1 WHERE recipe_id = ? LIMIT 1').run(recipeId);
  }
  res.json({ ok: true });
});

// DELETE /api/recipes/:id
router.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!ownsRecipe(id, req.user!.id)) return res.status(404).json({ error: 'Recipe not found' });
  db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
  const dir = path.join(DATA_DIR, 'images', String(id));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  res.json({ ok: true });
});

export default router;
