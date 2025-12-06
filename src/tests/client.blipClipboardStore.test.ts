import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getBlipClipboardPayload, 
  setBlipClipboardPayload, 
  clearBlipClipboardPayload,
  __dangerousResetInlineClipboardStoreForTests,
} from '../client/components/blip/clipboardStore';

describe('client: blip clipboard store', () => {
  beforeEach(() => {
    __dangerousResetInlineClipboardStoreForTests();
  });

  it('persists clipboard payloads per blip id', () => {
    expect(getBlipClipboardPayload('blip-1')).toBeNull();
    setBlipClipboardPayload('blip-1', { html: '<p>Hello</p>', text: 'Hello' });
    const payload = getBlipClipboardPayload('blip-1');
    expect(payload).not.toBeNull();
    expect(payload?.text).toBe('Hello');
    expect(payload?.html).toContain('<p>');
  });

  it('clears payloads and updates storage', () => {
    setBlipClipboardPayload('blip-2', { html: '<p>Other</p>', text: 'Other' });
    expect(getBlipClipboardPayload('blip-2')).not.toBeNull();
    clearBlipClipboardPayload('blip-2');
    expect(getBlipClipboardPayload('blip-2')).toBeNull();
    const raw = window.localStorage.getItem('rizzoma:inlineClipboard');
    if (raw) {
      expect(raw.includes('blip-2')).toBe(false);
    }
  });
});
