export type InlineChildHandoffAction = 'done' | 'wait' | 'enter-edit';

/**
 * Decide the next step while a topic-root Ctrl+Enter child moves from the
 * topic editor's NodeView portal into the topic's view-mode portal.
 *
 * A missing container is temporary. The root RizzomaBlip retains the child's
 * expanded state across that handoff, so toggling again would collapse it.
 */
export function nextInlineChildHandoffAction(
  containerPresent: boolean,
  editablePresent: boolean,
): InlineChildHandoffAction {
  if (editablePresent) return 'done';
  return containerPresent ? 'enter-edit' : 'wait';
}
