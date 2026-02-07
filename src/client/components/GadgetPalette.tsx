import { useState, useRef, useEffect } from 'react';
import './GadgetPalette.css';

export type GadgetType =
  | 'youtube'
  | 'code'
  | 'poll'
  | 'latex'
  | 'iframe'
  | 'spreadsheet'
  | 'bubble'
  | 'pollo'
  | 'googley-like'
  | 'contentz'
  | 'image';

interface GadgetDef {
  type: GadgetType;
  label: string;
  icon: string;
  needsUrl?: boolean;
  placeholder?: string;
}

const GADGETS: GadgetDef[] = [
  { type: 'youtube', label: 'YouTube', icon: '\u25B6', needsUrl: true, placeholder: 'YouTube URL...' },
  { type: 'code', label: 'Code', icon: '</>' },
  { type: 'poll', label: 'Yes|No|Maybe', icon: '\u2713' },
  { type: 'latex', label: 'LaTeX', icon: '\u03A3' },
  { type: 'iframe', label: 'iFrame', icon: '\u29C9', needsUrl: true, placeholder: 'Embed URL...' },
  { type: 'spreadsheet', label: 'Spreadsheet', icon: '\u2637', needsUrl: true, placeholder: 'Google Sheets URL...' },
  { type: 'bubble', label: 'Bubble', icon: '\u25CB' },
  { type: 'pollo', label: 'Pollo', icon: '\u2605' },
  { type: 'googley-like', label: 'Like', icon: '\u2764' },
  { type: 'contentz', label: 'ContentZ', icon: '\u00A7' },
  { type: 'image', label: 'Image', icon: '\u25A1', needsUrl: true, placeholder: 'Image URL...' },
];

interface GadgetPaletteProps {
  onSelect: (type: GadgetType, url?: string) => void;
  onClose: () => void;
}

export function GadgetPalette({ onSelect, onClose }: GadgetPaletteProps) {
  const [urlInput, setUrlInput] = useState('');
  const [selectedGadget, setSelectedGadget] = useState<GadgetDef | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleGadgetClick = (gadget: GadgetDef) => {
    if (gadget.needsUrl) {
      setSelectedGadget(gadget);
      setUrlInput('');
    } else {
      onSelect(gadget.type);
      onClose();
    }
  };

  const handleUrlSubmit = () => {
    if (selectedGadget && urlInput.trim()) {
      onSelect(selectedGadget.type, urlInput.trim());
      onClose();
    }
  };

  return (
    <div className="gadget-palette" ref={ref}>
      <div className="gadget-palette-header">
        Insert Gadget
        <button className="gadget-palette-close" onClick={onClose}>&times;</button>
      </div>

      {selectedGadget?.needsUrl ? (
        <div className="gadget-url-input">
          <div className="gadget-url-label">{selectedGadget.label}</div>
          <input
            ref={inputRef}
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleUrlSubmit(); if (e.key === 'Escape') { setSelectedGadget(null); } }}
            placeholder={selectedGadget.placeholder}
            className="gadget-url-field"
          />
          <div className="gadget-url-actions">
            <button onClick={() => setSelectedGadget(null)} className="gadget-url-back">Back</button>
            <button onClick={handleUrlSubmit} className="gadget-url-ok" disabled={!urlInput.trim()}>Insert</button>
          </div>
        </div>
      ) : (
        <div className="gadget-grid">
          {GADGETS.map((g) => (
            <button
              key={g.type}
              className="gadget-tile"
              onClick={() => handleGadgetClick(g)}
              title={g.label}
            >
              <span className="gadget-tile-icon">{g.icon}</span>
              <span className="gadget-tile-label">{g.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
