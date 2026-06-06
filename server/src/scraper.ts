import * as cheerio from 'cheerio';
import https from 'https';
import http from 'http';

export interface ScrapedIngredient {
  name: string;
  amount: string;
  unit: string;
}

export interface ScrapedRecipe {
  title: string;
  description: string;
  ingredients: ScrapedIngredient[];
  steps: string[];
  imageUrls: string[];
}

async function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      },
      (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchHtml(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function parseAmountAndUnit(raw: string): { amount: string; unit: string; name: string } {
  // Try to extract amount + unit from the start of an ingredient string
  // e.g. "2 cups flour" -> amount=2, unit=cup, name=flour
  // e.g. "1/2 teaspoon salt" -> amount=0.5, unit=tsp, name=salt
  const patterns = [
    // fraction + unit + name
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s+(cups?|tbsp|tbs|tablespoons?|tsp|teaspoons?|fl\.?\s*oz\.?|fluid\s+ounces?|oz\.?|ounces?|lbs?|pounds?|g|kg|ml|l|liters?|litres?|pinch(?:es)?|dash(?:es)?|cloves?|slices?|pieces?|cans?|jars?|packages?|pkg|bunches?|sprigs?|heads?|stalks?)\s+(.+)/i,
    // number only + name (no unit)
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s+(.+)/i,
  ];

  for (const pat of patterns) {
    const m = raw.match(pat);
    if (m) {
      if (m.length === 4) {
        return { amount: parseFraction(m[1]), unit: m[2].replace(/\.$/, '').toLowerCase(), name: m[3].trim() };
      }
      if (m.length === 3) {
        return { amount: parseFraction(m[1]), unit: '', name: m[2].trim() };
      }
    }
  }
  return { amount: '', unit: '', name: raw.trim() };
}

function parseFraction(s: string): string {
  const parts = s.trim().split(/\s+/);
  if (parts.length === 2) {
    // mixed number like "1 1/2"
    const whole = parseFloat(parts[0]);
    const [n, d] = parts[1].split('/').map(Number);
    return String(whole + n / d);
  }
  if (s.includes('/')) {
    const [n, d] = s.split('/').map(Number);
    return String(n / d);
  }
  return s;
}

function extractSchemaOrg($: cheerio.CheerioAPI): ScrapedRecipe | null {
  // Look for JSON-LD with @type Recipe
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const raw = $(scripts[i]).html() || '';
      const data = JSON.parse(raw);
      const graphs: unknown[] = Array.isArray(data)
        ? data
        : data['@graph']
        ? data['@graph']
        : [data];

      for (const node of graphs) {
        const n = node as Record<string, unknown>;
        const type = n['@type'];
        const isRecipe =
          type === 'Recipe' ||
          (Array.isArray(type) && type.includes('Recipe'));
        if (!isRecipe) continue;

        const title = String(n.name || '').trim();
        const description = String(n.description || '').trim();

        // Ingredients
        const rawIngredients = (n.recipeIngredient as string[]) || [];
        const ingredients = rawIngredients.map((line) => {
          const { amount, unit, name } = parseAmountAndUnit(line);
          return { name, amount, unit };
        });

        // Steps
        const stepsRaw = n.recipeInstructions;
        const steps: string[] = [];
        if (Array.isArray(stepsRaw)) {
          for (const s of stepsRaw as unknown[]) {
            if (typeof s === 'string') {
              steps.push(s.trim());
            } else if (s && typeof s === 'object') {
              // HowToStep or HowToSection
              const sObj = s as Record<string, unknown>;
              if (sObj['@type'] === 'HowToSection' && Array.isArray(sObj.itemListElement)) {
                for (const sub of sObj.itemListElement as Record<string, unknown>[]) {
                  const text = String(sub.text || sub.name || '').trim();
                  if (text) steps.push(text);
                }
              } else {
                const text = String(sObj.text || sObj.name || '').trim();
                if (text) steps.push(text);
              }
            }
          }
        } else if (typeof stepsRaw === 'string') {
          steps.push(...stepsRaw.split('\n').map((s) => s.trim()).filter(Boolean));
        }

        // Images
        const imageUrls: string[] = [];
        const imgRaw = n.image;
        if (typeof imgRaw === 'string') imageUrls.push(imgRaw);
        else if (Array.isArray(imgRaw)) {
          for (const img of imgRaw as unknown[]) {
            if (typeof img === 'string') imageUrls.push(img);
            else if (img && typeof img === 'object') {
              const u = (img as Record<string, string>).url;
              if (u) imageUrls.push(u);
            }
          }
        } else if (imgRaw && typeof imgRaw === 'object') {
          const u = (imgRaw as Record<string, string>).url;
          if (u) imageUrls.push(u);
        }

        if (title && (ingredients.length > 0 || steps.length > 0)) {
          return { title, description, ingredients, steps, imageUrls };
        }
      }
    } catch {
      // malformed JSON-LD — skip
    }
  }
  return null;
}

