#!/usr/bin/env python3
import json
import sys

sys.path.append("scripts")

from tana_rpc import TanaClient


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python3 scripts/inspect_tana_nodes.py <node_id> [<node_id> ...]")

    client = TanaClient()
    client.initialize()

    for node_id in sys.argv[1:]:
        print(f"=== {node_id} ===")
        read_res = client.call_tool("read_node", {"nodeId": node_id, "maxDepth": 1})
        print(json.dumps(read_res, indent=2)[:12000])


if __name__ == "__main__":
    main()
