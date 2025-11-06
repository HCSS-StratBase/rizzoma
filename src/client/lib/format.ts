import { format } from 'date-fns';

export function formatTimestamp(ts: number | string | Date): string {
  const d = typeof ts === 'number' || typeof ts === 'string' ? new Date(Number(ts)) : ts;
  if (!d || Number.isNaN(d.getTime())) return '';
  return format(d, 'yyyy-MM-dd HH:mm');
}

