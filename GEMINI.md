# GEMINI.md – Rizzoma

Gemini CLI loads this file automatically. Same rules as `AGENTS.md`; read that too.

## Read the wiki FIRST, before any code, docs or UI work
1. Open **[`wiki/index.md`](wiki/index.md)** (schema: `wiki/SCHEMA.md`). It is the compounding LLM wiki: BFO subsystem diagrams, invariants, decisions, verification gates. Answer from the wiki before searching `docs/` or `src/`; `docs/deprecated/` is NOT authoritative.
2. **UI work: look at the ORIGINAL first.** `screenshots/260714-legacy-reference-archive/` holds 126 screenshots of the original rizzoma.com, each with a `.md` description beside it. Index and rules: **[`wiki/reference/legacy-screenshots.md`](wiki/reference/legacy-screenshots.md)**.
3. Other catalogs (source map, scripts, docs, assets, screenshot folders): `wiki/index.md` section 6, in `wiki/reference/`.
4. Current state: `STATUS.md` (generated, never edit).

## After you change anything
- Update the matching wiki page and append to `wiki/log.md`.
- Regenerate catalogs and check coverage: `python3 scripts/wiki_generate_catalogs.py` then `python3 scripts/wiki_coverage.py`.
- Lint: `python3 scripts/wiki_lint.py` (run it in WSL for the authoritative result).

## Never
- Hard-code credentials in scripts; read them from environment variables.
