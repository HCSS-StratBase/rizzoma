export function createHostBridge({ onNodeData, onUserContext, onResize, scope = 'rizzoma-gadget' }) {
  let requestId = 0;
  window.__RIZZOMA_APP_STATE = window.__RIZZOMA_APP_STATE || null;

  function parseJson(value) {
    if (!value || typeof value !== 'string') return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function readBootstrapState() {
    const frame = window.frameElement;
    if (!frame || String(frame.tagName || '').toLowerCase() !== 'iframe') {
      return null;
    }

    const liveContainer = frame.closest('.app-frame-live-state');
    const liveData = liveContainer?.getAttribute('data-app-live-data');
    if (liveData) {
      const parsed = parseJson(liveData);
      return {
        data: parsed,
        userContext: { userId: 'codex-live', canEdit: true },
      };
    }

    const appFigure = frame.closest('figure[data-gadget-type="app-frame"]');
    const figureData = appFigure?.getAttribute('data-app-data');
    if (figureData) {
      const parsed = parseJson(figureData);
      return {
        data: parsed,
        userContext: { userId: 'viewer', canEdit: false },
      };
    }

    return null;
  }

  function send(type, payload = {}) {
    requestId += 1;
    parent.postMessage({ scope, requestId: String(requestId), type, ...payload }, window.location.origin);
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const payload = event.data;
    if (!payload || payload.scope !== scope) return;

    if (payload.type === 'host.pushNodeData' && typeof onNodeData === 'function') {
      window.__RIZZOMA_APP_STATE = payload.data ?? null;
      onNodeData(payload.data);
      return;
    }

    if (payload.type !== 'host.response') return;

    if (payload.data && typeof payload.data === 'object' && 'canEdit' in payload.data && typeof onUserContext === 'function') {
      onUserContext(payload.data);
      return;
    }

    if (payload.data && typeof payload.data === 'object' && 'height' in payload.data && typeof onResize === 'function') {
      onResize(payload.data);
      return;
    }

    if (typeof onNodeData === 'function') {
      window.__RIZZOMA_APP_STATE = payload.data ?? null;
      onNodeData(payload.data);
    }
  });

  const bootstrap = readBootstrapState();
  if (bootstrap?.data && typeof onNodeData === 'function') {
    window.__RIZZOMA_APP_STATE = bootstrap.data;
    onNodeData(bootstrap.data);
  }
  if (bootstrap?.userContext && typeof onUserContext === 'function') {
    onUserContext(bootstrap.userContext);
  }

  return {
    getNodeData() {
      send('host.getNodeData');
    },
    getUserContext() {
      send('host.getUserContext');
    },
    resize(height) {
      send('host.resize', { height });
    },
    updateNodeData(data) {
      window.__RIZZOMA_APP_STATE = data ?? null;
      send('host.updateNodeData', { data });
    },
  };
}
