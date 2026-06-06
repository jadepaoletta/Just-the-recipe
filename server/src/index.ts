import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import recipesRouter from './routes/recipes';
import authRouter from './routes/auth';
import { seedIfEmpty } from './seed';

const app = express();
const PORT = process.env.PORT ?? 3001;
const DATA_DIR = path.join(__dirname, '../../data');

const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/data/images', express.static(path.join(DATA_DIR, 'images')));

app.use('/api/auth', authRouter);
app.use('/api/recipes', recipesRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

// Serve the built client in production
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

fs.mkdirSync(path.join(DATA_DIR, 'images', 'uploads'), { recursive: true });

seedIfEmpty();

app.listen(PORT, () => {
  console.log(`Recipe Manager API running on http://localhost:${PORT}`);
});
