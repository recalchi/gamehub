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

## Windows installer and release

GameHub uses `electron-builder` (NSIS) for a Windows x64 installer and
`electron-updater` for release-based updates via GitHub Releases.

Important security model:
- no `git pull` in end-user clients;
- updates come from signed/versioned release artifacts;
- updater rejects downgrade (`allowDowngrade=false`) and only uses allowlisted hosts.

### Build commands

```powershell
# Generate brand icon pack (ico + png sizes)
npm run icon:generate

# Installer EXE (NSIS)
npm run dist:win

# Portable ZIP fallback
npm run dist:win:portable

# Full release bundle (installer + portable + manifest + SHA256)
npm run dist:win:full
```

Expected files under `release/`:
- `GameHub-Setup-x64-<version>.exe`
- `GameHub-Setup-x64-<version>.exe.blockmap`
- `GameHub-portable-x64-<version>.zip`
- `latest.yml`
- `releases.json`
- `GameHub-Setup-x64-<version>.exe.sha256`
- `GameHub-portable-x64-<version>.zip.sha256`

### Publish GitHub release

```powershell
npm run publish:win
```

Or use GitHub Actions by pushing a `v*` tag (workflow:
`.github/workflows/release-win.yml`).

### Silent install / uninstall (NSIS)

```powershell
# silent install (per-user, no UAC)
.\GameHub-Setup-x64-<version>.exe /S

# optional custom path
.\GameHub-Setup-x64-<version>.exe /S /D=%LocalAppData%\Programs\GameHub

# silent uninstall
"%LocalAppData%\Programs\GameHub\Uninstall GameHub.exe" /S
```

Installer defaults:
- per-user install (`%LocalAppData%\Programs\GameHub`);
- Start Menu shortcut;
- desktop shortcut optional in UI flow;
- uninstall removes binaries/shortcuts and keeps user data by default
  (`deleteAppDataOnUninstall=false`).

### Signing (prepared, optional for local builds)

Build works without certificates. For production, sign installer and binaries:

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a release\GameHub-Setup-x64-<version>.exe
signtool verify /pa /v release\GameHub-Setup-x64-<version>.exe
```

### SHA256 verification

```powershell
Get-FileHash -Algorithm SHA256 .\release\GameHub-Setup-x64-<version>.exe
Get-Content .\release\GameHub-Setup-x64-<version>.exe.sha256
```

### Auto-update runtime flow

1. App opens normally.
2. Updater checks releases in background.
3. If update exists, package downloads automatically.
4. UI shows states: checking, downloading, downloaded, install/restart.
5. On failure, app continues running and logs the error.

### SmartScreen note

Even with valid Authenticode, new direct-download builds can still show
SmartScreen warnings until reputation matures. Microsoft Store distribution is
an optional later phase to reduce this friction.

## Legal

GameHub is a launcher. It does not distribute commercial ROMs, BIOS files or
emulators. Users are responsible for owning the games they add.
