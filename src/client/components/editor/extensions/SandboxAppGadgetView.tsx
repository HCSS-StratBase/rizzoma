import { useEffect, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { Badge, Box, Button, Group, Text } from '@mantine/core';
import { LayoutDashboard } from 'lucide-react';
import { describeSandboxedApp } from '../../../gadgets/apps/runtime';
import { getAppManifest } from '../../../gadgets/apps/catalog';
import { normalizeAppFrameAttrs } from '../../../gadgets/security';

/**
 * How long a gadget frame gets to complete its first host handshake. The
 * original Rizzoma showed a loading state and then an error message with a
 * retry button (`.gadget-loading` / `.gadget-error` in static/css/gadget.css)
 * instead of an empty box; a frame that is blocked (CSP, CORS, CORP, 404) never
 * runs its script and so never messages the host.
 */
export const GADGET_START_TIMEOUT_MS = 8_000;

function parseAppData(data: unknown) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  if (typeof data === 'string') {
    try {
      return parseAppData(JSON.parse(data));
    } catch {
      return {};
    }
  }
  return {};
}

function summarizeAppData(raw: unknown) {
  const data = parseAppData(raw);
  if (data && typeof data === 'object' && Array.isArray((data as any).columns)) {
    const totalCards = (data as any).columns.reduce(
      (sum: number, column: any) => sum + (Array.isArray(column?.cards) ? column.cards.length : 0),
      0
    );
    return `${(data as any).columns.length} columns · ${totalCards} cards`;
  }

  if (data && typeof data === 'object' && Array.isArray((data as any).milestones)) {
    const milestones = (data as any).milestones as Array<{ title?: string }>;
    const tail = milestones[milestones.length - 1];
    return tail?.title ? `Latest: ${tail.title}` : `${milestones.length} milestones`;
  }

  if (data && typeof data === 'object' && (data as any).session) {
    const session = (data as any).session as { label?: string; duration?: number; state?: string };
    if (session?.label) {
      return `Focus: ${session.label}`;
    }
    return `${session?.duration ?? 0} min · ${session?.state ?? 'ready'}`;
  }

  return 'Sandbox preview';
}

