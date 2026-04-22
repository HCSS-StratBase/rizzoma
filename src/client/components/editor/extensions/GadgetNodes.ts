import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { PollGadgetView } from './PollGadgetView';
import { SandboxAppGadgetView } from './SandboxAppGadgetView';

type ChartDataPoint = { label: string; value: number };
type PollOption = { id: string; label: string; votes: number };
type EmbedProvider = 'youtube' | 'iframe' | 'spreadsheet';
const parseAppData = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      return parseAppData(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return {};
};

const stringifyAppData = (raw: unknown) => JSON.stringify(parseAppData(raw));
const summarizeAppFrameData = (raw: unknown): string => {
  const data = parseAppData(raw);
  if (Array.isArray((data as any).columns)) {
    const totalCards = (data as any).columns.reduce(
      (sum: number, column: any) => sum + (Array.isArray(column?.cards) ? column.cards.length : 0),
      0
    );
    return `${(data as any).columns.length} columns · ${totalCards} cards`;
  }

  if (Array.isArray((data as any).milestones)) {
    const milestones = (data as any).milestones as Array<{ title?: string }>;
    const tail = milestones[milestones.length - 1];
    return tail?.title ? `Latest: ${tail.title}` : `${milestones.length} milestones`;
  }

  if ((data as any).session) {
    const session = (data as any).session as { label?: string; duration?: number; state?: string };
    if (session?.label) {
      return `Focus: ${session.label}`;
    }
    return `${session?.duration ?? 0} min · ${session?.state ?? 'ready'}`;
  }

  // Hard Gap #20 (2026-04-13): notes-scratchpad data shape — free-form
  // text array + checklist array. Summarize as note count + checked/total
  // checklist progress plus a short preview of the latest note so any
  // "Insight N" capture lands in the summary text.
  if (Array.isArray((data as any).notes) && Array.isArray((data as any).checklist)) {
    const notes = (data as any).notes as string[];
    const checklist = (data as any).checklist as Array<{ done?: boolean }>;
    const checkedCount = checklist.filter((item) => item && item.done).length;
    const tailNote = notes[notes.length - 1] || '';
    const tailPreview = tailNote.split(/\s+/).slice(0, 4).join(' ');
    return `${notes.length} notes${tailPreview ? ` · ${tailPreview}…` : ''} · ${checkedCount}/${checklist.length} checked`;
  }

  return 'Sandbox preview';
};

const DEFAULT_POLL_LABELS = ['Yes', 'No', 'Maybe'];
const fallbackPollLabel = (idx: number) => DEFAULT_POLL_LABELS[idx] || `Option ${idx + 1}`;

export const createDefaultPollOptions = (): PollOption[] => [
  { id: 'opt-1', label: 'Yes', votes: 0 },
  { id: 'opt-2', label: 'No', votes: 0 },
  { id: 'opt-3', label: 'Maybe', votes: 0 },
];

const parseChartData = (raw: unknown): ChartDataPoint[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => ({
        label: (item as any)?.label ?? '',
        value: Number((item as any)?.value ?? 0)
      }))
      .filter((item) => item.label);
  }
  if (typeof raw === 'string') {
    // Try JSON first
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parseChartData(parsed);
      }
    } catch {
      // Fall back to comma-separated format
    }
    return raw.split(',').map((pair) => {
      const [label, value] = pair.split(':');
      return { label: label?.trim() || '', value: Number(value ?? 0) };
    }).filter((item) => item.label);
  }
  return [];
};

const parsePollOptions = (raw: unknown): PollOption[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((item, idx) => {
        if (typeof item === 'string') {
          return {
            id: `opt-${idx + 1}`,
            label: item.trim() || fallbackPollLabel(idx),
            votes: 0,
          };
        }
        return {
          id: (item as any)?.id ?? `opt-${idx + 1}`,
          label: ((item as any)?.label || '').trim() || fallbackPollLabel(idx),
          votes: Number((item as any)?.votes ?? 0),
        };
      })
      .filter((item) => item.label);
  }
  if (typeof raw === 'string') {
    // Try JSON first
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsePollOptions(parsed);
      }
    } catch {
      // Fall back to comma-separated format
    }
    return raw.split(',').map((label, idx) => ({
      id: `opt-${idx}`,
      label: label.trim(),
      votes: 0,
    })).filter((opt) => opt.label);
  }
  return [];
};

