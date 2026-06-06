// US volume/weight to metric conversions
const CONVERSIONS: Record<string, { factor: number; metric: string }> = {
  cup:        { factor: 240,  metric: 'ml' },
  cups:       { factor: 240,  metric: 'ml' },
  tablespoon: { factor: 15,   metric: 'ml' },
  tablespoons:{ factor: 15,   metric: 'ml' },
  tbsp:       { factor: 15,   metric: 'ml' },
  tbs:        { factor: 15,   metric: 'ml' },
  teaspoon:   { factor: 5,    metric: 'ml' },
  teaspoons:  { factor: 5,    metric: 'ml' },
  tsp:        { factor: 5,    metric: 'ml' },
  'fl oz':    { factor: 30,   metric: 'ml' },
  'fluid oz': { factor: 30,   metric: 'ml' },
  'fluid ounce': { factor: 30, metric: 'ml' },
  'fluid ounces':{ factor: 30, metric: 'ml' },
  oz:         { factor: 28,   metric: 'g' },
  ounce:      { factor: 28,   metric: 'g' },
  ounces:     { factor: 28,   metric: 'g' },
  lb:         { factor: 454,  metric: 'g' },
  lbs:        { factor: 454,  metric: 'g' },
  pound:      { factor: 454,  metric: 'g' },
  pounds:     { factor: 454,  metric: 'g' },
};

export interface MetricResult {
  metric_amount: string;
  metric_unit: string;
}

export function toMetric(amount: string | null, unit: string | null): MetricResult | null {
  if (!amount || !unit) return null;
  const key = unit.toLowerCase().trim();
  const conv = CONVERSIONS[key];
  if (!conv) return null;

  const num = parseFloat(amount);
  if (isNaN(num)) return null;

  const result = num * conv.factor;
  // Round nicely
  const rounded = result < 10
    ? Math.round(result * 10) / 10
    : Math.round(result);

  return {
    metric_amount: String(rounded),
    metric_unit: conv.metric,
  };
}

export function normalizeUnit(raw: string): string {
  const map: Record<string, string> = {
    c: 'cup', cups: 'cup',
    tbsp: 'tbsp', tbs: 'tbsp', tablespoons: 'tbsp', tablespoon: 'tbsp',
    tsp: 'tsp', teaspoons: 'tsp', teaspoon: 'tsp',
    'fl oz': 'fl oz', 'fluid oz': 'fl oz', 'fluid ounces': 'fl oz',
    ounces: 'oz', ounce: 'oz',
    pounds: 'lb', lbs: 'lb', pound: 'lb',
  };
  return map[raw.toLowerCase().trim()] ?? raw;
}