export function SandboxAppGadgetView(props: any) {
  const { node, selected, editor, getPos } = props;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const manifest = useMemo(() => getAppManifest(node.attrs.appId), [node.attrs.appId]);
  const safeFrame = useMemo(() => normalizeAppFrameAttrs(node.attrs), [node.attrs]);
  const sandbox = manifest && safeFrame ? describeSandboxedApp(manifest) : null;
  const appData = useMemo(() => parseAppData(node.attrs.data), [node.attrs.data]);
  const summary = useMemo(() => summarizeAppData(node.attrs.data), [node.attrs.data]);

  const commitNodeAttrs = (patch: Record<string, unknown>) => {
    const position = typeof getPos === 'function' ? getPos() : null;
    if (typeof position !== 'number' || !editor?.view?.dispatch || !editor?.state?.tr) {
      return;
    }
    const transaction = editor.state.tr.setNodeMarkup(position, undefined, {
      ...node.attrs,
      ...patch,
    });
    editor.view.dispatch(transaction);
  };

  useEffect(() => {
    if (!safeFrame || !sandbox) return;
    const handleMessage = (event: MessageEvent) => {
      // App frames deliberately omit allow-same-origin. Their messages have
      // an opaque `null` origin, so authenticate the exact WindowProxy source
      // instead of granting the frame our application origin.
      if (event.origin !== 'null') return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data;
      if (!payload || typeof payload !== 'object' || payload.scope !== 'rizzoma-gadget') return;
      // Any authenticated message proves the frame's script is running.
      setPhase('ready');

      const reply = (response: Record<string, unknown>) => {
        iframeRef.current?.contentWindow?.postMessage(
          { scope: 'rizzoma-gadget', requestId: payload.requestId, ...response },
          '*'
        );
      };

      if (payload.type === 'host.getNodeData') {
        reply({ type: 'host.response', data: appData || null });
        return;
      }

      if (payload.type === 'host.getUserContext') {
        reply({ type: 'host.response', data: { userId: 'codex-live', canEdit: true } });
        return;
      }

      if (payload.type === 'host.resize') {
        const nextHeight = String(Math.min(1_200, Math.max(320, Number(payload.height || 0))));
        commitNodeAttrs({ height: nextHeight });
        reply({ type: 'host.response', data: { height: nextHeight } });
        return;
      }

      if (payload.type === 'host.updateNodeData') {
        const nextData = JSON.stringify(parseAppData(payload.data));
        commitNodeAttrs({ data: nextData });
        window.dispatchEvent(new CustomEvent('rizzoma:app-frame-data-updated', {
          detail: {
            instanceId: String(node.attrs.instanceId || ''),
            data: nextData,
          },
        }));
        reply({ type: 'host.response', data: payload.data });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [appData, editor, getPos, node.attrs, safeFrame, sandbox]);

  // Keyed on primitives only: `sandbox` is a fresh object every render and would
  // restart the watchdog (and reset a ready frame to "loading") on each update.
  const frameSrc = safeFrame && sandbox ? safeFrame.src : null;
  useEffect(() => {
    if (!frameSrc) return;
    setPhase('loading');
    const timer = window.setTimeout(() => {
      setPhase((current) => (current === 'ready' ? current : 'failed'));
    }, GADGET_START_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [attempt, frameSrc]);

  useEffect(() => {
    if (!safeFrame || !sandbox) return;
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.postMessage(
      { scope: 'rizzoma-gadget', type: 'host.pushNodeData', data: appData || null },
      '*'
    );
  }, [appData, safeFrame, sandbox]);

  if (!safeFrame || !sandbox) {
    return (
      <NodeViewWrapper className="gadget-node-view blocked" style={{ display: 'block', width: '100%' }}>
        <Text c="red" size="sm">Blocked untrusted app frame</Text>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className={`gadget-node-view ${selected ? 'selected' : ''}`}
      style={{ display: 'block', width: '100%' }}
    >
      <div
        className="app-frame-live-state"
        data-app-instance-id={node.attrs.instanceId}
        data-app-live-data={JSON.stringify(appData)}
      >
        <Box
          my="md"
          p="sm"
          style={{
            maxWidth: '780px',
            marginInline: 'auto',
            borderRadius: '20px',
            border: selected ? '1px solid rgba(15,118,110,0.45)' : '1px solid rgba(136,156,178,0.18)',
            background:
              'radial-gradient(circle at top right, rgba(16,185,129,0.12), transparent 32%), linear-gradient(180deg, rgba(249,252,253,0.98), rgba(239,246,250,0.96))',
            boxShadow: selected ? '0 18px 40px rgba(15,118,110,0.16)' : '0 16px 30px rgba(15,23,42,0.08)',
          }}
        >
          <Group justify="space-between" px="sm" py={6}>
            <Group gap="sm">
              <Box
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(15,118,110,0.14)',
                  color: '#0f766e',
                }}
              >
                <LayoutDashboard size={18} />
              </Box>
              <div>
                <Badge variant="light" color="teal">Sandboxed app</Badge>
                <Text size="sm" fw={700} c="#173047" mt={4}>{node.attrs.title}</Text>
              </div>
            </Group>
            <Text size="xs" c="#5f7386">
              {sandbox ? sandbox.manifest.version : 'preview'}
            </Text>
          </Group>

          <Text size="xs" c="#5f7386" px="sm" pb={4} data-app-summary={summary}>
            {summary}
          </Text>

          {phase === 'failed' ? (
            <Box px="sm" pb="sm" data-testid="gadget-app-error" role="alert">
              <Group justify="space-between" p="md" style={{ borderRadius: 16, background: 'rgba(254,226,226,0.7)' }}>
                <Text size="sm" c="#7f1d1d">This gadget did not start. Its page could not be loaded or run.</Text>
                <Button size="xs" variant="light" color="red" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
              </Group>
            </Box>
          ) : null}

          <Box px="sm" pb="sm" style={phase === 'failed' ? { display: 'none' } : undefined}>
            <iframe
              key={attempt}
              ref={iframeRef}
              src={safeFrame.src}
              title={safeFrame.title}
              sandbox={sandbox?.sandbox}
              allow={sandbox?.allow}
              style={{
                width: '100%',
                minHeight: `${safeFrame.height}px`,
                border: 0,
                borderRadius: '16px',
                background: 'white',
                boxShadow: 'inset 0 0 0 1px rgba(136,156,178,0.18)',
              }}
            />
          </Box>
        </Box>
      </div>
    </NodeViewWrapper>
  );
}
