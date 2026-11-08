// @vitest-environment node

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  COLLABORATION_GENERATION_HEADER,
  COLLABORATION_STATE_DIGEST_HEADER,
  collaborationProjectionHeaders,
} from '../client/lib/collaborationProjection';

describe('client: collaboration projection provenance', () => {
  it('binds a 64-character full-state SHA-256 digest to the durable generation', async () => {
    const doc = new Y.Doc();
    doc.getText('default').insert(0, 'durable task');

    const headers = await collaborationProjectionHeaders(doc, 7);
    const expected = createHash('sha256')
      .update(Y.encodeStateAsUpdate(doc))
      .digest('hex');

    expect(headers).toEqual({
      [COLLABORATION_STATE_DIGEST_HEADER]: expected,
      [COLLABORATION_GENERATION_HEADER]: '7',
    });
    expect(headers?.[COLLABORATION_STATE_DIGEST_HEADER]).toMatch(/^[a-f0-9]{64}$/);
    doc.destroy();
  });

  it('changes the digest for a deletion even when the Yjs state vector is unchanged', async () => {
    const doc = new Y.Doc();
    const text = doc.getText('default');
    text.insert(0, 'delete me');
    const beforeVector = Buffer.from(Y.encodeStateVector(doc)).toString('hex');
    const before = await collaborationProjectionHeaders(doc, 2);

    text.delete(0, text.length);
    const afterVector = Buffer.from(Y.encodeStateVector(doc)).toString('hex');
    const after = await collaborationProjectionHeaders(doc, 2);

    expect(afterVector).toBe(beforeVector);
    expect(after?.[COLLABORATION_STATE_DIGEST_HEADER])
      .not.toBe(before?.[COLLABORATION_STATE_DIGEST_HEADER]);
    doc.destroy();
  });
});
