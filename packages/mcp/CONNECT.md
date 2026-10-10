# Connect an AI agent to companybrain

Every agent works as a **team member**: it has its own account (Team → Add AI agent) and its own
API key (`cb_live_…`, shown once). Give it a `write` key to let it work on tasks, or a `read` key to
let it only look. When an agent connects, it is told to call `get_my_work` at the start of every
session and to leave progress notes, so it picks up where it left off.

Replace `<host>` with your companybrain address (e.g. `brain.example.com`) and `<key>` with the key.

| Endpoint | Auth | Use for |
|---|---|---|
| `https://<host>/mcp` | header `Authorization: Bearer <key>` | Clients that can send headers |
| `https://<host>/mcp/k/<key>` | key in URL. **Treat this URL as a password.** | Clients that only take a URL |
| `companybrain mcp` (stdio) | env `COMPANYBRAIN_MCP_KEY` | Desktop apps on the machine that runs companybrain |
| `https://<host>/api/…` + `/api/openapi.json` | header `Authorization: Bearer <key>` | REST: Custom GPTs, n8n, Zapier, scripts |

The MCP endpoint is stateless Streamable HTTP and returns plain JSON. It accepts POST only, and
answers GET with 405.

## Claude Desktop

**Remote (recommended):** Settings → Connectors → *Add custom connector* → URL `https://<host>/mcp/k/<key>`.

**Local stdio** (only on the machine that holds the companybrain database). Edit
`claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "companybrain": {
      "command": "npx",
      "args": ["tsx", "/path/to/companybrain/cli/bin/companybrain.ts", "mcp"],
      "env": { "COMPANYBRAIN_MCP_KEY": "cb_live_…" }
    }
  }
}
```

Add `"COMPANYBRAIN_DB_PATH": "/path/to/companybrain.sqlite"` to `env` if you do not use the default
`~/.companybrain/companybrain.sqlite`. Restart Claude Desktop afterwards.

## Claude.ai (web and mobile)

Settings → Connectors → *Add custom connector* → name `companybrain`, URL `https://<host>/mcp/k/<key>`.
Leave OAuth empty. On Team and Enterprise plans, an owner adds the connector first.

## Claude Code

```bash
claude mcp add --transport http companybrain https://<host>/mcp --header "Authorization: Bearer <key>"
# or local stdio:
claude mcp add companybrain --env COMPANYBRAIN_MCP_KEY=<key> -- npx tsx /path/to/companybrain/cli/bin/companybrain.ts mcp
```

Add `--scope user` to use it in every project. Run `/mcp` inside Claude Code to check that it connected.

## ChatGPT

- **Connector (MCP, developer mode):** Settings → Apps & Connectors → Advanced settings → turn on
  *Developer mode*, then *Create* → MCP server URL `https://<host>/mcp/k/<key>`, Authentication
  *No authentication* (the key is in the URL).
- **Custom GPT (Actions):** in the GPT editor, go to Configure → Actions → *Import from URL* and enter
  `https://<host>/api/openapi.json`. Set Authentication to *API Key*, Auth Type *Bearer*, and paste `<key>`.
  In the GPT instructions, tell it to call `GET /api/tasks?assigneeId=me` first and
  `POST /api/tasks/{id}/comments` to record progress.

## Cursor

`~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "companybrain": {
      "url": "https://<host>/mcp",
      "headers": { "Authorization": "Bearer cb_live_…" }
    }
  }
}
```

## VS Code (Copilot agent mode)

`.vscode/mcp.json`. VS Code asks for the key once and stores it securely:

```json
{
  "inputs": [
    { "type": "promptString", "id": "companybrain-key", "description": "companybrain API key", "password": true }
  ],
  "servers": {
    "companybrain": {
      "type": "http",
      "url": "https://<host>/mcp",
      "headers": { "Authorization": "Bearer ${input:companybrain-key}" }
    }
  }
}
```

## Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "companybrain": {
      "serverUrl": "https://<host>/mcp",
      "headers": { "Authorization": "Bearer cb_live_…" }
    }
  }
}
```

## Gemini CLI

`~/.gemini/settings.json` (or `.gemini/settings.json` in a project):

```json
{
  "mcpServers": {
    "companybrain": {
      "httpUrl": "https://<host>/mcp",
      "headers": { "Authorization": "Bearer cb_live_…" }
    }
  }
}
```

## n8n, Zapier and scripts (REST)

Send `Authorization: Bearer <key>` and `Content-Type: application/json` with every request.

- n8n: use an *HTTP Request* node with *Generic Credential* → *Header Auth*
  (`Authorization` / `Bearer <key>`). n8n's *MCP Client Tool* node also works: set the endpoint to
  `https://<host>/mcp`, the transport to HTTP Streamable, and Bearer auth.
- Zapier: *Webhooks by Zapier* → *Custom Request*, with the same header.

```bash
curl -H "Authorization: Bearer <key>" "https://<host>/api/tasks?assigneeId=me"
curl -X POST -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \
     -d '{"text":"Send Acme proposal tomorrow 5pm @priya #website !high"}' https://<host>/api/tasks/quick
```

The full reference is at `https://<host>/api/openapi.json`.

## Tools

`get_my_work` (call it first), `list_tasks`, `get_task`, `create_task`, `quick_add`, `update_task`,
`complete_task`, `add_comment`, `handoff`, `list_projects`, `list_team`, `get_briefing`,
`list_meetings`, `get_notifications`, `search`.

Wherever a tool takes an id, a name works too, e.g. `"assignees": ["Priya"]` or `"project": "Website"`.
Dates without a UTC offset (`"2026-10-12T17:00"`, `"tomorrow 5pm"`) are read in the member's time zone.

## Troubleshooting

- *"API key is read-only"*: the key only has the `read` scope. Create a key with `write`.
- *Unauthorized / exit code 2 (stdio)*: the key is wrong, revoked or expired, or the member was deactivated.
- *Agent shows as stale*: the agent has not called companybrain for longer than the org's
  `agentStaleAfterMin`. It should call `get_my_work` and leave progress notes.
