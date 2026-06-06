import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import recipesRouter from './routes/recipes';
import authRouter from './routes/auth';
import { seedIfEmpty } from './seed';

const app = express();
const PORT = 3001;
const DATA_DIR = path.join(__dirname, '../../data');

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/data/images', express.static(path.join(DATA_DIR, 'images')));

app.use('/api/auth', authRouter);
app.use('/api/recipes', recipesRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

fs.mkdirSync(path.join(DATA_DIR, 'images', 'uploads'), { recursive: true });

seedIfEmpty();

app.listen(PORT, () => {
  console.log(`Recipe Manager API running on http://localhost:${PORT}`);
});
