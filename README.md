# GameHub 0.3.0 🎮

> Console-style launcher for PC + emulators + cinema mode, with tracking of playtime, journey (played/completed/platinum), save snapshots, visual library, and live performance metrics (CPU, GPU, RAM, FPS via PresentMon — works even on EAC/BattlEye games).

## ⚡ Why GameHub auto-elevates to administrator

GameHub asks Windows for elevation at startup. This is **required**, not optional:

- **FPS reading on EAC/BattlEye protected games** (Elden Ring, Helldivers 2, etc.) uses Intel PresentMon's ETW (Event Tracing for Windows) capture. ETW sessions can only be created by elevated processes — there is no Windows API to capture present timing from medium-IL.
- **RTSS shared memory** (when not blocked by anti-cheat) is published with a security descriptor that grants read to medium-IL, but RTSS itself requires admin to inject its overlay, so without an elevated GameHub we can never confirm RTSS is healthy.
- **Process telemetry** for some hardened processes (anti-cheat, NVIDIA Frame Capture, MSI Afterburner) is hidden from non-admin token holders. CPU/RAM read paths fall back to the same elevated proc-helper.

The startup elevation is **one UAC prompt per launch**, not per game. From the prompt onward every PC, Windows, Steam, or Epic title you open in that session reads FPS automatically through PresentMon.

To bypass auto-elevation during hot-reload development:

```bash
npm run dev:no-auto-admin
```

This sets `GAMEHUB_NO_AUTO_ADMIN=1` and skips the elevation gate — FPS won't read on anti-cheat games, but the regular UI works for iteration.

## Quick Download ⬇️

