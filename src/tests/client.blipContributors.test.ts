import { describe, it, expect } from 'vitest';
import type { BlipContributor, BlipData } from '../client/components/blip/RizzomaBlip';
import { contributorsForAuthor } from '../client/lib/blipContributors';
import { createLocalWrites, overlayLocalBlips, recordCreatedBlip } from '../client/lib/topicLoadReconcile';

const owner: BlipContributor = { id: 'u-owner', email: 'owner@example.org', name: 'Stephan', avatar: '/a/owner.png', role: 'owner' };
const guest: BlipContributor = { id: 'u-guest', email: 'liliia@example.org', name: 'Liliia', avatar: '/a/guest.png', role: 'editor' };

describe('blip avatar stack shows the blip\'s own author (Liliia: "Stephan is shown as the author, not me")', () => {
  it('a blip written by the invited person shows that person, not the owner', () => {
    expect(contributorsForAuthor('u-guest', 'liliia@example.org', [owner, guest])).toEqual([guest]);
  });
  it('a blip written by the owner shows the owner', () => {
    expect(contributorsForAuthor('u-owner', 'owner@example.org', [owner, guest])).toEqual([owner]);
  });
  it('never lists the other people of the topic on a blip they did not write', () => {
    const shown = contributorsForAuthor('u-guest', 'x', [owner, guest]);
    expect(shown.map((c) => c.id)).toEqual(['u-guest']);
  });
  it('an author missing from the roster still shows under their own saved name', () => {
    const shown = contributorsForAuthor('u-gone', 'Hryhorii <h@example.org>'.replace(/ <.*>/, ''), [owner, guest], '/a/h.png');
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ id: 'u-gone', name: 'Hryhorii', avatar: '/a/h.png' });
    expect(shown[0]!.id).not.toBe('u-owner');
  });
  it('an e-mail author name is shortened to the part before the @', () => {
    expect(contributorsForAuthor('u-x', 'sdspieg+fractal1@gmail.com', [owner])[0]).toMatchObject({ name: 'sdspieg+fractal1', email: 'sdspieg+fractal1@gmail.com' });
  });
  it('nothing known about the author gives an empty list (the single-author fallback then applies)', () => {
    expect(contributorsForAuthor('', '', [owner, guest])).toEqual([]);
  });
});

describe('a blip put back by the reload overlay keeps its own author too', () => {
  it('uses the per-blip fallback, not the whole roster', () => {
    const w = createLocalWrites();
    const b: BlipData = {
      id: 'w:b', blipPath: 'b', content: '', authorId: 'u-guest', authorName: 'Liliia', createdAt: 1, updatedAt: 1,
      yjsGeneration: 0, isRead: true, childBlips: [], permissions: { canEdit: true, canComment: true, canRead: true }, contributors: [],
    };
    recordCreatedBlip(w, b, 1000);
    const loaded = new Map<string, BlipData>();
    overlayLocalBlips(loaded, w, 900, (x) => contributorsForAuthor(x.authorId, x.authorName, [owner, guest]));
    expect(loaded.get('w:b')!.contributors).toEqual([guest]);
  });
});
