import { describe, it, expect, vi } from 'vitest';
import { ChartGadget, PollGadget } from '../client/components/editor/extensions/GadgetNodes';

// Access TipTap extension config via .config property
const getExtensionConfig = (ext: any) => ext.config || ext.options || ext;

describe('client: ChartGadget extension', () => {
  it('renders chart attributes into HTML schema', () => {
    const config = getExtensionConfig(ChartGadget);
    const renderHTML = config.renderHTML;
    expect(renderHTML).toBeDefined();
    const html = renderHTML?.({
      HTMLAttributes: {
        title: 'Sales chart',
        type: 'line',
        data: JSON.stringify([
          { label: 'Q1', value: 10 },
          { label: 'Q2', value: 25 },
        ]),
      },
    });
    expect(html?.[1]).toMatchObject({
      'data-gadget-type': 'chart',
      'data-chart-title': 'Sales chart',
      'data-chart-type': 'line',
    });
  });

  it('parses DOM nodes back into attrs', () => {
    const config = getExtensionConfig(ChartGadget);
    const parseHTML = config.parseHTML;
    expect(parseHTML).toBeDefined();
    const el = document.createElement('figure');
    el.setAttribute('data-gadget-type', 'chart');
    el.setAttribute('data-chart-title', 'Revenue');
    el.setAttribute('data-chart-type', 'bar');
    el.setAttribute('data-chart-data', JSON.stringify([{ label: 'A', value: 1 }]));
    const parser = parseHTML?.()[0];
    const attrs = parser?.getAttrs?.(el);
    expect(attrs).toMatchObject({
      title: 'Revenue',
      type: 'bar',
      data: [{ label: 'A', value: 1 }],
    });
  });

  it('injects chart nodes via command helper', () => {
    const config = getExtensionConfig(ChartGadget);
    const addCommands = config.addCommands;
    expect(addCommands).toBeDefined();
    // Create a mock context with the extension name
    const mockContext = { name: 'chartGadget' };
    const factory = addCommands?.call(mockContext);
    const insertChart = factory?.insertChart({ title: 'Ops', data: [{ label: 'Ops', value: 4 }] });
    const insertContent = vi.fn();
    insertChart?.({ commands: { insertContent } });
    expect(insertContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'chartGadget',
        attrs: expect.objectContaining({ title: 'Ops' }),
      }),
    );
  });
});

describe('client: PollGadget extension', () => {
  it('renders poll attributes into HTML schema', () => {
    const config = getExtensionConfig(PollGadget);
    const renderHTML = config.renderHTML;
    expect(renderHTML).toBeDefined();
    const html = renderHTML?.({
      HTMLAttributes: {
        question: 'Pick one',
        options: JSON.stringify([{ id: 'a', label: 'A', votes: 2 }]),
        allowMultiple: true,
      },
    });
    expect(html?.[1]).toMatchObject({
      'data-gadget-type': 'poll',
      'data-poll-question': 'Pick one',
      'data-poll-allow-multiple': 'true',
    });
  });

  it('parses poll DOM nodes', () => {
    const config = getExtensionConfig(PollGadget);
    const parseHTML = config.parseHTML;
    expect(parseHTML).toBeDefined();
    const el = document.createElement('figure');
    el.setAttribute('data-gadget-type', 'poll');
    el.setAttribute('data-poll-question', 'Lunch?');
    el.setAttribute('data-poll-allow-multiple', 'false');
    el.setAttribute('data-poll-options', JSON.stringify([{ id: '1', label: 'Pizza', votes: 5 }]));
    const parser = parseHTML?.()[0];
    const attrs = parser?.getAttrs?.(el);
    expect(attrs).toMatchObject({
      question: 'Lunch?',
      allowMultiple: false,
      options: [{ id: '1', label: 'Pizza', votes: 5 }],
    });
  });

  it('injects poll nodes via command helper', () => {
    const config = getExtensionConfig(PollGadget);
    const addCommands = config.addCommands;
    expect(addCommands).toBeDefined();
    // Create a mock context with the extension name
    const mockContext = { name: 'pollGadget' };
    const factory = addCommands?.call(mockContext);
    const insertPoll = factory?.insertPoll({ question: 'Vote', options: [{ id: 'x', label: 'X' }] });
    const insertContent = vi.fn();
    insertPoll?.({ commands: { insertContent } });
    expect(insertContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pollGadget',
        attrs: expect.objectContaining({ question: 'Vote' }),
      }),
    );
  });
});