const buildGadgetClassName = (base: string, extra?: string | null) =>
  [ 'gadget-block', base, extra ].filter(Boolean).join(' ');

export const ChartGadget = Node.create({
  name: 'chartGadget',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      title: { default: 'Chart' },
      type: { default: 'bar' },
      data: { default: [] as ChartDataPoint[] },
    };
  },

  parseHTML() {
    return [{
      tag: 'figure[data-gadget-type="chart"]',
      getAttrs: (dom: HTMLElement) => ({
        title: dom.getAttribute('data-chart-title') || 'Chart',
        type: dom.getAttribute('data-chart-type') || 'bar',
        data: parseChartData(dom.getAttribute('data-chart-data')),
      }),
    }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
    const { data, title, type, ...rest } = HTMLAttributes as { data?: unknown; title?: string; type?: string };
    const points = parseChartData(data);
    const preview = points.length
      ? points.map((point) => `${point.label}:${point.value}`).join(', ')
      : 'No data points defined';

    const attrs = {
      ...rest,
      'data-gadget-type': 'chart',
      'data-chart-title': title || 'Chart',
      'data-chart-type': type || 'bar',
      'data-chart-data': JSON.stringify(points),
      class: buildGadgetClassName('gadget-chart', (rest as any)?.class),
    };

    return [
      'figure',
      attrs,
      ['div', { class: 'gadget-header' },
        ['span', { class: 'gadget-chip' }, '📊 Chart'],
        ['span', { class: 'gadget-title' }, title || 'Chart'],
      ],
      ['div', { class: 'gadget-body' },
        ['div', { class: 'gadget-preview' }, preview],
      ],
    ];
  },

  addCommands() {
    return {
      insertChart:
        (attrs: { title?: string; type?: string; data?: ChartDataPoint[] | string }) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              title: attrs.title || 'Chart',
              type: attrs.type || 'bar',
              data: parseChartData(attrs.data ?? []),
            },
          }),
    };
  },
});

export const EmbedFrameGadget = Node.create({
  name: 'embedFrameGadget',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      title: { default: 'Embedded content' },
      provider: { default: 'iframe' as EmbedProvider },
      width: { default: '600' },
      height: { default: '400' },
    };
  },

  parseHTML() {
    return [{
      tag: 'figure[data-gadget-type="embed-frame"]',
      getAttrs: (dom: HTMLElement) => ({
        src: dom.getAttribute('data-embed-src') || '',
        title: dom.getAttribute('data-embed-title') || 'Embedded content',
        provider: (dom.getAttribute('data-embed-provider') as EmbedProvider) || 'iframe',
        width: dom.getAttribute('data-embed-width') || '600',
        height: dom.getAttribute('data-embed-height') || '400',
      }),
    }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
    const src = String(HTMLAttributes['src'] || '');
    const title = String(HTMLAttributes['title'] || 'Embedded content');
    const provider = String(HTMLAttributes['provider'] || 'iframe');
    const width = String(HTMLAttributes['width'] || '600');
    const height = String(HTMLAttributes['height'] || '400');
    const iframeAttrs: Record<string, string> = {
      src,
      width,
      height,
      frameborder: '0',
      loading: 'lazy',
      referrerpolicy: 'strict-origin-when-cross-origin',
    };

    if (provider === 'youtube') {
      iframeAttrs['allow'] = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframeAttrs['allowfullscreen'] = 'true';
    }

    return [
      'figure',
      {
        'data-gadget-type': 'embed-frame',
        'data-embed-src': src,
        'data-embed-title': title,
        'data-embed-provider': provider,
        'data-embed-width': width,
        'data-embed-height': height,
        class: buildGadgetClassName('gadget-embed-frame', (HTMLAttributes as any)?.class),
      },
      ['div', { class: 'gadget-header' },
        ['span', { class: 'gadget-chip' }, '↗ Embed'],
        ['span', { class: 'gadget-title' }, title],
      ],
      ['div', { class: 'gadget-body' },
        ['iframe', iframeAttrs],
      ],
    ];
  },

  addCommands() {
    return {
      insertEmbedFrame:
        (attrs: { src: string; title?: string; provider?: EmbedProvider; width?: string; height?: string }) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              src: attrs.src,
              title: attrs.title || 'Embedded content',
              provider: attrs.provider || 'iframe',
              width: attrs.width || '600',
              height: attrs.height || '400',
            },
          }),
    };
  },
});

