import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>Settings</h1>
      <p>Placeholder settings page.</p>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
