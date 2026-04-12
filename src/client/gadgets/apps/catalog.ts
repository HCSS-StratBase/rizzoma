import type { GadgetAppManifest } from '../types';

export const GADGET_APP_CATALOG: GadgetAppManifest[] = [
  {
    id: 'kanban-board',
    label: 'Kanban Board',
    icon: '📋',
    accent: '#0f766e',
    category: 'productivity',
    version: '0.1.0',
    description: 'Sandboxed task board app with drag-and-drop columns and card detail panes.',
    runtime: 'iframe',
    entry: '/gadgets/apps/kanban-board/index.html',
    permissions: ['node.read', 'node.write', 'user.context', 'viewport.resize'],
    availability: 'preview',
    defaultHeight: '430',
    initialData: {
      columns: [
        { id: 'todo', title: 'To do', cards: ['Map current wave', 'Validate gadget host'] },
        { id: 'doing', title: 'Doing', cards: ['Sandbox preview app'] },
        { id: 'done', title: 'Done', cards: ['Trusted embeds'] },
      ],
    },
  },
  {
    id: 'calendar-planner',
    label: 'Calendar Planner',
    icon: '📅',
    accent: '#2563eb',
    category: 'productivity',
    version: '0.1.0',
    description: 'Sandboxed planning surface for timelines, milestones, and lightweight scheduling.',
    runtime: 'iframe',
    entry: '/gadgets/apps/calendar-planner/index.html',
    permissions: ['node.read', 'node.write', 'user.context', 'viewport.resize'],
    availability: 'preview',
    defaultHeight: '440',
    initialData: {
      milestones: [
        { id: 'm1', title: 'Wave audit', when: '09:00' },
        { id: 'm2', title: 'Parity review', when: '11:30' },
        { id: 'm3', title: 'Ship preview', when: '15:00' },
      ],
    },
  },
  {
    id: 'focus-timer',
    label: 'Focus Timer',
    icon: '⏱️',
    accent: '#7c3aed',
    category: 'productivity',
    version: '0.1.0',
    description: 'Sandboxed focus-session app with a lightweight agenda and next-session controls.',
    runtime: 'iframe',
    entry: '/gadgets/apps/focus-timer/index.html',
    permissions: ['node.read', 'node.write', 'user.context', 'viewport.resize'],
    availability: 'preview',
    defaultHeight: '420',
    initialData: {
      session: { label: 'Modernization sprint', duration: 25, state: 'ready' },
      checklist: [
        { id: 'c1', label: 'Review live shell', done: true },
        { id: 'c2', label: 'Validate runtime bridge', done: false },
        { id: 'c3', label: 'Prepare next preview app', done: false },
      ],
    },
  },
  {
    id: 'github-workbench',
    label: 'GitHub Workbench',
    icon: '🐙',
    accent: '#4f46e5',
    category: 'integration',
    version: '0.1.0',
    description: 'Planned sandbox app for issue, PR, and commit context inside a topic.',
    runtime: 'iframe',
    entry: '/gadgets/apps/github-workbench/index.html',
    permissions: ['node.read', 'user.context'],
    availability: 'planned',
    defaultHeight: '420',
    initialData: {},
  },
];

export function getAppManifest(appId: string): GadgetAppManifest | undefined {
  return GADGET_APP_CATALOG.find((manifest) => manifest.id === appId);
}
