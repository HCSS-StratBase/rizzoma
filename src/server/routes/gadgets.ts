import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { noStore } from '../middleware/noStore.js';
import { getDoc, insertDoc, updateDoc } from '../lib/couch.js';

const router = Router();

// Hard Gap #20 (2026-04-13): notes-scratchpad is the fourth real preview
// app — same host-bridge contract as kanban/planner/focus but with a
// free-form text + checkbox data shape to prove the shell generalizes.
const PREVIEW_APP_IDS = ['kanban-board', 'calendar-planner', 'focus-timer', 'notes-scratchpad'] as const;
const ALL_APP_IDS = [...PREVIEW_APP_IDS, 'github-workbench'] as const;
const VALID_APP_IDS = new Set<string>(ALL_APP_IDS);

interface GadgetPreferencesDoc {
  _id: string;
  _rev?: string;
  type: 'gadget_preferences';
  userId: string;
  installedAppIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface GadgetPreferencesResponse {
  schemaVersion: 1;
  scope: 'user';
  defaultInstalledAppIds: string[];
  installedAppIds: string[];
}

const prefsDocId = (userId: string) => `gadget_prefs:${userId}`;

function sanitizeInstalledAppIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [...PREVIEW_APP_IDS];
  return Array.from(
    new Set(value.filter((entry): entry is string => typeof entry === 'string' && VALID_APP_IDS.has(entry)))
  );
}

function buildResponse(installedAppIds: unknown): GadgetPreferencesResponse {
  return {
    schemaVersion: 1,
    scope: 'user',
    defaultInstalledAppIds: [...PREVIEW_APP_IDS],
    installedAppIds: sanitizeInstalledAppIds(installedAppIds),
  };
}

// noStore: per-user gadget install list
router.get('/preferences', noStore, requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const doc = await getDoc<GadgetPreferencesDoc>(prefsDocId(userId));
    res.json(buildResponse(doc.installedAppIds));
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.json(buildResponse(PREVIEW_APP_IDS));
      return;
    }
    res.status(500).json({ error: e?.message || 'gadget_preferences_error' });
  }
});

router.patch('/preferences', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const installedAppIds = req.body?.reset === true
    ? [...PREVIEW_APP_IDS]
    : sanitizeInstalledAppIds(req.body?.installedAppIds);

  try {
    const existing = await getDoc<GadgetPreferencesDoc & { _rev: string }>(prefsDocId(userId));
    const updated: GadgetPreferencesDoc & { _rev: string } = {
      ...existing,
      installedAppIds,
      updatedAt: Date.now(),
    };
    await updateDoc(updated);
    res.json(buildResponse(updated.installedAppIds));
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      const now = Date.now();
      const newDoc: GadgetPreferencesDoc = {
        _id: prefsDocId(userId),
        type: 'gadget_preferences',
        userId,
        installedAppIds,
        createdAt: now,
        updatedAt: now,
      };
      await insertDoc(newDoc);
      res.json(buildResponse(newDoc.installedAppIds));
      return;
    }
    res.status(500).json({ error: e?.message || 'gadget_preferences_update_error' });
  }
});

export default router;
