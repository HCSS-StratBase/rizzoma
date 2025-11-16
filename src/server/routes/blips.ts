import { Router } from 'express';
import { getDoc, updateDoc, insertDoc } from '../lib/couch.js';
import type { Blip } from '../schemas/wave.js';

const router = Router();

// PATCH /api/blips/:id/reparent { parentId }
router.patch('/blips/:id/reparent', async (req, res): Promise<void> => {
  // @ts-ignore
  if (!req.session?.userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  try {
    const id = req.params.id;
    const parentId = (req.body || {}).parentId as string | null | undefined;
    const blip = await getDoc<Blip & { _rev: string }>(id);
    const next: Blip & { _rev?: string } = {
      ...blip,
      parentId: parentId ?? null,
      updatedAt: Date.now(),
    };
    const r = await updateDoc(next as any);
    res.json({ id: r.id, rev: r.rev });
    return;
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'reparent_error', requestId: (req as any)?.id });
    return;
  }
});

// POST /api/blips - Create a new blip
router.post('/', async (req, res): Promise<void> => {
  // @ts-ignore
  const userId = req.session?.userId;
  if (!userId) { 
    res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); 
    return; 
  }

  try {
    const { waveId, parentId, content } = req.body || {};
    
    if (!waveId || !content) {
      res.status(400).json({ error: 'missing_required_fields', requestId: (req as any)?.id });
      return;
    }

    const now = Date.now();
    const blipId = `${waveId}:b${now}`;
    
    const blip: Blip = {
      _id: blipId,
      type: 'blip',
      waveId,
      parentId: parentId || null,
      content,
      createdAt: now,
      updatedAt: now,
      authorId: userId
    } as any;

    const r = await insertDoc(blip as any);
    res.status(201).json({ 
      id: r.id, 
      rev: r.rev,
      blip: {
        ...blip,
        permissions: {
          canEdit: true,
          canComment: true,
          canRead: true
        }
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'create_blip_error', requestId: (req as any)?.id });
  }
});

// PUT /api/blips/:id - Update blip content
router.put('/:id', async (req, res): Promise<void> => {
  // @ts-ignore
  const userId = req.session?.userId;
  if (!userId) { 
    res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); 
    return; 
  }

  try {
    const id = req.params.id;
    const { content } = req.body || {};
    
    if (!content) {
      res.status(400).json({ error: 'missing_content', requestId: (req as any)?.id });
      return;
    }

    const blip = await getDoc<Blip & { _rev: string }>(id);
    
    // Check if user can edit (simplified - in real app, check permissions)
    const canEdit = true; // TODO: implement proper permission check
    
    if (!canEdit) {
      res.status(403).json({ error: 'forbidden', requestId: (req as any)?.id });
      return;
    }

    const updatedBlip: Blip & { _rev?: string } = {
      ...blip,
      content,
      updatedAt: Date.now()
    };

    const r = await updateDoc(updatedBlip as any);
    res.json({ 
      id: r.id, 
      rev: r.rev,
      blip: {
        ...updatedBlip,
        permissions: {
          canEdit: true,
          canComment: true,
          canRead: true
        }
      }
    });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) { 
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); 
      return; 
    }
    res.status(500).json({ error: e?.message || 'update_blip_error', requestId: (req as any)?.id });
  }
});

// GET /api/blips/:id - Get single blip with permissions
router.get('/:id', async (req, res): Promise<void> => {
  // @ts-ignore
  const userId = req.session?.userId;
  
  try {
    const id = req.params.id;
    const blip = await getDoc<Blip>(id);
    
    res.json({
      ...blip,
      permissions: {
        canEdit: !!userId, // Simplified - in real app, check actual permissions
        canComment: !!userId,
        canRead: true
      }
    });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) { 
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); 
      return; 
    }
    res.status(500).json({ error: e?.message || 'get_blip_error', requestId: (req as any)?.id });
  }
});

export default router;