export const PollGadget = Node.create({
  name: 'pollGadget',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      question: {
        default: 'Poll question',
        rendered: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-poll-question') || 'Poll question',
        renderHTML: (attributes: Record<string, any>) => ({
          'data-poll-question': attributes['question'] || 'Poll question',
        }),
      },
      options: { 
        default: createDefaultPollOptions(),
        rendered: false,
        parseHTML: (element: HTMLElement) => parsePollOptions(element.getAttribute('data-poll-options')),
        renderHTML: (attributes: Record<string, any>) => ({
          'data-poll-options': JSON.stringify(attributes['options'])
        })
      },
      allowMultiple: {
        default: false,
        rendered: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-poll-allow-multiple') === 'true',
        renderHTML: (attributes: Record<string, any>) => ({
          'data-poll-allow-multiple': String(!!attributes['allowMultiple']),
        }),
      },
    };
  },

  parseHTML() {
    return [{
      tag: 'figure[data-gadget-type="poll"]',
      getAttrs: (dom: HTMLElement) => ({
        question: dom.getAttribute('data-poll-question') || 'Poll question',
        options: parsePollOptions(dom.getAttribute('data-poll-options')),
        allowMultiple: dom.getAttribute('data-poll-allow-multiple') === 'true',
      }),
    }];
  },

  renderHTML({
    node,
    HTMLAttributes,
  }: {
    node: { attrs?: Record<string, any> };
    HTMLAttributes: Record<string, any>;
  }) {
    const attrs = node?.attrs ?? HTMLAttributes;
    const parsedOptions = parsePollOptions(attrs?.['options']);

    return ['figure', {
      ...HTMLAttributes,
      'data-gadget-type': 'poll',
      'data-poll-question': attrs?.['question'] || 'Poll question',
      'data-poll-options': JSON.stringify(parsedOptions),
      'data-poll-allow-multiple': String(!!attrs?.['allowMultiple']),
      class: buildGadgetClassName('gadget-poll', (HTMLAttributes as any)?.class),
    }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PollGadgetView);
  },

  addCommands() {
    return {
      insertPoll:
        (attrs: { question?: string; options?: PollOption[] | string; allowMultiple?: boolean }) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              question: attrs.question || 'Poll question',
              options: parsePollOptions(attrs.options ?? []),
              allowMultiple: !!attrs.allowMultiple,
            },
          }),
    };
  },
});

