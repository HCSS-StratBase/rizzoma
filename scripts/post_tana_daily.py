#!/usr/bin/env python3
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request


MCP_URL = "http://127.0.0.1:8262/mcp"
TOKEN_URL = "http://127.0.0.1:8262/oauth/token"
CREDENTIALS_PATH = pathlib.Path("/home/stephan/.codex/.credentials.json")
PARENT_NODE_ID = "M8BXbiqHpzXM"  # default/fallback daily note
TASK_TAG_ID = "X_vT1GSytHJy"
PROJECT_TAG_ID = "fi4O0gkWPRwm"
STATUS_FIELD_ID = "VCo-GXRip7zs"
DONE_OPTION_ID = "flvTePcrabaj"
SDS_PERSON_ID = "X6yCff_d87Wn"

PERSON_PROVENANCE_FIELDS = {
    "X_vT1GSytHJy": "MCkSxKHFv7st",  # task -> Created by
    "Ux8stlKm4NM_": "RxLacB6oylwm",  # discussion -> Created by
    "66SFmrfgsLQv": "sxwe-F6paDNj",  # annotation-run -> Created by
    "LKCjFGa6mB7z": "WPVL2EKgjYjz",  # meeting -> Created by
    "Z4EY7OcJuj5a": "iVa6Q--Yx6q4",  # output -> Created by
    "CRnHZin1KPtE": "Knni2KFxspb6",  # reply -> Author
}

GENERATED_BY_FIELDS = {
    "X_vT1GSytHJy": "dG5OQzKA6eYV",  # task
    "Ux8stlKm4NM_": "BaewUwERUcWs",  # discussion
    "LKCjFGa6mB7z": "DL0Fe4k1v_bQ",  # meeting
    "Z4EY7OcJuj5a": "MUJwRwDzb2pW",  # output
}

GENERATED_BY_OPTIONS = {
    "X_vT1GSytHJy": {
        "claude": "AUjPowsHSBEC",
        "codex": "S1L6t4Bq8A_Z",
        "gemini": "hCcjwptnMN5v",
        "human": "v0TVDCg8FOeq",
        "mixed": "q4Xdq294wZlw",
    },
    "Ux8stlKm4NM_": {
        "claude": "I_e177ygtAEE",
        "codex": "Fn38sEgtZmde",
        "gemini": "GRi58kV6LLaZ",
        "human": "1gWeePPtLrJS",
        "mixed": "KtEGVvl8ox62",
    },
    "LKCjFGa6mB7z": {
        "claude": "vE1SjO_A6cUG",
        "codex": "ashbc8EMmP8i",
        "gemini": "0Ob6wrWQgIMC",
        "human": "7RTLGhAPoHi7",
        "mixed": "UejRJCmsiM1T",
    },
    "Z4EY7OcJuj5a": {
        "claude": "fZxJ8a75LGGm",
        "gemini": "KVEjkSFsCVW8",
        "human": "XMgbEumYjaN9",
        "mixed": "2qm1NzOJAbuy",
    },
}


def load_credentials():
    creds = json.loads(CREDENTIALS_PATH.read_text())
    entry = creds.get("tana-local|2e68dc1e4b65021a") or creds.get("tana|2e68dc1e4b65021a")
    if not entry:
        raise RuntimeError("No Tana credential entry found")
    return creds, entry


def refresh_access_token(creds, entry):
    body = urllib.parse.urlencode(
        {
            "grant_type": "refresh_token",
            "refresh_token": entry["refresh_token"],
            "client_id": entry["client_id"],
        }
    ).encode()
    req = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        token_data = json.loads(resp.read().decode())

    entry["access_token"] = token_data["access_token"]
    if token_data.get("refresh_token"):
        entry["refresh_token"] = token_data["refresh_token"]

    if "tana-local|2e68dc1e4b65021a" in creds:
        creds["tana-local|2e68dc1e4b65021a"] = entry
    if "tana|2e68dc1e4b65021a" in creds:
        creds["tana|2e68dc1e4b65021a"]["access_token"] = entry["access_token"]
        if token_data.get("refresh_token"):
            creds["tana|2e68dc1e4b65021a"]["refresh_token"] = entry["refresh_token"]

    CREDENTIALS_PATH.write_text(json.dumps(creds, indent=2))
    return entry["access_token"]


class TanaClient:
    def __init__(self, token):
        self.token = token
        self.req_id = 0

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }

    def rpc(self, method, params=None, retry_on_401=True):
        self.req_id += 1
        payload = {"jsonrpc": "2.0", "id": self.req_id, "method": method}
        if params is not None:
            payload["params"] = params
        req = urllib.request.Request(
            MCP_URL,
            data=json.dumps(payload).encode(),
            headers=self._headers(),
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as err:
            if err.code == 401 and retry_on_401:
                creds, entry = load_credentials()
                self.token = refresh_access_token(creds, entry)
                return self.rpc(method, params, retry_on_401=False)
            raise

        if "data:" in raw:
            raw = "\n".join(line[5:].strip() for line in raw.splitlines() if line.startswith("data:"))
        data = json.loads(raw)
        if "error" in data:
            raise RuntimeError(data["error"])
        return data["result"]

    def initialize(self):
        return self.rpc(
            "initialize",
            {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "Codex", "version": "1.0"},
            },
        )


