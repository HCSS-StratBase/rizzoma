#!/usr/bin/env python3
import pathlib


REPLACEMENTS = {
    "/mnt/g/My Drive/Tana/tana-claude-workflow.md": [
        (
            "- ALWAYS add author suffix to node names: `[SDS]`, `[HP]`, `[LH]` etc. at the END of the name\n  - Default: [SDS] for posts on behalf of Stephan\n  - Initials: SDS=Stephan De Spiegeleire, HP=Hryhorii Pavlenko, LH=Liliia Hudziuk\n- ALWAYS set the human provenance field after posting: use `set_field_content` with the person node ID\n",
            "- ALWAYS add author suffix to node names: `[SDS]`, `[HP]`, `[LH]` etc. at the END of the name\n  - Default: [SDS] for posts on behalf of Stephan\n  - Initials: SDS=Stephan De Spiegeleire, HP=Hryhorii Pavlenko, LH=Liliia Hudziuk\n  - If a node title contains `[SDS]`, `[HP]`, `[LH]`, or another human suffix, the same node MUST also have the matching human set in `Created by` or `Author` before the post is considered complete.\n- ALWAYS set the human provenance field after posting: use `set_field_content` with the person node ID\n",
        ),
        (
            "- `Created by` is for the human author/person only, never the LLM/model.\n",
            "- `Created by` is for the human author/person only, never the LLM/model.\n- For assistant-created daily-note entries, default the human provenance to the user who owns or assigned the task, not the assistant.\n",
        ),
    ],
    "/mnt/c/Apps/Tana/docs/MEMORY.md": [
        (
            "- Always add author suffix to node names: [SDS], [HP], [LH] at the END\n",
            "- Always add author suffix to node names: [SDS], [HP], [LH] at the END\n- If a title includes [SDS], [HP], [LH], or another human suffix, the same node must also have that matching person in Created by or Author.\n",
        ),
    ],
    "/mnt/c/Apps/Tana/MEMORY.md": [
        (
            "- Always add author suffix to node names: [SDS], [HP], [LH] at the END\n",
            "- Always add author suffix to node names: [SDS], [HP], [LH] at the END\n- If a title includes [SDS], [HP], [LH], or another human suffix, the same node must also have that matching person in Created by or Author.\n",
        ),
    ],
}


def main():
    for path_str, replacements in REPLACEMENTS.items():
        path = pathlib.Path(path_str)
        text = path.read_text()
        original = text
        for old, new in replacements:
            if old in text:
                text = text.replace(old, new)
            elif new in text:
                continue
            else:
                raise RuntimeError(f"Expected snippet not found in {path}")
        if text != original:
            path.write_text(text)
            print(f"updated {path}")
        else:
            print(f"unchanged {path}")


if __name__ == "__main__":
    main()
