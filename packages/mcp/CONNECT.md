# Connect an AI agent to companybrain

An agent connected to companybrain works as a **team member**. Tasks can be assigned to it. Each
session it starts with `get_my_work`, and it leaves progress notes before it stops, so it never loses
track of its work.

Replace `<host>` with your companybrain address, e.g. `brain.example.com`.

## The easy way: paste the URL and approve (OAuth)

The connector URL is:

```
https://<host>/mcp
```

1. Paste it into your AI app (see the list below) and click **Connect**.
2. A companybrain window opens. Sign in.
3. Choose who the connection acts as: **yourself**, or an **AI agent you manage** (recommended, so
   its work shows up as its own). Choose **read** or **read + write** access, then click **Approve**.

That's all: no keys to copy. Each approved connection appears as a key under **Settings → API keys**,
where you can revoke it at any time.

| App | Where to paste |
|---|---|
| **Claude.ai** (web and mobile) | Settings → Connectors → *Add custom connector* → URL `https://<host>/mcp` → *Add* → *Connect*. On Team and Enterprise plans, an owner adds the connector first. |
| **Claude Desktop** | Settings → Connectors → *Add custom connector* → same URL → *Connect*. |
| **ChatGPT** | Settings → Apps & Connectors → Advanced settings → turn on *Developer mode*, then *Create* → MCP server URL `https://<host>/mcp`, Authentication *OAuth* → *Create* → sign in and approve. |
| **Claude Code** | `claude mcp add --transport http companybrain https://<host>/mcp`, then run `/mcp` in Claude Code, pick *companybrain* → *Authenticate*. Add `--scope user` to use it in every project. |

Under the hood, companybrain implements OAuth 2.1 with PKCE (S256), protected-resource metadata
(RFC 9728), authorization-server metadata (RFC 8414) and dynamic client registration (RFC 7591).
The app discovers everything from the URL alone.

## With an API key (any other client)

Use this for tools without OAuth sign-in, or for automations. In companybrain, open
**Team → the agent → API keys** and create a key (`cb_live_…`, shown once). A `write` key lets the
agent work on tasks, and a `read` key only lets it look.

There are two ways to send the key:

- **Header:** use `https://<host>/mcp` with `Authorization: Bearer <key>`.
- **URL only:** use `https://<host>/mcp/k/<key>`. Use this for clients that only accept a URL, and
  treat the URL as a password.

Recent Cursor, VS Code and Gemini CLI versions may also complete the OAuth flow when given only the
URL. The configs below use a key, which works everywhere.

**Cursor:** `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project)

```json
{ "mcpServers": { "companybrain": { "url": "https://<host>/mcp", "headers": { "Authorization": "Bearer cb_live_…" } } } }
```

**VS Code** (Copilot agent mode): `.vscode/mcp.json`. VS Code asks for the key once and stores it securely.

```json
{
  "inputs": [{ "type": "promptString", "id": "companybrain-key", "description": "companybrain API key", "password": true }],
  "servers": {
    "companybrain": { "type": "http", "url": "https://<host>/mcp", "headers": { "Authorization": "Bearer ${input:companybrain-key}" } }
  }
}
```

**Windsurf:** `~/.codeium/windsurf/mcp_config.json`

```json
{ "mcpServers": { "companybrain": { "serverUrl": "https://<host>/mcp", "headers": { "Authorization": "Bearer cb_live_…" } } } }
```

**Gemini CLI:** `~/.gemini/settings.json` (or `.gemini/settings.json` in a project)

```json
{ "mcpServers": { "companybrain": { "httpUrl": "https://<host>/mcp", "headers": { "Authorization": "Bearer cb_live_…" } } } }
```

**Claude Code with a key:**
`claude mcp add --transport http companybrain https://<host>/mcp --header "Authorization: Bearer <key>"`

**n8n:**
- Use the *MCP Client Tool* node: endpoint `https://<host>/mcp`, transport HTTP Streamable, Bearer auth.
- Or use an *HTTP Request* node to the REST API with *Header Auth* (`Authorization: Bearer <key>`).

**Zapier:** use *Webhooks by Zapier* → *Custom Request* with the same header.

**ChatGPT Custom GPT (Actions):**
1. In the GPT editor, go to Configure → Actions → *Import from URL* and enter `https://<host>/api/openapi.json`.
2. Set Authentication to *API Key*, Auth Type *Bearer*, and paste the key.
3. In the GPT instructions, tell it to call `GET /api/tasks?assigneeId=me` first and
   `POST /api/tasks/{id}/comments` to record progress.

**Scripts:**

```bash
curl -H "Authorization: Bearer <key>" "https://<host>/api/tasks?assigneeId=me"
curl -X POST -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \
     -d '{"text":"Send Acme proposal tomorrow 5pm @priya #website !high"}' https://<host>/api/tasks/quick
```

## Offline desktop use (stdio)

This only works on the machine that holds the companybrain database, and needs no network. Add
the server to `claude_desktop_config.json` (Claude Desktop → Settings → Developer → Edit Config).
Cursor and others accept the same `command`/`args`/`env` block:

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

If you do not use the default `~/.companybrain/companybrain.sqlite`, add
`"COMPANYBRAIN_DB_PATH": "/path/to/companybrain.sqlite"` to `env`. Restart the app afterwards.

## Tools

| Purpose | Tools |
|---|---|
| Start of session | `get_my_work` |
| Find work | `list_tasks`, `get_task`, `search` |
| Create and change tasks | `create_task`, `quick_add`, `update_task`, `complete_task` |
| Leave notes | `add_comment`, `handoff` |
| Team and projects | `list_projects`, `list_team` |
| Overview | `get_briefing`, `list_meetings`, `get_notifications` |
| Game progress | `get_my_stats` (level, rank, streak, today's mission %, daily challenges) |

Wherever a tool takes an id, a name works too, e.g. `"assignees": ["Priya"]` or `"project": "Website"`.
Dates without a UTC offset (`"2026-10-12T17:00"`, `"tomorrow 5pm"`) are read in the member's time zone.
When a tool completes a task, its result also shows the XP earned.

The MCP endpoint is stateless Streamable HTTP and returns plain JSON. It accepts POST only, and
answers GET with 405.

## Troubleshooting

- **The app says it can't connect or authenticate:** check that `https://<host>/.well-known/oauth-protected-resource`
  loads in a browser and that `COMPANYBRAIN_PUBLIC_URL` is set to the public https address.
- **"API key is read-only":** the connection was approved with read access only. Reconnect and grant
  read + write, or create a `write` key.
- **Unauthorized, or exit code 2 with stdio:** the key or connection was revoked or has expired, or
  the member was deactivated.
- **Agent shows as stale:** the agent has not called companybrain for longer than the org's
  `agentStaleAfterMin`. It should call `get_my_work` and leave progress notes.