- Windows Installer (`.exe`): [Download GameHub Setup](https://github.com/recalchi/gamehub/releases/latest/download/GameHub-Setup-x64.exe)
- Portable (`.zip`): [Download GameHub Portable](https://github.com/recalchi/gamehub/releases/latest/download/GameHub-portable-x64.zip)
- Checksums:
  - [Setup SHA256](https://github.com/recalchi/gamehub/releases/latest/download/GameHub-Setup-x64.exe.sha256)
  - [Portable SHA256](https://github.com/recalchi/gamehub/releases/latest/download/GameHub-portable-x64.zip.sha256)
- Latest release page: [Releases](https://github.com/recalchi/gamehub/releases/latest)

---

## Language / Idioma 🌍

- [PT-BR](#pt-br)
- [EN](#en)

Use toggle mode:
- PT-BR: open the section below
- EN: open the English section below

---

<a id="pt-br"></a>

<details open>
<summary><strong>PT-BR</strong></summary>

## PT-BR 🇧🇷

### Navegacao rapida 🧭

- [Visao geral](#pt-visao-geral)
- [Principais recursos](#pt-principais-recursos)
- [Instalacao](#pt-instalacao)
- [Build local](#pt-build-local)
- [Estado de validacao](#pt-estado-de-validacao)
- [Roadmap (proximas melhorias)](#pt-roadmap-proximas-melhorias)

<a id="pt-visao-geral"></a>

### Visao geral ✨

GameHub e um hub para jogos e emuladores no Windows, com interface inspirada em consoles, foco em biblioteca visual, scans de jogos, covers, gerenciamento de saves e monitoramento de sessao.

<a id="pt-principais-recursos"></a>

### Principais recursos 🚀

- Biblioteca de jogos por plataforma (PC + emuladores)
- Tela inicial estilo console com navegacao por controle
- Integracoes (Steam/Epic/Discord Rich Presence)
- Painel de desempenho por jogo
- Sistema de jornada:
  - status `jogado`, `zerado`, `platinado`
  - persistencia independente da instalacao do jogo
  - registro visual com capa + link de re-download
- Save manager com snapshots
- Modo cinema (catalogo local, watched tracking e subtitulos)
- Download manager com:
  - progresso em tempo real
  - **resume de parcial via HTTP Range**
  - **checksum SHA-256 opcional**
- Sidebar com indicador confiavel de `Now Playing`

<a id="pt-instalacao"></a>

### Instalacao 🛠️

1. Baixe o instalador em [GameHub Setup](https://github.com/recalchi/gamehub/releases/latest/download/GameHub-Setup-x64.exe)
2. Execute e siga o wizard
3. Abra o GameHub — o Windows vai pedir **UAC (Controle de Conta de Usuario)** uma vez por sessao. Aceite. Isso e obrigatorio para ler FPS de jogos com anti-cheat (Elden Ring etc.) via PresentMon/ETW. Veja "Por que o GameHub pede admin" no topo do README.
4. Configure suas pastas em `Configuracoes > Biblioteca`

Opcional portatil:

1. Baixe [GameHub Portable](https://github.com/recalchi/gamehub/releases/latest/download/GameHub-portable-x64.zip)
2. Extraia o `.zip`
3. Execute `GameHub.exe`

<a id="pt-build-local"></a>

### Build local 🧪

```bash
npm install
npm run typecheck
npm run build

# Dev com auto-elevacao (recomendado — FPS funciona):
npm run dev

# Dev sem auto-elevacao (para iterar mais rapido em UI / sem UAC repetido):
npm run dev:no-auto-admin
```

Pacotes Windows:

```bash
npm run dist:win
npm run dist:win:portable
npm run manifest:win
```

<a id="pt-estado-de-validacao"></a>

### Estado de validacao ✅

Validado nesta versao:

- `npm run typecheck` OK
- `npm run build` OK

<a id="pt-roadmap-proximas-melhorias"></a>

### Roadmap (proximas melhorias) 🗺️

1. Conta de usuario + sync opcional (saves, jornada, conquistas)
2. Metadata fallback providers:
   - TheGamesDB
   - ScreenScraper
3. Wizard unificado de download/instalacao de emuladores
4. Mapeamento de controle por emulador (gravar INI/YAML por backend)
5. Catalogo "leve" mais rico (links, tamanho, capa, status de disponibilidade)
6. SQLite opcional para bibliotecas muito grandes (+5k entradas)
7. Melhorias de UX:
   - filtros discretos avancados
   - organizacao de cards por qualidade de metadata
8. Telemetria local opt-in para diagnostico de launch failures

---

</details>

<a id="en"></a>

<details>
<summary><strong>EN</strong></summary>

## EN 🇺🇸

### Quick Navigation 🧭

- [Overview](#en-overview)
- [Key Features](#en-key-features)
- [Install](#en-install)
- [Local Build](#en-local-build)
- [Validation Status](#en-validation-status)
- [Roadmap (next updates)](#en-roadmap-next-updates)

<a id="en-overview"></a>

### Overview ✨

GameHub is a Windows launcher hub for PC + emulators with a console-like UX, visual library focus, game scanning, cover management, save snapshots, and runtime monitoring.

<a id="en-key-features"></a>

### Key Features 🚀

- Library by platform (PC + emulators)
- Console-style home UI with controller navigation
- Integrations (Steam/Epic/Discord Rich Presence)
- Per-game performance panel
- Journey tracking:
  - `played`, `completed`, `platinum`
  - persisted independently from installed binaries
  - visual record with cover + re-download link
- Save manager with snapshots
- Cinema mode (local catalog, watched tracking, subtitles)
- Download manager with:
  - real-time progress
  - **resume via HTTP Range**
  - **optional SHA-256 checksum validation**
- Reliable sidebar `Now Playing` indicator

<a id="en-install"></a>

### Install 🛠️

1. Download [GameHub Setup](https://github.com/recalchi/gamehub/releases/latest/download/GameHub-Setup-x64.exe)
2. Run installer
3. Configure folders in `Settings > Library`

Portable mode:

1. Download [GameHub Portable](https://github.com/recalchi/gamehub/releases/latest/download/GameHub-portable-x64.zip)
2. Extract
3. Run `GameHub.exe`

<a id="en-local-build"></a>

### Local Build 🧪

```bash
npm install
npm run typecheck
npm run build
```

Windows packages:

```bash
npm run dist:win
npm run dist:win:portable
npm run manifest:win
```

<a id="en-validation-status"></a>

### Validation Status ✅

Validated for this version:

- `npm run typecheck` OK
- `npm run build` OK

<a id="en-roadmap-next-updates"></a>

### Roadmap (next updates) 🗺️

1. Optional account + cloud sync (saves, journey, achievements)
2. Metadata fallback providers:
   - TheGamesDB
   - ScreenScraper
3. Unified in-app emulator download/install wizard
4. Per-emulator controller mapping (write INI/YAML per backend)
5. Expanded lightweight catalog (links, size, cover, availability)
6. Optional SQLite migration for very large libraries (5k+ entries)
7. UX polishing:
   - advanced discreet filters
   - metadata quality organization
8. Opt-in local telemetry for launch failure diagnostics

---

</details>

## Maintainers 🤝

- Repository: [recalchi/gamehub](https://github.com/recalchi/gamehub)
- Issues: [Open an issue](https://github.com/recalchi/gamehub/issues/new/choose)
