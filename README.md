# Recipe Manager

A local recipe manager that scrapes, stores, and lets you manage recipes from any blog URL.

## Stack

- **Frontend**: React 19 + Vite + TypeScript
- **Backend**: Express + TypeScript (port 3001)
- **Database**: SQLite via better-sqlite3
- **Scraping**: Cheerio (schema.org/Recipe + heuristic fallback), Playwright for JS-rendered pages
- **Images**: Downloaded locally to `data/images/`, served as static files

## Install & Run

```bash
# Install all dependencies (root + client + server)
npm run install:all

# Start both frontend and backend concurrently
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

## Features

- **Import recipes** — paste any blog URL; the app extracts title, description, ingredients, steps, and images via schema.org/Recipe structured data or heuristic CSS selectors
- **Unit conversion** — toggle between US and metric units per-recipe in real time
- **Edit recipes** — inline editing for title, ingredients (add/remove rows), steps, and notes
- **Notes** — auto-saves on blur/after typing stops
- **Image gallery** — photos downloaded on import; upload your own; delete any
- **Search** — filter the recipe list by title

## Project Structure

```
/
  client/        Vite React app
  server/        Express API + scraper
  data/
    recipes.db   SQLite database (created on first run)
    images/      Downloaded recipe images
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/recipes` | List all recipes |
| `GET` | `/api/recipes/:id` | Get full recipe |
| `POST` | `/api/recipes/import` | Scrape & import from URL |
| `PUT` | `/api/recipes/:id` | Update title/description/notes |
| `PUT` | `/api/recipes/:id/ingredients` | Replace ingredient list |
| `PUT` | `/api/recipes/:id/steps` | Replace steps list |
| `POST` | `/api/recipes/:id/images` | Upload image (multipart) |
| `DELETE` | `/api/recipes/:id/images/:imageId` | Delete image |
| `DELETE` | `/api/recipes/:id` | Delete recipe |
