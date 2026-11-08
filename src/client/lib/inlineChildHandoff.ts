export type InlineChildHandoffAction = 'done' | 'ensure-expanded' | 'enter-edit';

/**
 * Decide the next step while a topic-root Ctrl+Enter child moves from the
 * topic editor's NodeView portal into the topic's view-mode portal.
 *
 * A missing container is temporary, but the owning RizzomaBlip may also have
 * remounted and lost local expansion state. Re-assert expansion idempotently;
 * never use a toggle during handoff retries.
 */
export function nextInlineChildHandoffAction(
  containerPresent: boolean,
  editablePresent: boolean,
): InlineChildHandoffAction {
  if (editablePresent) return 'done';
  return containerPresent ? 'enter-edit' : 'ensure-expanded';
}
