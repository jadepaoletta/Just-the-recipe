export interface Tag {
  id: number;
  name: string;
}

export interface Ingredient {
  id: number;
  recipe_id: number;
  name: string;
  amount: string;
  unit: string;
  metric_amount: string | null;
  metric_unit: string | null;
  order_index: number;
}

export interface Step {
  id: number;
  recipe_id: number;
  instruction: string;
  order_index: number;
}

export interface RecipeImage {
  id: number;
  recipe_id: number;
  local_path: string | null;
  original_url: string | null;
  caption: string | null;
  is_primary: number;
}

export interface Recipe {
  id: number;
  title: string;
  source_url: string | null;
  description: string | null;
  description_ai_generated: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  ingredients: Ingredient[];
  steps: Step[];
  images: RecipeImage[];
  tags: Tag[];
}

export interface RecipeListItem {
  id: number;
  title: string;
  source_url: string | null;
  description: string | null;
  created_at: string;
  primary_image: string | null;
  tags: Tag[];
}

export interface User {
  id: number;
  email: string;
  name: string;
  picture: string | null;
}
