import { Router, Request, Response } from 'express';
import {
  verifyGoogleIdToken,
  upsertUserFromGoogle,
  createSession,
  deleteSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  getGoogleClientId,
  SESSION_COOKIE,
} from '../auth';

const router = Router();

// GET /api/auth/config — public; exposes the Google client ID so the SPA can initialise GSI.
router.get('/config', (_req: Request, res: Response) => {
  res.json({ googleClientId: getGoogleClientId() ?? null });
});

// POST /api/auth/google — exchange a Google ID token for a session cookie.
router.post('/google', async (req: Request, res: Response) => {
  const { credential } = req.body as { credential?: string };
  if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

  try {
    const profile = await verifyGoogleIdToken(credential);
    const user = upsertUserFromGoogle(profile);
    const token = createSession(user.id);
    setSessionCookie(res, token);
    res.json({ user: { id: user.id, email: user.email, name: user.name, picture: user.picture } });
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
  }
});

// GET /api/auth/me — current user, or 401.
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const u = req.user!;
  res.json({ user: { id: u.id, email: u.email, name: u.name, picture: u.picture } });
});

// POST /api/auth/logout — clear session.
router.post('/logout', (req: Request, res: Response) => {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (token) deleteSession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
