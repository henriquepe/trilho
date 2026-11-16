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

## Stack

Vite, React 19, TypeScript, Tailwind CSS v4 and shadcn/ui; Tauri 2 for the desktop app; Vitest for tests.

Trilho is an independent project. It is not affiliated with Linear.

## License

[MIT](LICENSE)
