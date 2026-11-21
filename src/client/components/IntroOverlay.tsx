import { useEffect, useState } from 'react';
import './IntroOverlay.css';

/** Session flag set right after a person creates a new account; the overlay shows once for them. */
export const INTRO_SESSION_KEY = 'rizzoma:showIntro';
export function markIntroForNewAccount(): void { try { window.sessionStorage.setItem(INTRO_SESSION_KEY, '1'); } catch { /* storage blocked */ } }
export function introIsPending(): boolean { try { return window.sessionStorage.getItem(INTRO_SESSION_KEY) === '1'; } catch { return false; } }

const SLIDES: Array<{ title: string; text: string }> = [
  { title: 'A topic is a tree of replies', text: 'Press Ctrl+Enter inside a blip to write a reply right at the cursor. Replies hide behind a [+] marker and open in place.' },
  { title: 'Write, mention, assign', text: 'Press Edit (or click the text) to write. Type @ to mention a person, ~ to assign a task, # to add a tag.' },
  { title: 'Invite people', text: 'Use Invite and Share at the top of a topic to add people by e-mail and to choose who can read or edit.' },
  { title: 'Never lose your place', text: 'The green Next button walks you through everything unread, one blip at a time. Hide and Show replies fold the tree.' },
];

/** The original's "Check it later" introduction for new users (introduce/template.coffee): four tips, Prev / Next, progress dots, close. */
export default function IntroOverlay({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const close = () => { try { window.sessionStorage.removeItem(INTRO_SESSION_KEY); } catch { /* ignore */ } onClose(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { try { window.sessionStorage.removeItem(INTRO_SESSION_KEY); } catch { /* ignore */ } onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const slide = SLIDES[i]!;
  return (
    <div className="introduce" data-testid="intro-overlay" role="dialog" aria-label="Introduction">
      <div className="introduce-background" onClick={close} />
      <div className="introduce-box">
        <div className="introduce-header">
          <div className="introduce-nav">
            <button type="button" className="introduce-prev" data-testid="intro-prev" disabled={i === 0} onClick={() => setI(i - 1)}>Prev tip</button>
            <div className="introduce-progress" aria-label={`Tip ${i + 1} of ${SLIDES.length}`}>
              {SLIDES.map((_, k) => <span key={k} className={`introduce-dot${k === i ? ' active' : ''}`} />)}
            </div>
            <button type="button" className="introduce-next" data-testid="intro-next" disabled={i === SLIDES.length - 1} onClick={() => setI(i + 1)}>Next tip</button>
          </div>
          <button type="button" className="introduce-closer" data-testid="intro-close" onClick={close}>Check it later &times;</button>
        </div>
        <div className="introduce-slide">
          <h3>{slide.title}</h3>
          <p>{slide.text}</p>
        </div>
      </div>
    </div>
  );
}
