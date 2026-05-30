# GameHub

A fullscreen game launcher and emulator hub for PC, inspired by modern console
interfaces (PS3 XMB, Netflix, Steam Big Picture), with library scanning,
emulator integration, gamepad navigation, covers, saves and updates.

> **Status:** v0.1 MVP — scaffolding, scanner, launcher, splash + library UI,
> gamepad navigation, JSON persistence. Cover art services, save management,
> downloads and full XMB animations are tracked for v0.2+.

## Stack

| Layer       | Choice                              | Why                                          |
|-------------|-------------------------------------|----------------------------------------------|
| Shell       | **Electron 33**                     | Mature Windows packaging, Node ecosystem.    |
| UI          | **React 18 + TypeScript + Tailwind**| Console-style UI with Framer Motion + glass. |
| Build       | **electron-vite**                   | Unified main/preload/renderer hot reload.    |
| State       | **Zustand**                         | Tiny, no boilerplate.                        |
| Persistence | **JSON files** (in `%APPDATA%`)     | Zero native deps. Swappable for SQLite.      |
| Search      | **Fuse.js**                         | Fast fuzzy search across the library.        |
| Input       | **Web Gamepad API**                 | Native to webview, supports XInput/DInput.   |

### Why not Tauri?
Tauri is lighter, but requires the Rust toolchain. The host doesn't have it
installed and the spec demands fast time-to-MVP.

### Why JSON instead of SQLite for the MVP?
SQLite (`better-sqlite3`) is the right long-term choice, but native modules
need an `electron-rebuild` step that can fail on Windows due to MSVC build
tools. JSON eliminates the risk for the MVP. The `store.ts` API surface is
small enough that swapping in `better-sqlite3` later is a half-day job.

## Layout

```
src/
├── shared/          # Types, IPC channel names, platform & emulator catalogs
├── main/            # Electron main process
│   ├── core/        # scanner, detector, emulators, launcher, store, logger
│   └── ipc/         # IPC handler registration
├── preload/         # contextBridge exposing window.api with typed methods
└── renderer/        # React app
    └── src/
        ├── pages/       # Splash, Home, Library, GameDetail, Settings, Search
        ├── components/  # GameCard, Sidebar, AnimatedBackground, ...
        ├── hooks/       # useGamepad, useFocus
        └── store/       # zustand library store
```

User data lives in `%APPDATA%/gamehub`:
- `settings.json` — paths, overrides, preferences
- `library.json`  — detected games + emulators
- `logs/`         — daily rotating log files

## Running

```powershell
cd D:\Projetos\code\gamehub
npm install
npm run dev          # electron-vite dev with hot reload
npm run build        # production build to ./out
npm run build:win    # bundle a Windows directory build
npm run typecheck    # tsc on both Node + Web tsconfigs
```

Double-click `run.bat` to start the dev build without a terminal.

## First run

The splash screen automatically scans the default game root `D:\Jogos` and the
emulator root `D:\Jogos\Emuladores`. Use **Settings** to add or remove paths.

Status flags on each game card:

| Badge          | Meaning                                                    |
|----------------|------------------------------------------------------------|
| `Pronto`       | Emulator found, no BIOS required.                          |
| `Sem emulador` | No emulator matched the detected platform. Set one up.     |
| `BIOS`         | Emulator found, but it needs BIOS files configured by user.|
| `Suspeito`     | File flagged by the scanner (multi-track without .cue, etc.)|

## Controls

| Action              | Keyboard          | Gamepad            |
|---------------------|-------------------|--------------------|
| Navigate            | Arrows / WASD     | D-pad / left stick |
| Confirm / Play      | `Enter`           | A                  |
| Back                | `Esc`             | B                  |
| Open settings       | (sidebar)         | Start              |
| Toggle fullscreen   | `F11`             | —                  |
| Favorite            | `F` (on details)  | —                  |

## Implemented

### Core
- [x] Library scanner with dedup, ambiguity heuristics, deadline-bounded walk
- [x] Emulator auto-detection across multiple install paths (skips emulator subtrees)
- [x] **BIOS detection** with status reconciliation (`missing-bios` → `ready` when present)
- [x] **Save manager** with timestamped snapshots, auto-safety-backup before restore
- [x] **Cover art** via libretro thumbnails (no API key, ~70% hit rate) + manual picker + refetch
- [x] **Manual game add** for Minecraft, Steam, indies, ROMs outside scan roots
- [x] Game removal (entry only — never touches disk files)
- [x] Inline title editing on the detail screen
- [x] Splash with deadline + skip + error display + scan progress banner on Home
- [x] Per-game cover refetch + custom local image picker

