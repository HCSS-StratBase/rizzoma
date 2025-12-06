import { Node } from '@tiptap/core';

type ChartDataPoint = { label: string; value: number };
type PollOption = { id?: string; label: string; votes?: number };

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
      .map((item, idx) => ({
        id: (item as any)?.id ?? `opt-${idx}`,
        label: (item as any)?.label ?? '',
        votes: Number((item as any)?.votes ?? 0),
      }))
      .filter((item) => item.label);
  }
  if (typeof raw === 'string') {
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

  renderHTML({ HTMLAttributes }) {
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

export const PollGadget = Node.create({
  name: 'pollGadget',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      question: { default: 'Poll question' },
      options: { default: [] as PollOption[] },
      allowMultiple: { default: false },
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

  renderHTML({ HTMLAttributes }) {
    const { question, options, allowMultiple, ...rest } = HTMLAttributes as {
      question?: string;
      options?: unknown;
      allowMultiple?: boolean;
    };
    const parsedOptions = parsePollOptions(options);
    const attrs = {
      ...rest,
      'data-gadget-type': 'poll',
      'data-poll-question': question || 'Poll question',
      'data-poll-options': JSON.stringify(parsedOptions),
      'data-poll-allow-multiple': String(!!allowMultiple),
      class: buildGadgetClassName('gadget-poll', (rest as any)?.class),
    };

    return [
      'figure',
      attrs,
      ['div', { class: 'gadget-header' },
        ['span', { class: 'gadget-chip' }, allowMultiple ? '🗳️ Multi-poll' : '🗳️ Poll'],
        ['span', { class: 'gadget-title' }, question || 'Poll question'],
      ],
      ['div', { class: 'gadget-body' },
        ['ol', { class: 'gadget-list', 'data-allow-multiple': String(!!allowMultiple) },
          ...parsedOptions.map((option) => (
            ['li', { class: 'gadget-list-item', 'data-option-id': option.id || option.label },
              ['span', { class: 'gadget-option-label' }, option.label],
              ['span', { class: 'gadget-option-votes' }, `${option.votes ?? 0} votes`],
            ]
          )),
        ],
      ],
    ];
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

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chartGadget: {
      insertChart: (attrs: { title?: string; type?: string; data?: ChartDataPoint[] | string }) => ReturnType;
    };
    pollGadget: {
      insertPoll: (attrs: { question?: string; options?: PollOption[] | string; allowMultiple?: boolean }) => ReturnType;
    };
  }
}
