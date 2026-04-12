import { createHostBridge } from './runtime-host.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof text === 'string') node.textContent = text;
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function createPreviewApp(config) {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Missing #app root');
  }

  const state = {
    data: config.initialData || {},
    userContext: null,
    resizeState: null,
  };

  const shell = el('div', 'app-shell');
  const header = el('div', 'app-header');
  const headerCopy = el('div');
  const badge = el('span', 'app-badge', config.badgeLabel || 'Sandbox preview');
  if (config.accent) {
    badge.style.background = `${config.accent}1f`;
    badge.style.color = config.accent;
  }
  const title = el('h1', 'app-title', config.title);
  const copy = el('p', 'app-copy', config.description);
  headerCopy.append(badge, title, copy);

  const meta = el('div', 'app-meta', 'Waiting for host…');
  header.append(headerCopy, meta);

  const body = el('div', 'app-body');
  const toolbar = el('div', 'toolbar');
  const note = el('div', 'toolbar-note', config.toolbarNote);
  const actionButton = el('button', '', config.actionLabel);
  actionButton.type = 'button';
  if (config.accent) {
    actionButton.style.background = `linear-gradient(135deg, ${config.accent}, #0f5b99)`;
  }
  toolbar.append(note, actionButton);

  shell.append(header, body, toolbar);
  root.append(shell);

  function render() {
    clear(body);
    config.render(body, state.data);
  }

  const host = createHostBridge({
    onNodeData(data) {
      state.data = data && typeof data === 'object' ? data : config.initialData || {};
      render();
    },
    onUserContext(data) {
      state.userContext = data;
      meta.textContent = `Host user: ${data.userId} · editable: ${data.canEdit}`;
    },
    onResize(data) {
      state.resizeState = data;
    },
  });

  actionButton.addEventListener('click', () => {
    state.data = config.onAction(state.data);
    host.updateNodeData(state.data);
    render();
  });

  host.getNodeData();
  host.getUserContext();
  host.resize(config.initialHeight || 420);
  render();

  return { host, state };
}
