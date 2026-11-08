import { useEffect, useMemo, useState } from 'react';
import { AVAILABLE_GADGETS } from '../gadgets/registry';
import { GADGET_APP_CATALOG } from '../gadgets/apps/catalog';
import { describeSandboxedApp } from '../gadgets/apps/runtime';
import type { GadgetAvailability, GadgetCatalogCategory } from '../gadgets/types';
import {
  readInstalledAppIds,
  resetInstalledAppIdsToServer,
  saveInstalledAppIdsToServer,
  setAppInstalled,
  syncInstalledAppIdsFromServer,
} from '../gadgets/apps/installState';
import { toast } from './Toast';
import './StorePanel.css';

type StoreEntry = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: GadgetCatalogCategory;
  accent: string;
  availability: GadgetAvailability;
  kind: 'native' | 'embed' | 'app';
  runtimeLabel: string;
  permissions: string[];
  appId?: string;
  installed?: boolean;
};

const AVAILABILITY_COPY: Record<GadgetAvailability, string> = {
  'built-in': 'Built in',
  trusted: 'Trusted embed',
  preview: 'Runtime preview',
  planned: 'Planned',
};

const CATEGORY_LABELS: Array<{ id: 'all' | 'installed' | GadgetCatalogCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'installed', label: 'Live now' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'collaboration', label: 'Collaboration' },
  { id: 'visualization', label: 'Visualization' },
  { id: 'integration', label: 'Integrations' },
];

function gadgetKindLabel(kind: StoreEntry['kind']): string {
  switch (kind) {
    case 'native':
      return 'Native gadget';
    case 'embed':
      return 'Trusted embed';
    case 'app':
      return 'Sandboxed app';
  }
}

function buildStoreEntries(): StoreEntry[] {
  const nativeAndEmbed = AVAILABLE_GADGETS
    .filter((gadget) => gadget.kind !== 'app')
    .map((gadget) => ({
    id: gadget.type,
    name: gadget.label,
    description: gadget.description,
    icon:
      gadget.type === 'youtube' ? '▶' :
      gadget.type === 'poll' ? '☑' :
      gadget.type === 'code' ? '</>' :
      gadget.type === 'latex' ? '∑' :
      gadget.type === 'spreadsheet' ? '▦' :
      gadget.type === 'image' ? '◫' :
      '↗',
    category: gadget.category || 'productivity',
    accent: gadget.accent,
    availability: gadget.availability || 'built-in',
    kind: gadget.kind || 'native',
    runtimeLabel: gadget.kind === 'embed' ? 'URL adapter + editor node' : 'Editor node',
    permissions: gadget.kind === 'embed' ? ['Curated URL normalization', 'In-topic rendering'] : ['Editor document state'],
  }));

  const apps = GADGET_APP_CATALOG.map((manifest) => {
    const sandbox = describeSandboxedApp(manifest);
    return {
      id: manifest.id,
      name: manifest.label,
      description: manifest.description,
      icon: manifest.icon,
      category: manifest.category,
      accent: manifest.accent,
      availability: manifest.availability,
      kind: 'app' as const,
      runtimeLabel: `Sandbox: ${sandbox.sandbox}`,
      permissions: manifest.permissions.map((permission) => permission.replace('.', ': ')),
      appId: manifest.id,
    };
  });

  return [...nativeAndEmbed, ...apps];
}

