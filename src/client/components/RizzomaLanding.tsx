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
      <div className="landing-header">
        <img
          src="/landing/logo.png"
          alt="Rizzoma"
          className="rizzoma-logo-img"
        />

        <h1 className="landing-title">Communicate and collaborate in real-time</h1>

        <div className="features-showcase">
          <div className="feature-item">
            <h3>Chat</h3>
          </div>
          <div className="feature-item feature-center">
            <h3>Zoom Doc</h3>
          </div>
          <div className="feature-item">
            <h3>Mindmap</h3>
          </div>
        </div>

        <button
          className="enter-rizzoma-btn"
          onClick={() => setShowLogin(true)}
          aria-label="Enter Rizzoma - It's free"
        />

        <p className="landing-subtitle">Use your Facebook or Gmail account</p>

        <div className="social-buttons">
          <a
            href="https://twitter.com/intent/tweet?text=@rizzomacom%20is%20a%20collaboration%20tool&url=http://rizzoma.com"
            target="_blank"
            rel="noopener noreferrer"
            className="social-btn twitter-btn"
          >
            <span className="social-icon">𝕏</span> Post
          </a>
          <a
            href="https://www.linkedin.com/shareArticle?mini=true&url=http://rizzoma.com"
            target="_blank"
            rel="noopener noreferrer"
            className="social-btn linkedin-btn"
          >
            <span className="social-icon">in</span> Share
          </a>
        </div>
      </div>

      <div className="landing-more">
        <div className="more-btn-container">
          <span className="more-text">MORE</span>
        </div>
      </div>

      <div className="landing-footer">
        <div className="footer-left">
          <a href="mailto:support@rizzoma.com" className="footer-link">support@rizzoma.com</a>
          <a href="http://blog.rizzoma.com/" target="_blank" rel="noopener noreferrer" className="footer-link">Blog</a>
        </div>
        <div className="footer-center">
          <a href="/about-terms.html" className="footer-link">Terms of Use</a>
          <a href="/about-security.html" className="footer-link">Security</a>
          <a href="/about-privacy.html" className="footer-link">Privacy Policy</a>
        </div>
        <div className="footer-right">
          <a
            href="https://play.google.com/store/apps/details?id=com.rizzoma.mobile"
            target="_blank"
            rel="noopener noreferrer"
            className="app-link"
          >
            <img src="/landing/android-app.png" alt="Get it on Google Play" className="android-app-img" />
          </a>
          <a href="#" className="footer-link open-source-link">
            <span className="osi-icon">🔓</span> Open Source Initiative
          </a>
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
