# 65-collab-reconnect-catchup

On reconnect, client sends state vector via `blip:sync:request`; server returns diff with missed updates.

Automated regression coverage: `test-collab-smoke.mjs`.
