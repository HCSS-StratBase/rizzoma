import { useState, useRef, useEffect } from 'react';
import { 
  Video, 
  Code, 
  Vote, 
  Sigma, 
  ExternalLink, 
  Table, 
  CalendarDays,
  Columns3,
  FileText, 
  Image as ImageIcon,
  X
} from 'lucide-react';
import { AVAILABLE_GADGETS } from '../gadgets/registry';
import type { GadgetManifest, GadgetType } from '../gadgets/types';
import { resolveGadgetUrl } from '../gadgets/embedAdapters';
import { GADGET_APP_INSTALL_EVENT, readInstalledAppIds, syncInstalledAppIdsFromServer } from '../gadgets/apps/installState';
import './GadgetPalette.css';

export type { GadgetType } from '../gadgets/types';

function getGadgetIcon(icon: GadgetManifest['icon']) {
  switch (icon) {
    case 'video':
      return <Video size={20} />;
    case 'code':
      return <Code size={20} />;
    case 'vote':
      return <Vote size={20} />;
    case 'sigma':
      return <Sigma size={20} />;
    case 'external-link':
      return <ExternalLink size={20} />;
    case 'table':
      return <Table size={20} />;
    case 'columns':
      return <Columns3 size={20} />;
    case 'calendar':
      return <CalendarDays size={20} />;
    case 'image':
      return <ImageIcon size={20} />;
    default:
      return <FileText size={20} />;
  }
}

interface GadgetPaletteProps {
  onSelect: (type: GadgetType, url?: string) => void;
  onClose: () => void;
}

export function GadgetPalette({ onSelect, onClose }: GadgetPaletteProps) {
  const [urlInput, setUrlInput] = useState('');
  const [selectedGadget, setSelectedGadget] = useState<GadgetManifest | null>(null);
  const [urlError, setUrlError] = useState('');
  const [installedAppIds, setInstalledAppIds] = useState<string[]>(() => readInstalledAppIds());
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visibleGadgets = AVAILABLE_GADGETS.filter((gadget) =>
    gadget.kind !== 'app' || (gadget.appId && installedAppIds.includes(gadget.appId))
  );

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Focus URL input when a URL gadget is selected
  useEffect(() => {
    if (selectedGadget?.needsUrl) {
      inputRef.current?.focus();
    }
  }, [selectedGadget]);

  useEffect(() => {
    const handleInstallState = () => {
      setInstalledAppIds(readInstalledAppIds());
    };
    window.addEventListener(GADGET_APP_INSTALL_EVENT, handleInstallState);
    window.addEventListener('storage', handleInstallState);
    return () => {
      window.removeEventListener(GADGET_APP_INSTALL_EVENT, handleInstallState);
      window.removeEventListener('storage', handleInstallState);
    };
  }, []);

  useEffect(() => {
    void syncInstalledAppIdsFromServer()
      .then((serverIds) => {
        setInstalledAppIds(serverIds);
      })
      .catch(() => {});
  }, []);

  const handleGadgetClick = (gadget: GadgetManifest) => {
    if (gadget.needsUrl) {
      setSelectedGadget(gadget);
      setUrlInput('');
      setUrlError('');
    } else {
      onSelect(gadget.type);
      onClose();
    }
  };

  const handleUrlSubmit = () => {
    if (selectedGadget && urlInput.trim()) {
      try {
        const resolved = resolveGadgetUrl(selectedGadget.type, urlInput.trim());
        onSelect(selectedGadget.type, resolved.normalizedUrl);
        setUrlError('');
      } catch (error) {
        setUrlError(error instanceof Error ? error.message : 'Invalid URL.');
        return;
      }
      onClose();
    }
  };

  return (
    <div className="gadget-palette" ref={ref}>
      <div className="gadget-palette-header">
        <div>
          <div className="gadget-palette-title">Insert Gadget</div>
          <div className="gadget-palette-subtitle">Built-ins, trusted embeds, and installed apps for this workspace</div>
        </div>
        <button className="gadget-palette-close" onClick={onClose}><X size={18} /></button>
      </div>

      {selectedGadget?.needsUrl ? (
        <div className="gadget-url-input">
          <div className="gadget-url-label">{selectedGadget.label}</div>
          {selectedGadget.urlHint ? <div className="gadget-url-hint">{selectedGadget.urlHint}</div> : null}
          <input
            ref={inputRef}
            type="text"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              if (urlError) setUrlError('');
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleUrlSubmit(); if (e.key === 'Escape') { setSelectedGadget(null); setUrlError(''); } }}
            placeholder={selectedGadget.placeholder}
            className="gadget-url-field"
          />
          {urlError ? <div className="gadget-url-error">{urlError}</div> : null}
          <div className="gadget-url-actions">
            <button onClick={() => { setSelectedGadget(null); setUrlError(''); }} className="gadget-url-back">Back</button>
            <button onClick={handleUrlSubmit} className="gadget-url-ok" disabled={!urlInput.trim()}>Insert</button>
          </div>
        </div>
      ) : (
        <div className="gadget-grid">
          {visibleGadgets.map((g) => (
            <button
              key={g.type}
              className="gadget-tile"
              onClick={() => handleGadgetClick(g)}
              title={g.label}
            >
              <span className="gadget-tile-icon" style={{ color: g.accent }}>{getGadgetIcon(g.icon)}</span>
              {g.kind === 'app' ? <span className="gadget-tile-badge">Installed app</span> : null}
              <span className="gadget-tile-label">{g.label}</span>
              <span className="gadget-tile-description">{g.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
