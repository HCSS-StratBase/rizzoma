#!/usr/bin/env python3
import json
import pathlib
import urllib.error
import urllib.parse
import urllib.request


MCP_URL = "http://127.0.0.1:8262/mcp"
TOKEN_URL = "http://127.0.0.1:8262/oauth/token"
CREDENTIALS_PATH = pathlib.Path("/home/stephan/.codex/.credentials.json")


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
    def __init__(self):
        creds, entry = load_credentials()
        self.creds = creds
        self.entry = entry
        self.token = entry["access_token"]
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
                self.token = refresh_access_token(self.creds, self.entry)
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

    def call_tool(self, name, arguments):
        return self.rpc("tools/call", {"name": name, "arguments": arguments})
