import { useState } from 'react';
import './StorePanel.css';

interface Gadget {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'productivity' | 'collaboration' | 'visualization' | 'integration';
  installed: boolean;
}

const AVAILABLE_GADGETS: Gadget[] = [
  {
    id: 'chart',
    name: 'Charts & Graphs',
    description: 'Add interactive charts and data visualizations to your topics',
    icon: '📊',
    category: 'visualization',
    installed: true,
  },
  {
    id: 'poll',
    name: 'Polls & Voting',
    description: 'Create quick polls and gather team opinions',
    icon: '🗳️',
    category: 'collaboration',
    installed: false,
  },
  {
    id: 'calendar',
    name: 'Calendar Events',
    description: 'Embed calendar events and schedule meetings',
    icon: '📅',
    category: 'productivity',
    installed: false,
  },
  {
    id: 'kanban',
    name: 'Kanban Board',
    description: 'Visual task management with drag-and-drop boards',
    icon: '📋',
    category: 'productivity',
    installed: false,
  },
  {
    id: 'code',
    name: 'Code Snippets',
    description: 'Syntax-highlighted code blocks for developers',
    icon: '💻',
    category: 'productivity',
    installed: true,
  },
  {
    id: 'map',
    name: 'Maps',
    description: 'Embed interactive maps and locations',
    icon: '🗺️',
    category: 'visualization',
    installed: false,
  },
  {
    id: 'github',
    name: 'GitHub Integration',
    description: 'Link issues, PRs, and commits from GitHub',
    icon: '🐙',
    category: 'integration',
    installed: false,
  },
  {
    id: 'slack',
    name: 'Slack Integration',
    description: 'Receive notifications and updates in Slack',
    icon: '💬',
    category: 'integration',
    installed: false,
  },
];

export function StorePanel(): JSX.Element {
  const [gadgets, setGadgets] = useState<Gadget[]>(AVAILABLE_GADGETS);
  const [filter, setFilter] = useState<'all' | 'installed' | string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredGadgets = gadgets.filter(gadget => {
    const matchesSearch = gadget.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          gadget.description.toLowerCase().includes(searchQuery.toLowerCase());
    if (filter === 'all') return matchesSearch;
    if (filter === 'installed') return matchesSearch && gadget.installed;
    return matchesSearch && gadget.category === filter;
  });

  const toggleInstall = (gadgetId: string): void => {
    setGadgets(prev => prev.map(g =>
      g.id === gadgetId ? { ...g, installed: !g.installed } : g
    ));
  };

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'installed', label: 'Installed' },
    { id: 'productivity', label: 'Productivity' },
    { id: 'collaboration', label: 'Collaboration' },
    { id: 'visualization', label: 'Visualization' },
    { id: 'integration', label: 'Integrations' },
  ];

  return (
    <div className="store-panel">
      <div className="store-header">
        <h3>Gadgets Store</h3>
        <p>Extend Rizzoma with powerful gadgets</p>
      </div>

      <div className="store-search">
        <input
          type="text"
          placeholder="Search gadgets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="store-categories">
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`category-btn ${filter === cat.id ? 'active' : ''}`}
            onClick={() => setFilter(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="gadgets-grid">
        {filteredGadgets.length === 0 ? (
          <div className="empty-state">No gadgets found</div>
        ) : (
          filteredGadgets.map(gadget => (
            <div key={gadget.id} className="gadget-card">
              <div className="gadget-icon">{gadget.icon}</div>
              <div className="gadget-info">
                <div className="gadget-name">{gadget.name}</div>
                <div className="gadget-description">{gadget.description}</div>
              </div>
              <button
                className={`install-btn ${gadget.installed ? 'installed' : ''}`}
                onClick={() => toggleInstall(gadget.id)}
              >
                {gadget.installed ? 'Installed' : 'Install'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
