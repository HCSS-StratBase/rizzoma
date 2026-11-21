import { useEffect } from 'react';
import './HelpOverlay.css';

interface HelpOverlayProps { onClose: () => void }

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl+Enter', 'Write a reply inside the blip, at the cursor (creates a child with a [+] marker)'],
  ['Ctrl+Shift+Up', 'Hide all replies'],
  ['Ctrl+Shift+Down', 'Show all replies'],
  ['Ctrl+E or Shift+Enter', 'Done: leave edit mode'],
  ['Ctrl+B, Ctrl+I, Ctrl+U', 'Bold, italic, underline'],
  ['@', 'Mention a person'],
  ['~', 'Insert a task'],
  ['#', 'Insert a tag'],
  ['Escape', 'Close a menu or dialog'],
];

/** The Help window of the left rail (the original's Help button opens a help overlay): the shortcuts and the first steps. */
export function HelpOverlay({ onClose }: HelpOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="help-overlay-backdrop" role="presentation" onClick={onClose}>
      <div className="help-overlay" role="dialog" aria-modal="true" aria-label="Help" data-testid="help-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="help-overlay-head"><h2>Help</h2><button type="button" className="help-overlay-close" aria-label="Close help" onClick={onClose}>&times;</button></div>
        <h3>First steps</h3>
        <ul>
          <li>A topic is a bulleted outline. Click a [+] to open the reply behind a bullet, in place.</li>
          <li>Press Edit (or click into a blip) to write; press Ctrl+Enter to add a reply at the cursor; press Done when finished.</li>
          <li>Use Invite and Share at the top of a topic to add people and set who can read it.</li>
        </ul>
        <h3>Keyboard shortcuts</h3>
        <table className="help-overlay-shortcuts"><tbody>
          {SHORTCUTS.map(([k, d]) => (<tr key={k}><th scope="row">{k}</th><td>{d}</td></tr>))}
        </tbody></table>
      </div>
    </div>
  );
}
