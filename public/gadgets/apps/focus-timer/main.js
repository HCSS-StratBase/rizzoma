import { createPreviewApp } from '../app-shell.js';

function renderFocus(container, data) {
  const session = data.session || {};
  const checklist = Array.isArray(data.checklist) ? data.checklist : [];

  const sessionCard = document.createElement('section');
  sessionCard.className = 'session-card';
  sessionCard.innerHTML = `
    <div class="session-label">Focus session</div>
    <div class="session-title">${session.label || 'Untitled session'}</div>
    <div class="session-meta">${session.duration || 0} minutes · ${session.state || 'ready'}</div>
  `;

  const checklistEl = document.createElement('section');
  checklistEl.className = 'checklist';
  checklist.forEach((item) => {
    const row = document.createElement('div');
    row.className = `check-item ${item.done ? 'check-done' : 'check-pending'}`;
    row.innerHTML = `
      <div class="check-mark">${item.done ? '✓' : '•'}</div>
      <div>${item.label}</div>
    `;
    checklistEl.appendChild(row);
  });

  container.append(sessionCard, checklistEl);
}

createPreviewApp({
  title: 'Focus Timer',
  accent: '#7c3aed',
  description: 'This third preview app proves the shared app shell can host different layouts and state models without duplicating bootstrap code.',
  toolbarNote: 'Advance one small focus step and persist it through the shared runtime contract.',
  actionLabel: 'Start next focus block',
  initialHeight: 420,
  initialData: { session: {}, checklist: [] },
  render: renderFocus,
  onAction(data) {
    const session = data.session || {};
    const checklist = Array.isArray(data.checklist) ? data.checklist : [];
    const nextChecklist = checklist.map((item, idx) => idx === 1 ? { ...item, done: true } : item);
    return {
      session: {
        ...session,
        label: `${session.label || 'Session'} · deep work`,
        duration: Number(session.duration || 25) + 10,
        state: 'running',
      },
      checklist: nextChecklist,
    };
  },
});
