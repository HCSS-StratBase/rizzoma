from pathlib import Path


WORKFLOW = Path("/mnt/g/My Drive/Tana/tana-claude-workflow.md")
MEMORY_DOC = Path("/mnt/c/Apps/Tana/docs/MEMORY.md")
MEMORY_ROOT = Path("/mnt/c/Apps/Tana/MEMORY.md")


WORKFLOW_INSERT_AFTER = "- Rizzoma-Tana Transition: fi4O0gkWPRwm (project for the migration effort)\n"
WORKFLOW_INSERT = (
    "- Rizzoma modernization: Y07pn4i697qh (work on modernizing the Rizzoma codebase, parity, gadgets, and live verification)\n"
    "- Rizzoma runtime: B98_MsxBy1Z7 (sandbox app runtime, host bridge, app-frame persistence, and installable gadget platform work)\n"
)

MEMORY_INSERT_AFTER = "- Status opts: To-Do(OctarrhyeoLS), Doing(aloZ9jKRpOXI), Done(flvTePcrabaj)\n"
MEMORY_INSERT = (
    "- Rizzoma-specific supertags now in active use for this modernization stream:\n"
    "  - #Rizzoma modernization (Y07pn4i697qh) for the broader codebase/platform/parity modernization track\n"
    "  - #Rizzoma runtime (B98_MsxBy1Z7) for sandbox app runtime, host bridge, persistence, and app-frame work\n"
)


def ensure_insert(path: Path, anchor: str, addition: str) -> None:
    text = path.read_text()
    if addition.strip() in text:
        return
    if anchor not in text:
        raise RuntimeError(f"Anchor not found in {path}: {anchor!r}")
    path.write_text(text.replace(anchor, anchor + addition))


def main() -> None:
    ensure_insert(WORKFLOW, WORKFLOW_INSERT_AFTER, WORKFLOW_INSERT)
    ensure_insert(MEMORY_DOC, MEMORY_INSERT_AFTER, MEMORY_INSERT)
    ensure_insert(MEMORY_ROOT, MEMORY_INSERT_AFTER, MEMORY_INSERT)


if __name__ == "__main__":
    main()
