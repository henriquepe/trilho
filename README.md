# Trilho

A free, open-source issue tracker for people who juggle many backlogs and projects. It is local-first: no account, no server, no limits.

The interface is in Portuguese (pt-BR).

## Features

- **Unlimited backlogs** (teams), each with its own key: `APP-12`, `WEB-3`.
- **Projects** with status, target date and progress.
- **Issues** with status, priority, labels, estimate, due date, sub-issues, links and comments.
- **List and board views**, with filters and search. The board supports drag and drop.
- **Command palette** (`⌘K`) and keyboard shortcuts (`C` creates an issue, `/` searches).
- **Local-first storage.** Data lives in IndexedDB on your machine and stays in sync across open tabs.
- **Import and export as JSON.** Importing merges into your data and never replaces it, so backups can be restored safely.
- **Import from Linear.** A read-only script exports a Linear workspace into a Trilho file (see below).
- **macOS desktop app** built with Tauri, plus the same app in any browser.
- **MCP connector for Claude**: Claude can search, create and update your issues (see below).

## Install on macOS

1. Download the `.dmg` from [Releases](https://github.com/henriquepe/trilho/releases).
2. Drag Trilho to Applications.

The build is not notarized by Apple. On first launch, right-click the app and choose **Open**. If macOS still blocks it, run:

```bash
xattr -dr com.apple.quarantine /Applications/Trilho.app
```

## Run from source

Requirements:

- Node 20 or newer.
- For the desktop app, also Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run dev          # web app at http://localhost:5183
npm test             # unit tests
npx tauri dev        # desktop app in dev mode
npx tauri build      # .app and .dmg in src-tauri/target/release/bundle
```

## Import from Linear

Create a personal API key in Linear (Settings → Security & access → API), then run:

```bash
LINEAR_API_KEY=lin_api_... node scripts/linear-to-trilho.mjs imports/linear-workspace.json
```

The script only reads from Linear. Archived items are skipped.

In Trilho, click **Importar** and choose the file. What comes over:

- Teams become backlogs with the same key, so `ENG-42` stays `ENG-42`.
- Projects, labels, sub-issues, comments and attachments (as links).

The `imports/` folder is git-ignored because it holds your data.

## Use with Claude (MCP connector)

Trilho ships its own [MCP](https://modelcontextprotocol.io) server. Claude, or any other MCP client, can use it to search, create and update your issues and projects.

The desktop app keeps the workspace in one file, which is also the file the server reads and writes:

| OS | Path |
| --- | --- |
| macOS | `~/Library/Application Support/com.henriquepires.trilho/trilho.json` |
| Linux | `~/.local/share/com.henriquepires.trilho/trilho.json` |
| Windows | `%APPDATA%\com.henriquepires.trilho\trilho.json` |

Changes made through the connector show up in the open app right away.

Build the server (Node 20 or newer):

```bash
npm install
npm run build:mcp    # creates mcp/dist/trilho-mcp.mjs
```

**Claude Code:**

```bash
claude mcp add -s user trilho -e TRILHO_AUTHOR="Your Name" -- node /path/to/trilho/mcp/dist/trilho-mcp.mjs
```

**Claude Desktop:** add the server to `claude_desktop_config.json`, then restart Claude.

```json
{
  "mcpServers": {
    "trilho": {
      "command": "node",
      "args": ["/path/to/trilho/mcp/dist/trilho-mcp.mjs"],
      "env": { "TRILHO_AUTHOR": "Your Name" }
    }
  }
}
```

Tools:

| Read | Write |
| --- | --- |
| `list_backlogs`, `list_projects`, `list_labels`, `search_issues`, `get_issue` | `create_issue`, `update_issue`, `add_comment`, `create_backlog`, `create_project`, `update_project` |

There are no delete tools. To close an issue, set its status to `done` or `canceled`.

Environment variables:

- `TRILHO_DATA_FILE` points the server at another file.
- `TRILHO_AUTHOR` sets the name on comments added through the connector (default: `Claude`).

Open the app once before using the connector, so the data file exists.

If you edit in the app while Claude changes the same workspace, the last save wins. A change you are still typing is never overwritten.

## Hosted mode (AWS)

To share one workspace between machines and bots, Trilho can run on AWS: one Lambda behind an HTTP API, with the workspace kept as a single versioned S3 object. There is no VPC and no database, and personal use costs well under US$ 1 per month. `infra/template.yaml` holds the whole stack.

The API serves:

| Route | Use |
| --- | --- |
| `POST /mcp` | MCP connector over Streamable HTTP, with the same tools as the local server |
| `GET /workspace` | Whole workspace, with its `ETag` |
| `PUT /workspace` | Replaces the workspace. Needs `If-Match` (or `If-None-Match: *` for the first upload) and answers `412` if someone saved first |
| `GET /health` | Open health check |

Every route except `/health` needs `Authorization: Bearer <token>`. To sign comments with a bot's name, send `X-Trilho-Author`.

Deploy (requires the AWS SAM CLI):

```bash
# 1. Tokens: a SecureString, comma-separated if you want one per client
aws ssm put-parameter --name /trilho/production/tokens --type SecureString --value "<token>"

# 2. Your settings (git-ignored), then deploy
cp infra/samconfig.example.toml infra/samconfig.toml
npm run deploy

# 3. Upload the current workspace once
curl -X PUT "$TRILHO_URL/workspace" -H "Authorization: Bearer <token>" \
  -H "If-None-Match: *" -H "content-type: application/json" --data-binary @trilho.json
```

Connect a client:

```bash
claude mcp add -s user --transport http trilho "$TRILHO_URL/mcp" -H "Authorization: Bearer <token>"
```

To use a custom domain, pass `DomainName` and `CertificateArn` (an ACM certificate in the same region), then point a CNAME at the `CustomDomainTarget` output.

## Stack

Vite, React 19, TypeScript, Tailwind CSS v4 and shadcn/ui; Tauri 2 for the desktop app; Vitest for tests.

Trilho is an independent project. It is not affiliated with Linear.

## License

[MIT](LICENSE)