### Screens
- [x] **Home** — rotating hero (Ken Burns, 9s cross-fade) + recents + favorites + per-platform shelves
- [x] **Biblioteca** — grid with platform chips, status filters, tag filter, sort options, manual add
- [x] **Catálogo** — curated free/homebrew games with one-click install
- [x] **Buscar** — fuzzy search (Fuse.js) across title/platform/dev/genre/description/tags
- [x] **Estatísticas** — KPIs, per-platform bar chart, per-status donut, top-played, cover hit rate
- [x] **Emuladores** — per-emulator status, BIOS check, "open BIOS folder", legal links
- [x] **Controles** — live gamepad detector with button/axis visualizer + preferences
- [x] **Configurações** — paths, emulator overrides, accent picker, About, update check, log viewer, health check, backup/restore
- [x] **Modo TV / Big Picture** — XMB-inspired fullscreen, auto-enters fullscreen, pure gamepad nav
- [x] **Detalhes do jogo** — cover actions, inline title edit, metadata + tags editor, BIOS check, save manager, remove
- [x] **Atalhos overlay** — press `?` anywhere for keyboard + gamepad reference
- [x] **Onboarding tour** — 3-step welcome on first launch with empty library

### Plumbing
- [x] Update checker hitting a configurable JSON manifest URL
- [x] Diagnostic panel: app version, stats, on-disk path reveal
- [x] Daily-rotating log file + in-app log viewer with level filter
- [x] Gamepad nav: deadzone, preferred-pad selection, A/B swap, Y inversion
- [x] CSP-compliant renderer with file:// covers
- [x] React error boundary + window-level unhandled-rejection logger
- [x] **Launch failure toast** — emulator exits non-zero in <10s → user-facing alert
- [x] **Now Playing** indicator — sidebar shows pulsing pill while an emulator runs
- [x] **Live accent color** — CSS variable + Tailwind recipe, 6 presets + hex input
- [x] **Tag system** — per-game user labels with autocomplete + Library filter chips
- [x] **Library health check** — broken paths + orphan cover cleanup
- [x] **Backup/restore** — single JSON containing settings + library, with safety snapshot
- [x] **Metadata editor** (genre, developer, year, description) — feeds fuzzy search
- [x] **URL download manager** — streams remote files to `userData/downloads/<platform>/`, auto-registers as games
- [x] Five headless smoke tests for CI (saves, manual, download, launch, backup)

## Roadmap

- [ ] Fallback metadata sources (TheGamesDB, ScreenScraper) for libretro misses (requires API keys)
- [ ] In-app emulator download wizard (curated list of legal direct-download links)
- [ ] Controller mapping per emulator (write into emulator INI/YAML — needs per-emu impl)
- [ ] Optional SQLite migration once library exceeds ~5k entries
- [ ] Resume / checksum verify in download manager
- [ ] "Now Playing" indicator in sidebar (tracking detached emulator process)

## Development smoke tests

The main process accepts diagnostic flags that exercise specific subsystems
without needing UI interaction. Useful in CI or as fast pre-commit checks:

```powershell
npx electron . --smoke-saves     # scans, picks a PS1 game, backs up its memcard
npx electron . --smoke-manual    # adds + removes a manual game entry, verifies round-trip
npx electron . --smoke-download  # downloads a tiny test file, auto-registers and cleans up
npx electron . --smoke-launch    # spawns tasklist.exe and confirms started+ended events fire
npx electron . --smoke-backup    # exports config, mungeds library, restores, verifies match
```

All exit 0 on success, 1 on failure, with full log lines in
`%APPDATA%/gamehub/logs/<date>.log`.

## Windows release and auto-update

GameHub now uses `electron-builder` + `electron-updater` with GitHub Releases
as the update source (not branch sync and never `git pull` on end-user machines).

### Build installer locally

```powershell
npm run dist:win
```

Expected output in `release/`:
- `GameHub-Setup-x64-<version>.exe`
- `latest.yml`
- `*.blockmap`

### Publish a release

```powershell
npm run publish:win
```

This publishes versioned artifacts to `https://github.com/recalchi/gamehub/releases`.

### Runtime updater flow

1. App opens normally.
2. In background, updater checks `stable` release metadata.
3. If newer version exists, updater downloads package automatically.
4. Downloaded package is verified by updater metadata (`latest.yml` + signature/hash chain).
5. User can install/restart from Settings > About, or update applies on next quit.
6. On network/update errors, app keeps running and logs the issue.

## Legal

GameHub is a launcher. It does not distribute commercial ROMs, BIOS files or
emulators. Users are responsible for owning the games they add.