export const AppFrameGadget = Node.create({
  name: 'appFrameGadget',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      appId: {
        default: 'kanban-board',
        rendered: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-app-id') || 'kanban-board',
        renderHTML: (attributes: Record<string, any>) => ({
          'data-app-id': String(attributes['appId'] || 'kanban-board'),
        }),
      },
      instanceId: {
        default: 'app-frame',
        rendered: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-app-instance-id') || 'app-frame',
        renderHTML: (attributes: Record<string, any>) => ({
          'data-app-instance-id': String(attributes['instanceId'] || 'app-frame'),
        }),
      },
      title: {
        default: 'Kanban Board',
        rendered: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-app-title') || 'Kanban Board',
        renderHTML: (attributes: Record<string, any>) => ({
          'data-app-title': String(attributes['title'] || 'Kanban Board'),
        }),
      },
      src: {
        default: '/gadgets/apps/kanban-board/index.html',
        rendered: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-app-src') || '/gadgets/apps/kanban-board/index.html',
        renderHTML: (attributes: Record<string, any>) => ({
          'data-app-src': String(attributes['src'] || '/gadgets/apps/kanban-board/index.html'),
        }),
      },
      height: {
        default: '430',
        rendered: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-app-height') || '430',
        renderHTML: (attributes: Record<string, any>) => ({
          'data-app-height': String(attributes['height'] || '430'),
        }),
      },
      data: {
        default: '{}',
        rendered: false,
        parseHTML: (element: HTMLElement) => stringifyAppData(element.getAttribute('data-app-data')),
        renderHTML: (attributes: Record<string, any>) => ({
          'data-app-data': stringifyAppData(attributes['data']),
        }),
      },
    };
  },

  parseHTML() {
    return [{
      tag: 'figure[data-gadget-type="app-frame"]',
      getAttrs: (dom: HTMLElement) => ({
        appId: dom.getAttribute('data-app-id') || 'kanban-board',
        instanceId: dom.getAttribute('data-app-instance-id') || 'app-frame',
        title: dom.getAttribute('data-app-title') || 'Kanban Board',
        src: dom.getAttribute('data-app-src') || '/gadgets/apps/kanban-board/index.html',
        height: dom.getAttribute('data-app-height') || '430',
        data: stringifyAppData(dom.getAttribute('data-app-data')),
      }),
    }];
  },

  renderHTML({
    node,
    HTMLAttributes,
  }: {
    node: { attrs?: Record<string, any> };
    HTMLAttributes: Record<string, any>;
  }) {
    const attrs = node?.attrs ?? HTMLAttributes;
    const appData = parseAppData(attrs['data']);
    const title = String(attrs['title'] || 'Kanban Board');
    const summary = summarizeAppFrameData(appData);
    const src = String(attrs['src'] || '/gadgets/apps/kanban-board/index.html');
    const height = String(attrs['height'] || '430');
    return ['figure', {
      ...HTMLAttributes,
      'data-gadget-type': 'app-frame',
      'data-app-id': String(attrs['appId'] || 'kanban-board'),
      'data-app-instance-id': String(attrs['instanceId'] || 'app-frame'),
      'data-app-title': title,
      'data-app-src': src,
      'data-app-height': height,
      'data-app-data': stringifyAppData(appData),
      'data-app-summary': summary,
      class: buildGadgetClassName('gadget-app-frame', (HTMLAttributes as any)?.class),
    },
    ['iframe', {
      src,
      title,
      loading: 'lazy',
      sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
      allow: 'clipboard-read; clipboard-write; fullscreen',
      style: `width: 100%; min-height: ${height}px; border: 0; border-radius: 16px; background: white; box-shadow: inset 0 0 0 1px rgba(136,156,178,0.18);`,
    }]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SandboxAppGadgetView);
  },

  addCommands() {
    return {
      insertAppFrame:
        (attrs: { appId: string; instanceId?: string; title?: string; src: string; height?: string; data?: unknown }) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              appId: attrs.appId,
              instanceId: attrs.instanceId || 'app-frame',
              title: attrs.title || 'Kanban Board',
              src: attrs.src,
              height: attrs.height || '430',
              data: stringifyAppData(attrs.data),
            },
          }),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chartGadget: {
      insertChart: (attrs: { title?: string; type?: string; data?: ChartDataPoint[] | string }) => ReturnType;
    };
    embedFrameGadget: {
      insertEmbedFrame: (attrs: { src: string; title?: string; provider?: EmbedProvider; width?: string; height?: string }) => ReturnType;
    };
    appFrameGadget: {
      insertAppFrame: (attrs: { appId: string; instanceId?: string; title?: string; src: string; height?: string; data?: unknown }) => ReturnType;
    };
    pollGadget: {
      insertPoll: (attrs: { question?: string; options?: PollOption[] | string; allowMultiple?: boolean }) => ReturnType;
    };
  }
}
