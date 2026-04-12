#!/usr/bin/env python3
import json
import sys

from tana_rpc import TanaClient


PARENT_NODE_ID = "M8BXbiqHpzXM"  # 2026-03-29 daily note
TASK_CREATED_BY_FIELD = "MCkSxKHFv7st"
TASK_GENERATED_BY_FIELD = "dG5OQzKA6eYV"
SDS_PERSON_ID = "X6yCff_d87Wn"
CODEX_OPTION_ID = "S1L6t4Bq8A_Z"
TASK_TAG_ID = "X_vT1GSytHJy"
PROJECT_TAG_ID = "fi4O0gkWPRwm"
STATUS_FIELD_ID = "VCo-GXRip7zs"
DONE_OPTION_ID = "flvTePcrabaj"


def main():
    client = TanaClient()
    client.initialize()

    children = client.call_tool("get_children", {"nodeId": PARENT_NODE_ID, "limit": 200})
    if isinstance(children, dict) and isinstance(children.get("content"), list):
        text = "\n".join(item.get("text", "") for item in children["content"] if isinstance(item, dict)).strip()
        if text:
            children = json.loads(text)
    target_ids = []
    for child in children.get("children", []):
        name = child.get("name", "")
        if any(
            key in name
            for key in (
                "Inspect dirty Rizzoma UI/editor batch",
                "Restore Codex access to local Tana MCP",
                "Restore live Rizzoma stack, capture topic screenshots, and sync docs",
            )
        ):
            target_ids.append({"id": child["id"], "name": name})

    updated = []
    for target in target_ids:
        if target["name"] == "Restore live Rizzoma stack, capture topic screenshots, and sync docs":
            client.call_tool(
                "tag",
                {"nodeId": target["id"], "action": "add", "tagIds": [TASK_TAG_ID, PROJECT_TAG_ID]},
            )
            client.call_tool(
                "set_field_option",
                {"nodeId": target["id"], "attributeId": STATUS_FIELD_ID, "optionId": DONE_OPTION_ID},
            )
        client.call_tool(
            "set_field_content",
            {
                "nodeId": target["id"],
                "attributeId": TASK_CREATED_BY_FIELD,
                "content": SDS_PERSON_ID,
            },
        )
        client.call_tool(
            "set_field_option",
            {
                "nodeId": target["id"],
                "attributeId": TASK_GENERATED_BY_FIELD,
                "optionId": CODEX_OPTION_ID,
            },
        )
        updated.append(target)

    print(json.dumps({"updated": updated}, indent=2))


if __name__ == "__main__":
    main()
