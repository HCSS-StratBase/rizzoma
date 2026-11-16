/**
 * Guard against the blank-placeholder overwrite (incident 2026-11-16).
 *
 * A topic editor that has not yet been loaded with the stored content (collab
 * not yet active, Y.Doc unseeded) normalizes its EMPTY document with the
 * fallback title "Untitled" and autosaves it over the real topic. The server
 * then bumps yjsGeneration and the stored title/content are lost.
 *
 * Signature of that write, and only that write: the incoming title is the
 * placeholder "Untitled", the stored title is not, and the incoming body has
 * no text beyond the title while the stored body has real text. A user who
 * deliberately retitles a topic "Untitled" AND wipes its body in the same
 * request is the accepted false positive.
 */
export const BLANK_PLACEHOLDER_TITLE = 'Untitled';

function visibleText(html: string): string {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TopicProjectionWrite {
  incomingTitle: string | undefined;
  incomingContent: string | undefined;
  existingTitle: string | undefined;
  existingContent: string | undefined;
}

export function isBlankPlaceholderOverwrite(write: TopicProjectionWrite): boolean {
  const incomingTitle = (write.incomingTitle ?? '').trim();
  if (incomingTitle !== BLANK_PLACEHOLDER_TITLE) return false;
  const existingTitle = (write.existingTitle ?? '').trim();
  if (!existingTitle || existingTitle === BLANK_PLACEHOLDER_TITLE) return false;
  const incomingText = visibleText(write.incomingContent ?? '');
  const bodyBeyondTitle = incomingText.replace(incomingTitle, '').trim();
  if (bodyBeyondTitle.length > 0) return false;
  const existingText = visibleText(write.existingContent ?? '');
  return existingText.replace(existingTitle, '').trim().length > 0;
}