export function StorePanel(): JSX.Element {
  const [filter, setFilter] = useState<'all' | 'installed' | GadgetCatalogCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [installedAppIds, setInstalledAppIds] = useState<string[]>(() => readInstalledAppIds());
  const [savingAppId, setSavingAppId] = useState<string | null>(null);
  const [resettingDefaults, setResettingDefaults] = useState(false);

  const entries = useMemo(() => buildStoreEntries(), []);
  const entriesWithState = entries.map((entry) => ({
    ...entry,
    installed: entry.kind === 'app' ? !!entry.appId && installedAppIds.includes(entry.appId) : entry.availability !== 'planned',
  }));

  const filteredEntries = entriesWithState.filter((entry) => {
    const matchesSearch =
      entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.description.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filter === 'all') return true;
    if (filter === 'installed') return !!entry.installed;
    return entry.category === filter;
  });

  const handleAppToggle = (entry: StoreEntry) => {
    if (entry.kind !== 'app' || !entry.appId || entry.availability === 'planned') return;
    const nextInstalled = !installedAppIds.includes(entry.appId);
    const optimistic = setAppInstalled(entry.appId, nextInstalled);
    setInstalledAppIds(optimistic);
    setSavingAppId(entry.appId);
    void saveInstalledAppIdsToServer(optimistic)
      .then((saved) => {
        setInstalledAppIds(saved);
      })
      .catch(() => {
        const reverted = setAppInstalled(entry.appId!, !nextInstalled);
        setInstalledAppIds(reverted);
        toast('Failed to save gadget install state', 'error');
      })
      .finally(() => {
        setSavingAppId(null);
      });
  };

  useEffect(() => {
    void syncInstalledAppIdsFromServer()
      .then((serverIds) => {
        setInstalledAppIds(serverIds);
      })
      .catch(() => {});
  }, []);

  const handleResetDefaults = () => {
    setResettingDefaults(true);
    void resetInstalledAppIdsToServer()
      .then((serverIds) => {
        setInstalledAppIds(serverIds);
      })
      .catch(() => {
        toast('Failed to reset gadget preferences', 'error');
      })
      .finally(() => {
        setResettingDefaults(false);
      });
  };

  return (
    <div className="store-panel">
      <div className="store-header">
        <h3>Gadget Runtime</h3>
        <p>Built-in gadgets, trusted embeds, and the next sandboxed app layer.</p>
      </div>

      <div className="store-runtime-note">
        <div className="store-runtime-title">Current runtime boundary</div>
        <div className="store-runtime-copy">
          Native gadgets and trusted embeds are live now. Sandboxed apps are defined by manifest and host-API
          contract first, before any “install” action is allowed to touch documents.
        </div>
        <div className="store-runtime-copy">
          Preview-app availability is stored per signed-in user. Resetting defaults restores the preview apps that ship in the workspace.
        </div>
        <button
          className="store-reset-defaults"
          onClick={handleResetDefaults}
          disabled={resettingDefaults}
        >
          {resettingDefaults ? 'Resetting…' : 'Reset preview apps'}
        </button>
      </div>

      <div className="store-search">
        <input
          type="text"
          placeholder="Search gadgets and app manifests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="store-categories">
        {CATEGORY_LABELS.map((category) => (
          <button
            key={category.id}
            className={`category-btn ${filter === category.id ? 'active' : ''}`}
            onClick={() => setFilter(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="gadgets-grid">
        {filteredEntries.length === 0 ? (
          <div className="empty-state">No gadgets found</div>
        ) : (
          filteredEntries.map((entry) => (
            <article key={entry.id} className="gadget-card">
              <div className="gadget-icon" style={{ color: entry.accent }}>{entry.icon}</div>
              <div className="gadget-info">
                <div className="gadget-meta">
                  <span className={`gadget-badge availability-${entry.availability}`}>{AVAILABILITY_COPY[entry.availability]}</span>
                  <span className="gadget-badge gadget-kind">{gadgetKindLabel(entry.kind)}</span>
                </div>
                <div className="gadget-name">{entry.name}</div>
                <div className="gadget-description">{entry.description}</div>
                <div className="gadget-runtime">
                  {entry.runtimeLabel}
                  {entry.kind === 'app' && entry.installed ? ' • Available in gadget picker' : ''}
                </div>
                <div className="gadget-permissions">
                  {entry.permissions.map((permission) => (
                    <span key={permission} className="permission-pill">{permission}</span>
                  ))}
                </div>
              </div>
              <div className="install-state">
                <div className="install-state-label">{AVAILABILITY_COPY[entry.availability]}</div>
                <div className="install-state-subcopy">
                  {entry.availability === 'planned'
                    ? 'Manifest only'
                    : entry.kind === 'app'
                      ? entry.installed ? 'Installed in workspace' : 'Not in picker yet'
                      : entry.availability === 'preview'
                        ? 'Runtime contract defined'
                      : 'Ready in editor'}
                </div>
                {entry.kind === 'app' ? (
                  <button
                    className={`install-action ${entry.installed ? 'remove' : 'install'}`}
                    onClick={() => handleAppToggle(entry)}
                    disabled={entry.availability === 'planned' || savingAppId === entry.appId}
                  >
                    {entry.availability === 'planned' ? 'Planned' : savingAppId === entry.appId ? 'Saving…' : entry.installed ? 'Remove' : 'Install'}
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
