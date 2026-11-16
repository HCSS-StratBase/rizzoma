import { useState } from 'react';
import { formatLatexToPlain } from '../lib/renderLatex';
import type { BlipData } from './blip/RizzomaBlip';
import './MindMapView.css';

interface MindMapViewProps {
  topicTitle: string;
  topicId: string;
  rootContent?: string;
  blips: BlipData[];
  displayMode: 'short' | 'expanded';
  onSelectBlip: (blipId: string) => void;
}

function stripHtml(html: string): string {
  return html
    .replace(/<span[^>]*class="[^"]*blip-thread-marker[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\$\$\s*\$\$/g, '')
    .replace(/\$\$([^$]+)\$\$/g, (_m, expr: string) => formatLatexToPlain(expr))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBulletLines(html: string, skipHeading = false): string[] {
  const cleaned = skipHeading ? html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, '') : html;
  const liMatches = Array.from(cleaned.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
    .map((m) => stripHtml(m[1]))
    .filter(Boolean);
  if (liMatches.length > 0) return liMatches;
  const blockMatches = Array.from(cleaned.matchAll(/<(?:p|blockquote|pre|h[1-6])[^>]*>([\s\S]*?)<\/(?:p|blockquote|pre|h[1-6])>/gi))
    .map((m) => stripHtml(m[1]))
    .filter(Boolean);
  if (blockMatches.length > 0) return blockMatches;
  const fallback = stripHtml(cleaned);
  return fallback ? [fallback] : ['Empty blip'];
}

function formatLine(line: string, displayMode: 'short' | 'expanded'): string {
  if (displayMode === 'expanded') return line;
  return line.length > 38 ? `${line.slice(0, 35)}...` : line;
}

function MindMapBranch({
  blip,
  displayMode,
  onSelectBlip,
  depth,
}: {
  blip: BlipData;
  displayMode: 'short' | 'expanded';
  onSelectBlip: (blipId: string) => void;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const children = blip.childBlips || [];
  const lines = extractBulletLines(blip.content || '');

  return (
    <div className={`mindmap-branch depth-${depth}`} data-blip-id={blip.id}>
      <div className="mindmap-node-row">
        <div
          className={`mindmap-node ${blip.isRead === false ? 'unread' : ''} ${displayMode === 'short' ? 'short' : 'expanded'}`}
          onClick={() => onSelectBlip(blip.id)}
          role="button"
          tabIndex={0}
          title={blip.authorName ? `By ${blip.authorName}` : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectBlip(blip.id);
            }
          }}
        >
          <div className="mindmap-node-body">
            {lines.map((line, idx) => (
              <div key={idx} className="mindmap-node-line">
                {idx === 0 && blip.isRead === false && <span className="mindmap-unread-dot" aria-label="Unread" />}
                <span>• {formatLine(line, displayMode)}</span>
              </div>
            ))}
          </div>
        </div>
        {children.length > 0 && (
          <button
            type="button"
            className="mindmap-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
            title={collapsed ? `Expand ${children.length} child(ren)` : 'Collapse branch'}
          >
            {collapsed ? '+' : '−'}
          </button>
        )}
      </div>

      {!collapsed && children.length > 0 && (
        <div className="mindmap-children">
          {children.map((child) => (
            <MindMapBranch
              key={child.id}
              blip={child}
              displayMode={displayMode}
              onSelectBlip={onSelectBlip}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Interactive horizontal Mind Map view matching legacy Rizzoma's compact grey-node tree.
 */
export function MindMapView({
  topicTitle,
  topicId,
  rootContent,
  blips,
  displayMode,
  onSelectBlip,
}: MindMapViewProps) {
  const [rootCollapsed, setRootCollapsed] = useState(false);
  const rootLines = rootContent ? extractBulletLines(rootContent, true) : [];

  return (
    <div className="mindmap-container" data-testid="mindmap-view" data-display-mode={displayMode}>
      <h1 className="mindmap-root-heading" onClick={() => onSelectBlip(topicId)}>
        {topicTitle || 'Untitled Topic'}
      </h1>
      <div className="mindmap-tree">
        <div className="mindmap-root-stem" aria-hidden="true" />
        <div className="mindmap-branch depth-0">
          <div className="mindmap-node-row">
            <div
              className={`mindmap-node root-node ${displayMode === 'short' ? 'short' : 'expanded'}`}
              onClick={() => onSelectBlip(topicId)}
              role="button"
              tabIndex={0}
            >
              <div className="mindmap-node-body">
                {(rootLines.length > 0 ? rootLines : [topicTitle || 'Root']).map((line, idx) => (
                  <div key={idx} className="mindmap-node-line">
                    <span>• {formatLine(line, displayMode)}</span>
                  </div>
                ))}
              </div>
            </div>
            {blips.length > 0 && (
              <button
                type="button"
                className="mindmap-toggle-btn"
                onClick={() => setRootCollapsed((c) => !c)}
                title={rootCollapsed ? `Expand ${blips.length} branch(es)` : 'Collapse root'}
              >
                {rootCollapsed ? '+' : '−'}
              </button>
            )}
          </div>
          {!rootCollapsed && blips.length > 0 && (
            <div className="mindmap-children root-children">
              {blips.map((blip) => (
                <MindMapBranch
                  key={blip.id}
                  blip={blip}
                  displayMode={displayMode}
                  onSelectBlip={onSelectBlip}
                  depth={1}
                />
              ))}
            </div>
          )}
        </div>
        {blips.length === 0 && (
          <div className="mindmap-empty">No blips in this topic yet.</div>
        )}
      </div>
    </div>
  );
}
