# ClamAV production dependency preflight

Date: 2026-07-12 14:49 CEST

The production VPS now has a restart-persistent `rizzoma-clamav` container with its signature database on the `rizzoma-clamav-db` Docker volume. TCP `3310` is published only on `127.0.0.1`; it is not an external service.

Measured preflight:

- Docker health: `healthy`
- Listener: `127.0.0.1:3310`
- Clean INSTREAM probe: explicit `stream: OK`
- EICAR INSTREAM probe: explicit `stream: Eicar-Test-Signature FOUND`

This proves the dependency and its real scan protocol before application cutover. It does not claim that the not-yet-deployed candidate is already using ClamAV; the final managed-service environment still has to set `CLAMAV_HOST=127.0.0.1`, `CLAMAV_PORT=3310`, and `UPLOADS_STORAGE=local`, followed by end-to-end upload acceptance.
