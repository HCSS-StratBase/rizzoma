import { createPreviewApp } from '../app-shell.js';

function renderTimeline(container, data) {
  const timeline = document.createElement('div');
  timeline.className = 'timeline';
  const milestones = Array.isArray(data.milestones) ? data.milestones : [];
  milestones.forEach((milestone) => {
    const row = document.createElement('section');
    row.className = 'milestone';
    row.innerHTML = `
      <div class="when">${milestone.when}</div>
      <div>
        <div class="title">${milestone.title}</div>
        <div class="meta">Shared app shell milestone · ${milestone.id}</div>
      </div>
    `;
    timeline.appendChild(row);
  });
  container.appendChild(timeline);
}

createPreviewApp({
  title: 'Calendar Planner',
  accent: '#2563eb',
  description: 'This preview now uses the shared app-shell bootstrap instead of a hand-rolled bridge setup.',
  toolbarNote: 'One small interaction updates the planner through the shared host bridge.',
  actionLabel: 'Delay final milestone',
  initialHeight: 500,
  initialData: { milestones: [] },
  render: renderTimeline,
  onAction(data) {
    const milestones = Array.isArray(data.milestones) ? data.milestones : [];
    return {
      milestones: milestones.map((milestone, idx) => (
        idx === milestones.length - 1
          ? { ...milestone, when: '16:30', title: `${milestone.title} (delayed)` }
          : milestone
      )),
    };
  },
});
