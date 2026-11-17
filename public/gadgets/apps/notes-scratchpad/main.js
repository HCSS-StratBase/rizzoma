import { createPreviewApp } from '../app-shell.js';

function renderScratchpad(container, data) {
  const layout = document.createElement('div');
  layout.className = 'scratchpad';

  const notesPanel = document.createElement('section');
  notesPanel.className = 'notes-panel';
  const notesTitle = document.createElement('div');
  notesTitle.className = 'panel-title';
  notesTitle.textContent = 'Notes';
  notesPanel.appendChild(notesTitle);
  const notes = Array.isArray(data.notes) ? data.notes : [];
  notes.forEach((note) => {
    const noteEl = document.createElement('div');
    noteEl.className = 'note';
    noteEl.textContent = note;
    notesPanel.appendChild(noteEl);
  });

  const checklistPanel = document.createElement('section');
  checklistPanel.className = 'checklist-panel';
  const checklistTitle = document.createElement('div');
  checklistTitle.className = 'panel-title';
  checklistTitle.textContent = 'Checklist';
  checklistPanel.appendChild(checklistTitle);
  const checklist = Array.isArray(data.checklist) ? data.checklist : [];
  checklist.forEach((item) => {
    const itemEl = document.createElement('div');
    itemEl.className = `checklist-item${item.done ? ' done' : ''}`;
    const box = document.createElement('span');
    box.className = 'check-box';
    box.textContent = item.done ? '✓' : '';
    itemEl.appendChild(box);
    const label = document.createElement('span');
    label.textContent = item.label;
    itemEl.appendChild(label);
    checklistPanel.appendChild(itemEl);
  });

  layout.appendChild(notesPanel);
  layout.appendChild(checklistPanel);
  container.appendChild(layout);
}

createPreviewApp({
  title: 'Notes Scratchpad',
  accent: '#dc2626',
  description: 'This preview exercises the same host-bridge contract as Kanban/Planner/Focus, with a free-form text + checkbox data shape to prove the shell generalizes beyond structured records.',
  toolbarNote: 'One action adds a note AND flips the first unfinished checklist item so both halves of the data shape write back to the host.',
  actionLabel: 'Capture an insight',
  initialHeight: 520,
  initialData: { notes: [], checklist: [] },
  render: renderScratchpad,
  onAction(data) {
    const notes = Array.isArray(data.notes) ? data.notes : [];
    const checklist = Array.isArray(data.checklist) ? data.checklist : [];
    const insightNumber = notes.length + 1;
    const newNotes = [
      ...notes,
      `Insight ${insightNumber}: captured from the scratchpad action button — proves the host bridge persists free-form text writes.`,
    ];
    // Flip the first unfinished checklist item to done, if any.
    let flipped = false;
    const newChecklist = checklist.map((item) => {
      if (flipped || item.done) return item;
      flipped = true;
      return { ...item, done: true };
    });
    return { notes: newNotes, checklist: newChecklist };
  },
});
