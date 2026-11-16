import { useState } from 'react';
import './TipsBox.css';

export function TipsBox() {
  const [minimized, setMinimized] = useState(false);

  return (
    <div className={`tips-box ${minimized ? 'tips-hidden' : ''}`}>
      <div className="tips-toggle-container">
        <div className="tips-toggle-btn" onClick={() => setMinimized(!minimized)}>
          <div className="diag-border" />
          <span className="tips-toggle-text">
            {minimized ? 'Maximize shortcuts' : 'Minimize shortcuts'}
          </span>
          <div className={`tips-toggle-status ${minimized ? 'min' : ''}`} />
        </div>
        <div className="clearer" />
      </div>

      <div className="tips-delimiter" />

      <table className="tips-head-container" cellSpacing={0} cellPadding={0}>
        <tbody>
          <tr>
            <td>
              <a href="#/" title="Rizzoma" className="rizzoma-logo-link">
                <img className="rizzoma-logo" src="/s/img/tips-rizzoma-logo.png" alt="Rizzoma" />
              </a>
            </td>
            <td className="actions">
              <a href="https://rizzoma.com" target="_blank" rel="noopener noreferrer">Blog</a>
              <a href="https://rizzoma.com" target="_blank" rel="noopener noreferrer">User cases</a>
            </td>
          </tr>
        </tbody>
      </table>

      {!minimized && (
        <div className="tips-content">
          <div className="folded-tips-video">
            <span className="folded-video-name">First steps in Rizzoma:</span>
            <button className="folded-play-pict button" type="button">Play video</button>
          </div>

          <div className="tips-grid">
            <div className="tips-row">
              <div className="tip-item">
                <img src="/s/img/tips-reply-ico.png" alt="" />
                <span>Ctrl+Enter</span>
              </div>
              <div className="tip-item">
                <img src="/s/img/tips-hide-ico.png" alt="" />
                <span>Ctrl+Shift+&uarr;</span>
              </div>
              <div className="tip-item">
                <img src="/s/img/tips-@.png" alt="" />
                <span>@ Mention</span>
              </div>
            </div>

            <div className="tips-row">
              <div className="tip-item">
                <img src="/s/img/tips-next-unread-ico.png" alt="" />
                <span>Ctrl+Space</span>
              </div>
              <div className="tip-item">
                <img src="/s/img/tips-show-ico.png" alt="" />
                <span>Ctrl+Shift+&darr;</span>
              </div>
              <div className="tip-item">
                <img src="/s/img/tips-tilda.png" alt="" />
                <span>~ Task</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
