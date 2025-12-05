import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { toast } from './Toast';
import { formatTimestamp } from '../lib/format';

type JobStatus = 'idle' | 'queued' | 'running' | 'complete' | 'error';

type JobLogEntry = { at: number; message: string; level: 'info' | 'error' };

type JobInfo = {
  status: JobStatus;
  jobId?: string;
  applied?: number | null;
  error?: string | null;
  logs: JobLogEntry[];
  queuedAt?: number | null;
  startedAt?: number | null;
  completedAt?: number | null;
};

const normalizeJob = (raw: any): JobInfo => ({
  status: (raw?.status as JobStatus) || 'idle',
  jobId: raw?.jobId ? String(raw.jobId) : undefined,
  applied: typeof raw?.applied === 'number' ? raw.applied : null,
  error: typeof raw?.error === 'string' ? raw.error : null,
  logs: Array.isArray(raw?.logs)
    ? raw.logs.map((entry: any) => ({
        at: Number(entry?.at || Date.now()),
        message: String(entry?.message || ''),
        level: entry?.level === 'error' ? 'error' : 'info',
      }))
    : [],
  queuedAt: typeof raw?.queuedAt === 'number' ? raw.queuedAt : null,
  startedAt: typeof raw?.startedAt === 'number' ? raw.startedAt : null,
  completedAt: typeof raw?.completedAt === 'number' ? raw.completedAt : null,
});

const statusLabel: Record<JobStatus, string> = {
  idle: 'Idle',
  queued: 'Queued',
  running: 'Running',
  complete: 'Complete',
  error: 'Error',
};

export function RebuildPanel({ waveId, blipId }: { waveId: string; blipId?: string | null }) {
  const [job, setJob] = useState<JobInfo>(() => ({ status: 'idle', logs: [] }));
  const [loading, setLoading] = useState<boolean>(false);

  const path = useMemo(() => {
    const base = `/api/editor/${encodeURIComponent(waveId)}/rebuild`;
    return blipId ? `${base}?blipId=${encodeURIComponent(blipId)}` : base;
  }, [waveId, blipId]);

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await api(path);
      if (!resp.ok) {
        toast(`Failed to load rebuild status (${resp.status})`, 'error');
        return;
      }
      setJob(normalizeJob(resp.data));
    } catch (err: any) {
      toast(`Failed to load rebuild status (${err?.message || 'error'})`, 'error');
    }
  }, [path]);

  const startRebuild = useCallback(async () => {
    setLoading(true);
    try {
      const body = blipId ? { blipId } : {};
      const resp = await api(path, { method: 'POST', body: JSON.stringify(body) });
      if (!resp.ok) {
        toast(`Failed to queue rebuild (${resp.status})`, 'error');
        return;
      }
      setJob(normalizeJob(resp.data));
    } catch (err: any) {
      toast(`Failed to queue rebuild (${err?.message || 'error'})`, 'error');
    } finally {
      setLoading(false);
    }
  }, [path, blipId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (job.status !== 'queued' && job.status !== 'running') return undefined;
    const handle = setInterval(() => { fetchStatus(); }, 2000);
    return () => clearInterval(handle);
  }, [job.status, fetchStatus]);

  const currentLabel = statusLabel[job.status] || job.status;
  const applied = typeof job.applied === 'number' ? job.applied : null;
  const isBusy = job.status === 'queued' || job.status === 'running';
  const showLogs = job.logs.length > 0;

  return (
    <div style={{ marginBottom: 12, padding: 8, border: '1px solid #ddd', borderRadius: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong>Snapshot recovery</strong>
        <button onClick={startRebuild} disabled={isBusy || loading} title="Rebuild snapshot from stored updates">
          {isBusy ? 'Rebuild in progress…' : 'Run rebuild'}
        </button>
        {job.status === 'error' ? (
          <button onClick={startRebuild} disabled={loading} style={{ background: '#e74c3c', color: '#fff' }}>
            Retry rebuild
          </button>
        ) : null}
      </div>
      <div style={{ fontSize: 13, color: '#2c3e50', marginTop: 4 }}>
        Status: <strong>{currentLabel}</strong>
        {applied !== null ? <span> — Applied updates: {applied}</span> : null}
      </div>
      {job.error ? <div style={{ color: '#c0392b', marginTop: 4 }}>Error: {job.error}</div> : null}
      {showLogs ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Activity log</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, maxHeight: 160, overflowY: 'auto' }}>
            {job.logs.map((entry, idx) => (
              <li key={`${entry.at}:${idx}`} style={{ color: entry.level === 'error' ? '#c0392b' : '#2c3e50', fontSize: 12 }}>
                <span style={{ fontFamily: 'monospace' }}>{formatTimestamp(entry.at)}</span> — {entry.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
