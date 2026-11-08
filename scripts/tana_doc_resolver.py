#!/usr/bin/env python3
import json
from pathlib import Path


CANONICAL = {
    "workflow": Path("/mnt/g/My Drive/Tana/tana-claude-workflow.md"),
    "mcp_setup": Path("/mnt/g/My Drive/Tana/tana-mcp-setup.md"),
    "memory": Path("/mnt/c/Apps/Tana/docs/MEMORY.md"),
    "overview": Path("/mnt/g/My Drive/Tana/readme.md"),
}

ALIASES = {
    "tana-claude-workflow.md": "workflow",
    "tana-mcp-setup.md": "mcp_setup",
    "MEMORY.md": "memory",
    "readme.md": "overview",
    "README.md": "overview",
}


def describe(path: Path):
    stat = path.stat()
    return {
        "path": str(path),
        "exists": path.exists(),
        "mtime": int(stat.st_mtime),
        "size": stat.st_size,
    }


def main():
    result = {}
    for key, path in CANONICAL.items():
        result[key] = describe(path)

    result["aliases"] = ALIASES
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
