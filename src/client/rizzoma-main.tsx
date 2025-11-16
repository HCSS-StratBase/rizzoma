import { createRoot } from 'react-dom/client';
import { RizzomaApp } from './RizzomaApp';

const container = document.getElementById('rizzoma-root');
if (container) {
  createRoot(container).render(<RizzomaApp />);
}