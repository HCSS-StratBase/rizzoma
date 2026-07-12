import { describe, expect, it } from 'vitest';
import { insertGadget } from '../client/gadgets/insert';
import { normalizeAppFrameAttrs, normalizeEmbedFrameAttrs } from '../client/gadgets/security';

function createEditorSpy() {
  const calls: unknown[] = [];
  const chain = {
    focus() {
      return this;
    },
    insertContent(content: unknown) {
      calls.push(content);
      return { run: () => true };
    },
    toggleCodeBlock() {
      calls.push('toggle-code');
      return { run: () => true };
    },
    run() {
      return true;
    },
  };

  return {
    editor: {
      chain: () => chain,
    },
    calls,
  };
}

describe('client: gadget insert helper', () => {
  it('inserts the kanban app gadget via appFrameGadget', () => {
    const { editor, calls } = createEditorSpy();
    const result = insertGadget(editor as any, { type: 'kanbanApp' });
    expect(result).toBe(true);
    expect(calls[0]).toMatchObject({
      type: 'appFrameGadget',
      attrs: {
        appId: 'kanban-board',
        title: 'Kanban Board',
      },
    });
  });

  it('inserts the calendar app gadget via appFrameGadget', () => {
    const { editor, calls } = createEditorSpy();
    const result = insertGadget(editor as any, { type: 'calendarApp' });
    expect(result).toBe(true);
    expect(calls[0]).toMatchObject({
      type: 'appFrameGadget',
      attrs: {
        appId: 'calendar-planner',
        title: 'Calendar Planner',
      },
    });
  });

  it('inserts the focus app gadget via appFrameGadget', () => {
    const { editor, calls } = createEditorSpy();
    const result = insertGadget(editor as any, { type: 'focusApp' });
    expect(result).toBe(true);
    expect(calls[0]).toMatchObject({
      type: 'appFrameGadget',
      attrs: {
        appId: 'focus-timer',
        title: 'Focus Timer',
      },
    });
  });

  it('rejects forged or executable embed-frame attributes', () => {
    expect(normalizeEmbedFrameAttrs({ src: 'javascript:alert(1)', provider: 'iframe' })).toBeNull();
    expect(normalizeEmbedFrameAttrs({ src: `${window.location.origin}/api/auth/me`, provider: 'iframe' })).toBeNull();
    expect(normalizeEmbedFrameAttrs({ src: 'https://evil.example/embed/video', provider: 'youtube' })).toBeNull();
    expect(normalizeEmbedFrameAttrs({ src: 'https://docs.google.com/document/d/id/preview', provider: 'spreadsheet' })).toBeNull();

    expect(normalizeEmbedFrameAttrs({
      src: 'https://www.youtube.com/embed/abc_123',
      provider: 'youtube',
      width: '999999',
      height: '-4',
    })).toMatchObject({
      src: 'https://www.youtube.com/embed/abc_123',
      provider: 'youtube',
      width: '2000',
      height: '100',
    });
  });

  it('pins app frames to the catalog entry instead of trusting stored attrs', () => {
    expect(normalizeAppFrameAttrs({
      appId: 'kanban-board',
      instanceId: 'kanban-1',
      src: 'https://evil.example/steal',
    })).toBeNull();
    expect(normalizeAppFrameAttrs({
      appId: 'unknown-app',
      instanceId: 'x',
      src: '/gadgets/unknown.html',
    })).toBeNull();

    expect(normalizeAppFrameAttrs({
      appId: 'kanban-board',
      instanceId: 'kanban-1',
      src: '/gadgets/apps/kanban-board/index.html',
      title: 'forged label',
      height: '99999',
    })).toEqual({
      appId: 'kanban-board',
      instanceId: 'kanban-1',
      src: '/gadgets/apps/kanban-board/index.html',
      title: 'Kanban Board',
      height: '1200',
    });
  });
});
