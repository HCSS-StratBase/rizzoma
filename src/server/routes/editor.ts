import { Router } from 'express';

// Feature flag: set EDITOR_ENABLE=1 to enable endpoints
const ENABLED = process.env['EDITOR_ENABLE'] === '1';

const router = Router();

if (!ENABLED) {
  router.use((_req, res) => {
    res.status(404).json({ error: 'editor_disabled' });
  });
} else {
  // Minimal search endpoint; real implementation queries CouchDB with indexes
  router.get('/search', async (req, res) => {
    try {
      const q = String((req.query as any).q || '').trim();
      const limit = Math.min(Math.max(parseInt(String((req.query as any).limit ?? '20'), 10) || 20, 1), 100);
      const blipId = ((req.query as any).blipId ? String((req.query as any).blipId).trim() : '') || undefined;
      if (!q) { res.json({ results: [] }); return; }
      // Placeholder: real search should query Mango with regex/indexes
      res.json({ results: [] as Array<{ waveId: string; blipId?: string; updatedAt?: number }> });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'editor_search_error' });
    }
  });

  // Minimal rebuild endpoint; real implementation should replay stored updates
  router.post('/:waveId/rebuild', async (req, res) => {
    try {
      const waveId = req.params.waveId;
      const blipId = (req.body && typeof (req.body as any).blipId === 'string') ? String((req.body as any).blipId) : undefined;
      // Placeholder response: indicates success with applied=0
      res.json({ ok: true, id: `snap:${waveId}${blipId?':'+blipId:''}`, rev: '1-x', applied: 0 });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'rebuild_error' });
    }
  });
}

export default router;

