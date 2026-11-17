import { createPreviewApp } from '../app-shell.js';

function renderBoard(container, data) {
  const board = document.createElement('div');
  board.className = 'board';
  const columns = Array.isArray(data.columns) ? data.columns : [];
  columns.forEach((column) => {
    const columnEl = document.createElement('section');
    columnEl.className = 'column';
    const title = document.createElement('div');
    title.className = 'column-title';
    title.textContent = column.title;
    columnEl.appendChild(title);

    (Array.isArray(column.cards) ? column.cards : []).forEach((card) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'card';
      cardEl.textContent = card;
      columnEl.appendChild(cardEl);
    });
    board.appendChild(columnEl);
  });
  container.appendChild(board);
}

createPreviewApp({
  title: 'Kanban Board',
  accent: '#0f766e',
  description: 'This preview is mounted through the reusable app-frame shell and reads its initial state from the topic host.',
  toolbarNote: 'One small interaction proves the host bridge can update node data.',
  actionLabel: 'Add sample card',
  initialHeight: 520,
  initialData: { columns: [] },
  render: renderBoard,
  onAction(data) {
    const columns = Array.isArray(data.columns) ? data.columns : [];
    return {
      columns: columns.map((column, idx) => idx === 0
        ? { ...column, cards: [...column.cards, `Sample card ${column.cards.length + 1}`] }
        : column),
    };
  },
});
