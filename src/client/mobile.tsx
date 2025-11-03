import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>Rizzoma Mobile</h1>
      <p>Basic mobile entry point.</p>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
