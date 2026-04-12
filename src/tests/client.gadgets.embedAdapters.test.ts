import { describe, expect, it } from 'vitest';
import { resolveGadgetUrl } from '../client/gadgets/embedAdapters';

describe('client: gadget embed adapters', () => {
  it('normalizes YouTube watch URLs to embed URLs', () => {
    const resolved = resolveGadgetUrl('youtube', 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
    expect(resolved.normalizedUrl).toBe('https://www.youtube.com/embed/jNQXAC9IVRw');
  });

  it('rejects non-YouTube URLs for the YouTube gadget', () => {
    expect(() => resolveGadgetUrl('youtube', 'https://example.com/not-youtube')).toThrow(/YouTube or youtu\.be/i);
  });

  it('normalizes Google Sheets URLs to preview links', () => {
    const resolved = resolveGadgetUrl(
      'spreadsheet',
      'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0'
    );
    expect(resolved.normalizedUrl).toBe('https://docs.google.com/spreadsheets/d/abc123/preview');
  });

  it('keeps full iframe URLs intact', () => {
    const resolved = resolveGadgetUrl('iframe', 'https://example.com/widget?foo=bar');
    expect(resolved.normalizedUrl).toBe('https://example.com/widget?foo=bar');
  });

  it('keeps full image URLs intact', () => {
    const resolved = resolveGadgetUrl('image', 'https://placehold.co/960x540/png');
    expect(resolved.normalizedUrl).toBe('https://placehold.co/960x540/png');
  });

  it('requires full http or https URLs for image gadgets', () => {
    expect(() => resolveGadgetUrl('image', '/relative/path.png')).toThrow(/full url/i);
  });
});
