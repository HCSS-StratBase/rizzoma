#!/usr/bin/env python3
import pathlib
import sys


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python3 scripts/append_workflow_note.py <target-md> <snippet-md>")

    target = pathlib.Path(sys.argv[1])
    snippet = pathlib.Path(sys.argv[2]).read_text()
    original = target.read_text() if target.exists() else ""

    if snippet.strip() in original:
        print("already-present")
        return

    updated = original.rstrip() + "\n\n" + snippet.strip() + "\n"
    target.write_text(updated)
    print("appended")


if __name__ == "__main__":
    main()
