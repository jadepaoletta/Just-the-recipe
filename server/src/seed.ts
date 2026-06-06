import { db } from './db';

export function seedIfEmpty() {
  const count = (db.prepare('SELECT COUNT(*) as c FROM recipes').get() as { c: number }).c;
  if (count > 0) return;

  const recipe = db.prepare(
    `INSERT INTO recipes (title, source_url, description, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(
    'Classic Chocolate Chip Cookies',
    'https://example.com/chocolate-chip-cookies',
    'Perfectly chewy chocolate chip cookies with crispy edges. A timeless family favorite that comes together in under 30 minutes.',
    'I like to chill the dough for an hour for thicker cookies.'
  );

  const id = recipe.lastInsertRowid as number;

  const ingredients = [
    { amount: '2.25', unit: 'cup', name: 'all-purpose flour' },
    { amount: '1', unit: 'tsp', name: 'baking soda' },
    { amount: '1', unit: 'tsp', name: 'salt' },
    { amount: '1', unit: 'cup', name: 'unsalted butter, softened (2 sticks)' },
    { amount: '0.75', unit: 'cup', name: 'granulated sugar' },
    { amount: '0.75', unit: 'cup', name: 'packed brown sugar' },
    { amount: '2', unit: '', name: 'large eggs' },
    { amount: '2', unit: 'tsp', name: 'vanilla extract' },
    { amount: '2', unit: 'cup', name: 'semi-sweet chocolate chips' },
  ];

  const insIng = db.prepare(
    `INSERT INTO ingredients (recipe_id, name, amount, unit, metric_amount, metric_unit, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const conversions: Record<string, { factor: number; metric: string }> = {
    cup: { factor: 240, metric: 'ml' },
    tsp: { factor: 5, metric: 'ml' },
  };

  ingredients.forEach((ing, i) => {
    const conv = conversions[ing.unit];
    let mAmt: string | null = null;
    let mUnit: string | null = null;
    if (conv && ing.amount) {
      mAmt = String(Math.round(parseFloat(ing.amount) * conv.factor));
      mUnit = conv.metric;
    }
    insIng.run(id, ing.name, ing.amount, ing.unit, mAmt, mUnit, i);
  });

  const steps = [
    'Preheat oven to 375°F (190°C). Line baking sheets with parchment paper.',
    'In a small bowl, whisk together flour, baking soda, and salt. Set aside.',
    'In a large bowl, beat butter, granulated sugar, and brown sugar together until light and fluffy, about 3–4 minutes.',
    'Add eggs one at a time, beating well after each addition. Mix in vanilla extract.',
    'Gradually stir in the flour mixture until just combined. Fold in chocolate chips.',
    'Drop rounded tablespoons of dough onto prepared baking sheets, spacing about 2 inches apart.',
    'Bake for 9–11 minutes, or until the edges are golden but the centers still look slightly underdone.',
    'Cool on baking sheets for 5 minutes before transferring to a wire rack. Enjoy!',
  ];

  const insStep = db.prepare(
    'INSERT INTO steps (recipe_id, instruction, order_index) VALUES (?, ?, ?)'
  );
  steps.forEach((s, i) => insStep.run(id, s, i));

  console.log('Seeded example recipe: Classic Chocolate Chip Cookies');
}
