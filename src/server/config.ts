export type AppConfig = {
  host: string;
  port: number;
  couchDbUrl: string; // may include basic auth
  couchDbName: string;
};

function num(v: string | undefined, fallback: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config: AppConfig = {
  // Production is reverse-proxied by nginx and must not expose the Node
  // listener directly. Development keeps the LAN-friendly bind used by the
  // mobile/device smoke tests. HOST remains an explicit escape hatch.
  host: process.env['HOST'] || (process.env['NODE_ENV'] === 'production' ? '127.0.0.1' : '0.0.0.0'),
  // Reserved Rizzoma backend port. 8788 was chosen to avoid the common 8000
  // collision with google_workspace_mcp and other dev services. Override with
  // PORT env var only when running multiple Rizzoma backends side by side.
  port: num(process.env['PORT'], 8788),
  couchDbUrl: process.env['COUCHDB_URL'] || 'http://admin:password@localhost:5984',
  couchDbName: process.env['COUCHDB_DB'] || 'project_rizzoma',
};