def extract_node_id(result):
    if isinstance(result, dict) and isinstance(result.get("content"), list):
        texts = [item.get("text", "") for item in result["content"] if isinstance(item, dict)]
        joined = "\n".join(texts)
        html_comment_match = re.search(r"node-id:\s*([A-Za-z0-9_-]{8,})", joined)
        if html_comment_match:
            return html_comment_match.group(1)
        json_id_match = re.search(r'"id"\s*:\s*"([A-Za-z0-9_-]{8,})"', joined)
        if json_id_match:
            return json_id_match.group(1)
    if isinstance(result, dict):
        for key in ("nodeId", "createdNodeId", "id"):
            if result.get(key):
                return result[key]
    match = re.search(r"[A-Za-z0-9_-]{8,}", json.dumps(result))
    if not match:
        raise RuntimeError(f"Could not determine node id from response: {result}")
    return match.group(0)


def parse_text_result(result):
    if isinstance(result, str):
        stripped = result.strip()
        if stripped:
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                match = re.search(r"(\{.*\}|\[.*\])", stripped, re.S)
                if match:
                    try:
                        return json.loads(match.group(1))
                    except json.JSONDecodeError:
                        pass
        return result
    if isinstance(result, dict) and isinstance(result.get("content"), list):
        texts = [item.get("text", "") for item in result["content"] if isinstance(item, dict)]
        joined = "\n".join(texts).strip()
        if joined:
            try:
                return json.loads(joined)
            except json.JSONDecodeError:
                return joined
    return result


def apply_person_provenance(client, node_id, tag_ids, person_node_id):
    for tag_id in tag_ids:
        field_id = PERSON_PROVENANCE_FIELDS.get(tag_id)
        if field_id:
            client.rpc(
                "tools/call",
                {
                    "name": "set_field_content",
                    "arguments": {"nodeId": node_id, "attributeId": field_id, "content": person_node_id},
                },
            )
            return field_id
    return None


def resolve_generated_by_option_id(tag_ids, generated_by):
    if not generated_by:
        return None, None
    model_key = generated_by.strip().lower()
    for tag_id in tag_ids:
        field_id = GENERATED_BY_FIELDS.get(tag_id)
        option_id = GENERATED_BY_OPTIONS.get(tag_id, {}).get(model_key)
        if field_id and option_id:
            return field_id, option_id
    return None, None


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/post_tana_daily.py <payload.json>")

    payload_path = pathlib.Path(sys.argv[1])
    payload = json.loads(payload_path.read_text())
    parent_node_id = payload.get("parent_node_id", PARENT_NODE_ID)
    tag_ids = payload.get("tag_ids", [TASK_TAG_ID, PROJECT_TAG_ID])
    person_node_id = payload.get("person_node_id", SDS_PERSON_ID)
    status_option_id = payload.get("status_option_id", DONE_OPTION_ID)
    generated_by = payload.get("generated_by", "Codex")
    generated_by_option_id = payload.get("generated_by_option_id")

    creds, entry = load_credentials()
    client = TanaClient(entry["access_token"])
    client.initialize()

    before = parse_text_result(
        client.rpc("tools/call", {"name": "get_children", "arguments": {"nodeId": parent_node_id, "limit": 500}})
    )
    before_ids = set()
    if isinstance(before, dict):
        before_ids = {child["id"] for child in before.get("children", []) if isinstance(child, dict) and child.get("id")}

    result = client.rpc(
        "tools/call",
        {
            "name": "import_tana_paste",
            "arguments": {"parentNodeId": parent_node_id, "content": payload["content"]},
        },
    )
    after = parse_text_result(
        client.rpc("tools/call", {"name": "get_children", "arguments": {"nodeId": parent_node_id, "limit": 500}})
    )
    after_children = after.get("children", []) if isinstance(after, dict) else []
    new_children = [
        child for child in after_children
        if isinstance(child, dict) and child.get("id") and child["id"] not in before_ids
    ]
    node_id = new_children[-1]["id"] if new_children else extract_node_id(result)

    client.rpc(
        "tools/call",
        {
            "name": "tag",
            "arguments": {"nodeId": node_id, "action": "add", "tagIds": tag_ids},
        },
    )
    if TASK_TAG_ID in tag_ids and status_option_id:
        client.rpc(
            "tools/call",
            {
                "name": "set_field_option",
                "arguments": {"nodeId": node_id, "attributeId": STATUS_FIELD_ID, "optionId": status_option_id},
            },
        )

    person_field = apply_person_provenance(client, node_id, tag_ids, person_node_id)

    generated_by_field_id = None
    if not generated_by_option_id:
        generated_by_field_id, generated_by_option_id = resolve_generated_by_option_id(tag_ids, generated_by)
    else:
        for tag_id in tag_ids:
            generated_by_field_id = GENERATED_BY_FIELDS.get(tag_id)
            if generated_by_field_id:
                break

    if generated_by_field_id and generated_by_option_id:
        client.rpc(
            "tools/call",
            {
                "name": "set_field_option",
                "arguments": {
                    "nodeId": node_id,
                    "attributeId": generated_by_field_id,
                    "optionId": generated_by_option_id,
                },
            },
        )

    print(
        json.dumps(
            {
                "created_node_id": node_id,
                "person_field_id": person_field,
                "generated_by_field_id": generated_by_field_id,
                "generated_by_option_id": generated_by_option_id,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
