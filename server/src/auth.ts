import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { db } from './db';

function readSecret(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const secretsPath = path.join(__dirname, '../../secrets.sh');
  try {
    const content = fs.readFileSync(secretsPath, 'utf-8');
    const match = content.match(new RegExp(`${name}="?([^"\\n]+)"?`));
    return match?.[1];
  } catch {
    return undefined;
  }
}

const GOOGLE_CLIENT_ID = readSecret('GOOGLE_CLIENT_ID');

if (!GOOGLE_CLIENT_ID) {
  console.warn('[auth] GOOGLE_CLIENT_ID not set. Add it to secrets.sh or env to enable Google sign-in.');
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export const SESSION_COOKIE = 'rm_session';
const SESSION_TTL_DAYS = 30;

export interface SessionUser {
  id: number;
  google_id: string;
  email: string;
  name: string;
  picture: string | null;
}

export function getGoogleClientId(): string | undefined {
  return GOOGLE_CLIENT_ID;
}

export async function verifyGoogleIdToken(idToken: string): Promise<{
  googleId: string; email: string; name: string; picture: string | null;
}> {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google sign-in is not configured on the server');
  const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw new Error('Invalid Google token payload');
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
    picture: payload.picture ?? null,
  };
}

export function upsertUserFromGoogle(p: {
  googleId: string; email: string; name: string; picture: string | null;
}): SessionUser {
  const existing = db.prepare('SELECT * FROM users WHERE google_id = ?').get(p.googleId) as SessionUser | undefined;
  if (existing) {
    db.prepare('UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?')
      .run(p.email, p.name, p.picture, existing.id);
    return { ...existing, email: p.email, name: p.name, picture: p.picture };
  }
  const isFirstUser = ((db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c) === 0;
  const result = db.prepare(
    'INSERT INTO users (google_id, email, name, picture) VALUES (?, ?, ?, ?)'
  ).run(p.googleId, p.email, p.name, p.picture);
  const userId = result.lastInsertRowid as number;

  // First user to sign in claims any pre-existing orphan recipes (legacy data migration).
  if (isFirstUser) {
    db.prepare('UPDATE recipes SET user_id = ? WHERE user_id IS NULL').run(userId);
  }

  return { id: userId, google_id: p.googleId, email: p.email, name: p.name, picture: p.picture };
}

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return token;
}

export function getUserBySession(token: string): SessionUser | null {
  const row = db.prepare(`
    SELECT u.* FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as SessionUser | undefined;
  return row ?? null;
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const user = getUserBySession(token);
  if (!user) {
    res.status(401).json({ error: 'Session expired' });
    return;
  }
  req.user = user;
  next();
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // dev only — set true behind HTTPS
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
