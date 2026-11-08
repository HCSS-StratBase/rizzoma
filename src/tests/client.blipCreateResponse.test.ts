import { describe, expect, it } from 'vitest';
import { EMPTY_BLB_HTML } from '../shared/blbContent';
import { readCreatedBlip } from '../client/lib/blipCreateResponse';

describe('POST /api/blips response mapping', () => {
  it('reads content and authorship from the nested server blip envelope', () => {
    expect(readCreatedBlip({
      id: 'wave:b1',
      content: '<p>wrong top-level field</p>',
      blip: {
        content: '<ul><li><p>Correct BLB</p></li></ul>',
        authorId: 'u1',
        authorName: 'User One',
        createdAt: 10,
        updatedAt: 11,
      },
    })).toEqual({
      id: 'wave:b1',
      content: '<ul><li><p>Correct BLB</p></li></ul>',
      authorId: 'u1',
      authorName: 'User One',
      createdAt: 10,
      updatedAt: 11,
    });
  });

  it('uses the BLB starter when the nested content is absent', () => {
    expect(readCreatedBlip({ id: 'wave:b2', blip: {} }, 42)).toEqual({
      id: 'wave:b2',
      content: EMPTY_BLB_HTML,
      authorId: '',
      authorName: 'Anonymous',
      createdAt: 42,
      updatedAt: 42,
    });
  });
});
