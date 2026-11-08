# Compiled service lifecycle evidence

Local production-mode lifecycle probe for branch
`codex/production-service-hardening` on 2026-07-12.

- Compiled Express served the built client on `127.0.0.1:8799` with HTTP 200.
- The process received `SIGTERM`.
- Socket/HTTP/Yjs/session shutdown completed and the process exited 0.
- `graceful-shutdown.log` is the captured process log.

This probe used an explicit local-only MemoryStore and a non-secret test signing
value. It proves the signal path only; Redis/CouchDB readiness and persistence
remain part of the VPS canary gate.
