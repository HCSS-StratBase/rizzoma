import type { BlipContributor } from '../components/blip/RizzomaBlip';

/**
 * Who is shown on a blip's avatar stack.
 *
 * Until 25 Nov 2026 every blip carried the whole list of topic participants, sorted with the owner on top, so a
 * blip written by an invited person was drawn with the owner's avatar. A blip now shows the person who wrote it.
 * People we know from the topic roster supply the avatar and display name; an author who is no longer on the
 * roster (or never accepted) still shows under their own saved name instead of being replaced by someone else.
 */
export function contributorsForAuthor(
  authorId: string | undefined,
  authorName: string | undefined,
  roster: BlipContributor[],
  authorAvatar?: string,
): BlipContributor[] {
  const id = String(authorId || '');
  const label = String(authorName || '').trim();
  // Prefer a roster entry that has a readable name (a person can appear twice, once as an unnamed invitation record).
  const matches = id ? roster.filter((p) => p.id === id) : [];
  const readable = matches.find((p) => (p.email || '').trim() || ((p.name || '').trim() && p.name !== p.id));
  const known = readable ?? matches[0];
  if (known) {
    const unnamed = !(known.email || '').trim() && (!(known.name || '').trim() || known.name === known.id);
    if (!unnamed || !label) return [known];
    // The roster only has an id for this person: show the name saved with the blip instead of a raw id.
    return [{ ...known, email: label.includes('@') ? label : known.email, name: label.includes('@') ? label.split('@')[0] : label }];
  }
  if (!id && !label) return [];
  return [{
    id: id || `name:${label}`,
    email: label.includes('@') ? label : '',
    name: label ? (label.includes('@') ? label.split('@')[0] : label) : undefined,
    avatar: authorAvatar,
    role: 'viewer',
  } as BlipContributor];
}
