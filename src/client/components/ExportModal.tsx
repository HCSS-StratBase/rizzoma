import { useState, useCallback } from 'react';
import { type BlipData } from './blip/RizzomaBlip';
import {
  generateTopicHtmlExport,
  generateTopicJsonExport,
  generateTopicTextExport,
} from '../lib/topicExport';
import './ExportModal.css';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicTitle: string;
  topicId: string;
  topicContent?: string;
  blips: BlipData[];
}

type ExportFormat = 'html' | 'json' | 'txt';

export default function ExportModal({ isOpen, onClose, topicTitle, topicId, topicContent, blips }: ExportModalProps) {
  const [selectedFormats, setSelectedFormats] = useState<Set<ExportFormat>>(new Set(['html']));
  const [isExporting, setIsExporting] = useState(false);

  const toggleFormat = useCallback((format: ExportFormat) => {
    setSelectedFormats(prev => {
      const next = new Set(prev);
      if (next.has(format)) {
        next.delete(format);
      } else {
        next.add(format);
      }
      return next;
    });
  }, []);

  const generateHtml = useCallback(
    () => generateTopicHtmlExport({ topicTitle, topicId, topicContent, blips }),
    [topicTitle, topicId, topicContent, blips],
  );
  const generateJson = useCallback(
    () => generateTopicJsonExport({ topicTitle, topicId, topicContent, blips }),
    [topicTitle, topicId, topicContent, blips],
  );
  const generateTxt = useCallback(
    () => generateTopicTextExport({ topicTitle, topicId, topicContent, blips }),
    [topicTitle, topicId, topicContent, blips],
  );

  const handleExport = useCallback(async () => {
    if (selectedFormats.size === 0) return;

    setIsExporting(true);

    try {
      const safeTitle = topicTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);

      for (const format of selectedFormats) {
        let content: string;
        let mimeType: string;
        let extension: string;

        switch (format) {
          case 'html':
            content = generateHtml();
            mimeType = 'text/html';
            extension = 'html';
            break;
          case 'json':
            content = generateJson();
            mimeType = 'application/json';
            extension = 'json';
            break;
          case 'txt':
          default:
            content = generateTxt();
            mimeType = 'text/plain';
            extension = 'txt';
            break;
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeTitle}.${extension}`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);

        // Small delay between downloads
        if (selectedFormats.size > 1) {
          await new Promise(r => setTimeout(r, 300));
        }
      }

      onClose();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [selectedFormats, topicTitle, generateHtml, generateJson, generateTxt, onClose]);

  if (!isOpen) return null;

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal" onClick={e => e.stopPropagation()}>
        <div className="export-modal-header">
          <h3>Export Topic</h3>
          <button className="export-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="export-modal-body">
          <p className="export-modal-subtitle">
            Select export format(s) for "{topicTitle}"
          </p>

          <div className="export-format-options">
            <label className={`export-format-option ${selectedFormats.has('html') ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={selectedFormats.has('html')}
                onChange={() => toggleFormat('html')}
              />
              <div className="format-info">
                <span className="format-name">HTML</span>
                <span className="format-desc">Formatted document with styling, viewable in browser</span>
              </div>
            </label>

            <label className={`export-format-option ${selectedFormats.has('json') ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={selectedFormats.has('json')}
                onChange={() => toggleFormat('json')}
              />
              <div className="format-info">
                <span className="format-name">JSON</span>
                <span className="format-desc">Structured data for import/backup, preserves hierarchy</span>
              </div>
            </label>

            <label className={`export-format-option ${selectedFormats.has('txt') ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={selectedFormats.has('txt')}
                onChange={() => toggleFormat('txt')}
              />
              <div className="format-info">
                <span className="format-name">Plain Text</span>
                <span className="format-desc">Simple text file, universal compatibility</span>
              </div>
            </label>
          </div>
        </div>

        <div className="export-modal-footer">
          <button className="export-btn cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="export-btn primary"
            onClick={handleExport}
            disabled={selectedFormats.size === 0 || isExporting}
          >
            {isExporting ? 'Exporting...' : `Export ${selectedFormats.size > 0 ? `(${selectedFormats.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
