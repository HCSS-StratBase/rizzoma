import { useState } from 'react';
import { AuthPanel } from './AuthPanel';
import './RizzomaLanding.css';

interface RizzomaLandingProps {
  onSignedIn?: (user: { id?: string; email?: string }) => void;
}

export function RizzomaLanding({ onSignedIn }: RizzomaLandingProps) {
  const [showLogin, setShowLogin] = useState(false);

  return (
    <div className="rizzoma-landing">
      <div className="landing-content">
        <div className="rizzoma-logo">
          <span className="logo-r">R</span>
          <span className="logo-text">RIZZOMA</span>
        </div>
        
        <h1 className="landing-title">Communicate and collaborate in real-time</h1>
        
        <div className="features-showcase">
          <div className="feature-item">
            <div className="feature-icon chat-icon">💬</div>
            <h3>Chat</h3>
          </div>
          <div className="feature-item">
            <div className="feature-icon doc-icon">📄</div>
            <h3>Zoom Doc</h3>
          </div>
          <div className="feature-item">
            <div className="feature-icon mindmap-icon">🗺️</div>
            <h3>Mindmap</h3>
          </div>
        </div>
        
        <button 
          className="enter-rizzoma-btn"
          onClick={() => setShowLogin(true)}
        >
          Enter Rizzoma
          <span className="btn-subtitle">It's free</span>
        </button>
        
        <p className="landing-subtitle">Use your Facebook or Gmail account</p>
        
        <div className="social-buttons">
          <button className="social-btn twitter-btn">
            <span className="social-icon">𝕏</span> Post
          </button>
          <button className="social-btn linkedin-btn">
            <span className="social-icon">in</span> Share
          </button>
          <button className="social-btn facebook-btn">
            <span className="social-icon">f</span> Share
          </button>
        </div>
      </div>
      
      <div className="landing-footer">
        <div className="footer-links">
          <a href="#" className="footer-link">Blog</a>
          <a href="mailto:support@rizzoma.com" className="footer-link">support@rizzoma.com</a>
        </div>
        <div className="footer-legal">
          <a href="#" className="footer-link">Terms of Use</a>
          <a href="#" className="footer-link">Security</a>
          <a href="#" className="footer-link">Privacy Policy</a>
        </div>
        <div className="footer-apps">
          <a href="#" className="app-link">
            <img src="/android-app.svg" alt="Get it on Google Play" />
          </a>
          <a href="#" className="footer-link">Open Source Initiative</a>
        </div>
      </div>
      
      {showLogin && (
        <div className="login-overlay" onClick={() => setShowLogin(false)}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              className="close-btn" 
              onClick={() => setShowLogin(false)}
            >
              ×
            </button>
            <h3 style={{ marginTop: 0 }}>Sign in to continue</h3>
            <AuthPanel
              onSignedIn={(user) => {
                setShowLogin(false);
                if (onSignedIn) onSignedIn(user);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
