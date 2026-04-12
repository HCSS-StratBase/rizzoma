import { describe, expect, it } from 'vitest';
import { insertGadget } from '../client/gadgets/insert';

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
});