function extractHeuristic($: cheerio.CheerioAPI, baseUrl: string): ScrapedRecipe {
  // Title
  const title =
    $('h1.recipe-title, h1.entry-title, h1.wprm-recipe-name, h1').first().text().trim() ||
    $('title').text().split('|')[0].trim() ||
    'Untitled Recipe';

  // Description
  const description =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('.recipe-description, .wprm-recipe-summary, .tasty-recipes-description')
      .first()
      .text()
      .trim() ||
    '';

  // Ingredients
  const ingredients: ScrapedIngredient[] = [];
  const ingredientSelectors = [
    '.wprm-recipe-ingredient',
    '.tasty-recipe-ingredients li',
    '.recipe-ingredients li',
    '[class*="ingredient"] li',
    '.ingredients li',
    '.ingredient-list li',
  ];
  for (const sel of ingredientSelectors) {
    $(sel).each((_, el) => {
      const text = $(el).text().trim();
      if (text) {
        const { amount, unit, name } = parseAmountAndUnit(text);
        ingredients.push({ name, amount, unit });
      }
    });
    if (ingredients.length > 0) break;
  }

  // Steps
  const steps: string[] = [];
  const stepSelectors = [
    '.wprm-recipe-instruction-text',
    '.tasty-recipe-instructions li',
    '.recipe-instructions li',
    '[class*="instruction"] li',
    '.instructions li',
    '.directions li',
    '.preparation li',
    '.steps li',
  ];
  for (const sel of stepSelectors) {
    $(sel).each((_, el) => {
      const text = $(el).text().trim();
      if (text) steps.push(text);
    });
    if (steps.length > 0) break;
  }

  // Images
  const imageUrls: string[] = [];
  const origin = new URL(baseUrl).origin;
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (!src) return;
    const w = parseInt($(el).attr('width') || '0', 10);
    const h = parseInt($(el).attr('height') || '0', 10);
    // Only include reasonably large images
    if ((w > 0 && w < 200) || (h > 0 && h < 200)) return;
    try {
      const abs = src.startsWith('http') ? src : `${origin}${src.startsWith('/') ? '' : '/'}${src}`;
      if (!imageUrls.includes(abs)) imageUrls.push(abs);
    } catch {
      // skip
    }
  });

  return { title, description, ingredients, steps, imageUrls: imageUrls.slice(0, 10) };
}

export async function scrapeRecipe(url: string): Promise<ScrapedRecipe> {
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    // Try Playwright fallback
    try {
      html = await playwrightFetch(url);
    } catch {
      throw new Error(`Failed to fetch page: ${(err as Error).message}`);
    }
  }

  const $ = cheerio.load(html);

  // Try schema.org first
  const schema = extractSchemaOrg($);
  if (schema) return schema;

  // Fall back to heuristics
  return extractHeuristic($, url);
}

async function playwrightFetch(url: string): Promise<string> {
  // Dynamically import Playwright so startup isn't blocked if it's not installed
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    return await page.content();
  } finally {
    await browser.close();
  }
}
