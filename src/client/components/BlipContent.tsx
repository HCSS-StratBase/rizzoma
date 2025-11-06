// Placeholder for future TipTap + Yjs read-only renderer.
// For now, renders plain text content. Designed to be swapped later without changing callers.
export function BlipContent({ content }: { content: string }) {
  // TODO: integrate TipTap with Yjs for rich text rendering.
  return <span>{content || '(empty)'}</span>;
}

