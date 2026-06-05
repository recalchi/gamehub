# GameHub 0.2.0 🎮

> Console-style launcher for PC + emulators + cinema mode, with tracking of playtime, journey (played/completed/platinum), save snapshots, and visual library.

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
3. Abra o GameHub e configure suas pastas em `Configuracoes > Biblioteca`

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
