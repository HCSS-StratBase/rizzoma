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
  port: num(process.env['PORT'], 8000),
  couchDbUrl: process.env['COUCHDB_URL'] || 'http://admin:password@localhost:5984',
  couchDbName: process.env['COUCHDB_DB'] || 'project_rizzoma',
};

