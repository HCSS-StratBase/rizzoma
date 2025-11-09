# Production Hardening Checklist

Scope: tighten prod defaults without affecting dev; land in small green commits.

- CORS allowlist: strict env-driven list; deny by default; tests
- Secure cookies/sessions behind proxy; SameSite; HTTPS only; tests
- Helmet policy review; CSP baseline; opt-in for client
- Docker/compose prod profile verification; non-root user; healthcheck
- Error surfaces: consistent JSON errors; redaction of secrets
- Rate limiting/burst control
- Lock Node 20.19.0; deterministic npm install; lockfile regen; Actions cache
- Docs: PROD.md with env examples; rollbacks
