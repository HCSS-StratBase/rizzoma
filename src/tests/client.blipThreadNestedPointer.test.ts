// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BlipThreadNode, isEventInsideInlineChildPortal } from '../client/components/editor/extensions/BlipThreadNode';

describe('BlipThread nested pointer events', () => {
  it('recognises events from inside an inline child portal', () => {
    const host = document.createElement('span');
    host.className = 'inline-child-portal';
    const inner = document.createElement('li');
    host.appendChild(inner);
    expect(isEventInsideInlineChildPortal(inner)).toBe(true);
    expect(isEventInsideInlineChildPortal(host)).toBe(true);
    expect(isEventInsideInlineChildPortal(document.createElement('p'))).toBe(false);
    expect(isEventInsideInlineChildPortal(null)).toBe(false);
  });

  it('registers a ProseMirror plugin that leaves such presses to the browser', () => {
    const plugins = (BlipThreadNode as any).config.addProseMirrorPlugins.call({ name: 'blipThread', options: {}, editor: null });
    expect(plugins.length).toBe(1);
    const handlers = plugins[0].props.handleDOMEvents;
    const inside = document.createElement('div');
    inside.className = 'inline-child-portal';
    const target = document.createElement('li');
    inside.appendChild(target);
    expect(handlers.mousedown({}, { target })).toBe(true);
    expect(handlers.mousedown({}, { target: document.createElement('p') })).toBe(false);
  });
});
