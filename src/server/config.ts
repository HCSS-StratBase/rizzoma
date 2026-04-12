export type AppConfig = {
  port: number;
  couchDbUrl: string; // may include basic auth
  couchDbName: string;
};

function num(v: string | undefined, fallback: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config: AppConfig = {
  // Reserved Rizzoma backend port. 8788 was chosen to avoid the common 8000
  // collision with google_workspace_mcp and other dev services. Override with
  // PORT env var only when running multiple Rizzoma backends side by side.
  port: num(process.env['PORT'], 8788),
  couchDbUrl: process.env['COUCHDB_URL'] || 'http://admin:password@localhost:5984',
  couchDbName: process.env['COUCHDB_DB'] || 'project_rizzoma',
};

