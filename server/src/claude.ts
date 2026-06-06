import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

function getApiKey(): string {
  if (process.env.CLAUDE_API_KEY) return process.env.CLAUDE_API_KEY;
  // Read directly from secrets.sh so the server works without sourcing it first
  const secretsPath = path.join(__dirname, '../../secrets.sh');
  try {
    const content = fs.readFileSync(secretsPath, 'utf-8');
    const match = content.match(/CLAUDE_API_KEY="([^"]+)"/);
    if (match?.[1]) return match[1];
  } catch { /* file not found */ }
  throw new Error('CLAUDE_API_KEY not found in environment or secrets.sh');
}

const client = new Anthropic({ apiKey: getApiKey() });

export interface CleanedRecipe {
  title: string;
  description: string;
  ingredients: Array<{ amount: string; unit: string; name: string }>;
  steps: string[];
}

const SYSTEM_PROMPT = `You are a recipe data cleaner. You receive raw scraped recipe data (often messy, with SEO copy, HTML artifacts, and inconsistent formatting) and return a clean, well-structured JSON object.

Return ONLY valid JSON with this exact structure — no markdown fences, no explanation:
{
  "title": "...",
  "description": "...",
  "ingredients": [{"amount": "...", "unit": "...", "name": "..."}],
  "steps": ["...", "..."]
}

Rules:
- title: Remove site name suffixes like "| AllRecipes" or "- Food Network". Fix capitalization.
- description: Write a fresh 3-4 sentence summary based on the recipe's ingredients and steps. Describe what the dish is, its key flavors, and what makes it appealing. Do not copy the raw description verbatim.
- ingredients: Use friendly fractions (1/2 not 0.5, 1/4 not 0.25). Normalize units (cup, tablespoon, teaspoon, ounce, pound). Trim extra descriptors from names but keep meaningful ones (e.g. "finely chopped onion" is fine). Do not add or remove any ingredients.
- steps: Remove "Step N:" prefixes and numbered prefixes. Remove marketing or boilerplate sentences. Keep each instruction clear and concise. Do not add or remove any steps.`;

export async function cleanScrapedRecipe(raw: {
  title: string;
  description: string;
  ingredients: Array<{ amount: string; unit: string; name: string }>;
  steps: string[];
}): Promise<CleanedRecipe> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          title: raw.title,
          description: raw.description,
          ingredients: raw.ingredients,
          steps: raw.steps,
        }),
      },
    ],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude');

  // Strip markdown code fences if Claude includes them despite instructions
  const text = block.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text) as CleanedRecipe;
}

export interface AIImportedRecipe {
  title: string;
  description: string;
  ingredients: Array<{ amount: string; unit: string; name: string }>;
  steps: string[];
  imageUrls: string[];
}

const IMPORT_SYSTEM_PROMPT = `You are a recipe extractor. You will be given a URL to a recipe page. Use the web_fetch tool to retrieve the page, then extract the recipe and return it as JSON.

Return ONLY valid JSON with this exact structure — no markdown fences, no explanation, no commentary before or after:
{
  "title": "...",
  "description": "...",
  "ingredients": [{"amount": "...", "unit": "...", "name": "..."}],
  "steps": ["...", "..."],
  "imageUrls": ["https://...", "..."]
}

Rules:
- title: The recipe's name. Remove site-name suffixes like "| AllRecipes" or "- Food Network". Fix capitalization.
- description: A fresh 3–4 sentence summary describing what the dish is, its key flavors, and what makes it appealing. Do not copy SEO blurbs verbatim.
- ingredients: Use friendly fractions ("1/2" not "0.5"). Normalize units (cup, tablespoon, teaspoon, ounce, pound). Keep meaningful descriptors in name (e.g. "finely chopped onion"). Do not invent ingredients.
- steps: One instruction per array element. Remove "Step N:" prefixes, marketing fluff, and ads. Do not invent steps.
- imageUrls: Up to 5 absolute URLs to photos of the finished dish on the page. Exclude logos, author headshots, ads, and tiny thumbnails. If none found, return [].

If the page is not a recipe, or the fetch fails, return JSON with empty arrays and a title of "Unknown Recipe".`;

export async function importRecipeFromUrl(url: string): Promise<AIImportedRecipe> {
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8192,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    // web_fetch_20260209 + output_config are newer than the installed SDK's typings.
    tools: [{ type: 'web_fetch_20260209', name: 'web_fetch' }] as unknown as never,
    system: [
      {
        type: 'text',
        text: IMPORT_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Fetch and extract the recipe from this URL: ${url}`,
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  // Find the final text block (after any web_fetch tool blocks)
  const textBlocks = response.content.filter((b: Anthropic.ContentBlock) => b.type === 'text') as Array<Anthropic.TextBlock>;
  if (textBlocks.length === 0) {
    throw new Error('Claude returned no text content');
  }
  const raw = textBlocks[textBlocks.length - 1].text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let parsed: AIImportedRecipe;
  try {
    parsed = JSON.parse(raw) as AIImportedRecipe;
  } catch {
    throw new Error('Claude did not return valid JSON');
  }

  if (!parsed.title || parsed.title === 'Unknown Recipe') {
    throw new Error('Could not extract a recipe from that page');
  }
  return {
    title: parsed.title,
    description: parsed.description ?? '',
    ingredients: parsed.ingredients ?? [],
    steps: parsed.steps ?? [],
    imageUrls: parsed.imageUrls ?? [],
  };
}
