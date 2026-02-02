import { useState, useCallback } from 'react';
import { type BlipData } from './blip/RizzomaBlip';
import './ExportModal.css';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicTitle: string;
  topicId: string;
  blips: BlipData[];
}

type ExportFormat = 'html' | 'json' | 'txt';

// Internal type for tree building
type BlipNode = BlipData & { children: BlipNode[] };

export default function ExportModal({ isOpen, onClose, topicTitle, topicId, blips }: ExportModalProps) {
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

  // Build nested blip tree for better export structure
  const buildBlipTree = useCallback((flatBlips: BlipData[]): BlipNode[] => {
    const map = new Map<string, BlipNode>();
    const roots: BlipNode[] = [];

    // Create copies with children arrays
    flatBlips.forEach(b => {
      map.set(b.id, { ...b, children: [] });
    });

    // Build tree
    flatBlips.forEach(b => {
      const node = map.get(b.id)!;
      if (b.parentBlipId && map.has(b.parentBlipId)) {
        map.get(b.parentBlipId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }, []);

  // Helper to get best available author display name
  const getAuthorDisplay = (blip: BlipNode): string => {
    if (blip.authorName && blip.authorName !== 'Anonymous') {
      return blip.authorName;
    }
    if (blip.authorId) {
      // Show truncated ID if we only have Anonymous + ID
      return `User ${blip.authorId.slice(-8)}`;
    }
    return 'Unknown';
  };

  const generateHtml = useCallback((): string => {
    const renderBlipHtml = (blip: BlipNode, level: number = 0): string => {
      const indent = '  '.repeat(level);
      const content = blip.content || '(empty)';
      const author = getAuthorDisplay(blip);
      const date = blip.updatedAt || blip.createdAt
        ? new Date(blip.updatedAt || blip.createdAt).toLocaleString()
        : '';

      const childrenHtml = blip.children.length > 0
        ? `\n${indent}  <ul class="blip-children">\n${blip.children.map(c => `${indent}    <li>${renderBlipHtml(c, level + 2)}</li>`).join('\n')}\n${indent}  </ul>`
        : '';

      return `<div class="blip">
${indent}  <div class="blip-meta">
${indent}    <span class="blip-author">${escapeHtml(author)}</span>
${indent}    ${date ? `<span class="blip-date">${escapeHtml(date)}</span>` : ''}
${indent}  </div>
${indent}  <div class="blip-content">${escapeHtml(content)}</div>${childrenHtml}
${indent}</div>`;
    };

    const tree = buildBlipTree(blips);
    const blipsHtml = tree.map(b => `    <li>${renderBlipHtml(b, 2)}</li>`).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(topicTitle)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      color: #333;
    }
    h1 {
      border-bottom: 2px solid #4EA0F1;
      padding-bottom: 10px;
      margin-bottom: 30px;
    }
    .export-meta {
      color: #666;
      font-size: 14px;
      margin-bottom: 20px;
    }
    ul.blips-list {
      list-style: disc;
      padding-left: 24px;
    }
    ul.blip-children {
      list-style: circle;
      padding-left: 24px;
      margin-top: 8px;
    }
    ul.blip-children ul.blip-children {
      list-style: square;
    }
    .blip {
      margin-bottom: 12px;
    }
    .blip-meta {
      font-size: 12px;
      color: #888;
      margin-bottom: 4px;
    }
    .blip-author {
      font-weight: 500;
    }
    .blip-date {
      margin-left: 10px;
    }
    .blip-content {
      white-space: pre-wrap;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #999;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(topicTitle)}</h1>
  <div class="export-meta">
    Exported from Rizzoma on ${new Date().toLocaleString()}
  </div>
  <ul class="blips-list">
${blipsHtml}
  </ul>
  <div class="footer">
    Exported from Rizzoma &bull; Topic ID: ${escapeHtml(topicId)}
  </div>
</body>
</html>`;
  }, [topicTitle, topicId, blips, buildBlipTree]);

  const generateJson = useCallback((): string => {
    const tree = buildBlipTree(blips);

    const mapBlip = (b: BlipNode): Record<string, unknown> => ({
      id: b.id,
      content: b.content,
      // Author info
      authorId: b.authorId || null,
      authorName: b.authorName || null,
      authorAvatar: b.authorAvatar || null,
      // Timestamps
      createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : null,
      updatedAt: b.updatedAt ? new Date(b.updatedAt).toISOString() : null,
      // State
      isRead: b.isRead,
      isFoldedByDefault: typeof b.isFoldedByDefault === 'boolean' ? b.isFoldedByDefault : false,
      deleted: b.deleted || false,
      deletedAt: b.deletedAt ? new Date(b.deletedAt).toISOString() : null,
      // Hierarchy
      parentBlipId: b.parentBlipId || null,
      // Permissions at export time
      permissions: b.permissions,
      // Nested children
      children: b.children.map(mapBlip)
    });

    const exportData = {
      title: topicTitle,
      topicId: topicId,
      exportedAt: new Date().toISOString(),
      blipCount: blips.length,
      blips: tree.map(mapBlip)
    };

    return JSON.stringify(exportData, null, 2);
  }, [topicTitle, topicId, blips, buildBlipTree]);

  const generateTxt = useCallback((): string => {
    const renderBlipTxt = (blip: BlipNode, level: number = 0): string => {
      const indent = '  '.repeat(level);
      const bullet = level === 0 ? '• ' : level === 1 ? '◦ ' : '▪ ';
      const content = blip.content || '(empty)';
      const childrenTxt = blip.children.map(c => renderBlipTxt(c, level + 1)).join('\n');

      return `${indent}${bullet}${content}${childrenTxt ? '\n' + childrenTxt : ''}`;
    };

    const tree = buildBlipTree(blips);
    const blipsTxt = tree.map(b => renderBlipTxt(b)).join('\n\n');

    return `${topicTitle}
${'='.repeat(topicTitle.length)}

${blipsTxt}

---
Exported from Rizzoma on ${new Date().toLocaleString()}
Topic ID: ${topicId}`;
  }, [topicTitle, topicId, blips, buildBlipTree]);

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
        a.click();
        URL.revokeObjectURL(url);

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
