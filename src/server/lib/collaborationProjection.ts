import type { Request } from 'express';

export const COLLABORATION_STATE_DIGEST_HEADER = 'x-rizzoma-yjs-state-digest';
export const COLLABORATION_GENERATION_HEADER = 'x-rizzoma-yjs-generation';

export type CollaborationProjection = {
  digest: string;
  generation: number;
};

/** Parse the full-state digest carried by a browser's collaborative HTML
 * materialization. Absence means the caller is requesting an out-of-band full
 * replacement. Invalid provenance is rejected rather than silently treated as
 * a replacement. */
export function readCollaborationStateDigest(req: Request): string | null {
  const header = req.get(COLLABORATION_STATE_DIGEST_HEADER);
  if (header === undefined) return null;
  const digest = header.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('invalid_collaboration_state_digest');
  return digest;
}

/** A digest is meaningful only inside the durable Yjs generation that
 * produced it. Requiring both headers prevents a delayed request from an old
 * provider being accepted after an external replacement happens to converge
 * on byte-identical content. */
export function readCollaborationProjection(req: Request): CollaborationProjection | null {
  const digest = readCollaborationStateDigest(req);
  const generationHeader = req.get(COLLABORATION_GENERATION_HEADER);
  if (digest === null) {
    if (generationHeader !== undefined) throw new Error('invalid_collaboration_generation');
    return null;
  }
  if (generationHeader === undefined || !/^(0|[1-9][0-9]*)$/.test(generationHeader.trim())) {
    throw new Error('invalid_collaboration_generation');
  }
  const generation = Number(generationHeader);
  if (!Number.isSafeInteger(generation)) throw new Error('invalid_collaboration_generation');
  return { digest, generation };
}
