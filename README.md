# GameHub

> PT-BR | [English](#english)

GameHub e uma central local para jogar, assistir e organizar sua biblioteca no Windows. Ele combina launcher de jogos PC, emuladores, modo cinema, capas, saves, conquistas manuais, Discord Rich Presence e monitoramento de desempenho em uma interface inspirada em console.

## Navegacao Rapida

- [Downloads](#downloads)
- [O Que Ja Funciona](#o-que-ja-funciona)
- [Monitoramento De Desempenho](#monitoramento-de-desempenho)
- [Modo Cinema](#modo-cinema)
- [Instalacao Para Desenvolvimento](#instalacao-para-desenvolvimento)
- [Build, Instalador E Release](#build-instalador-e-release)
- [Roadmap](#roadmap)
- [English](#english)

## Downloads

Os pacotes publicos ficam nas releases do GitHub:

- [Baixar a versao mais recente](https://github.com/recalchi/gamehub/releases/latest)
- [Ver todas as releases](https://github.com/recalchi/gamehub/releases)

Arquivos esperados por release:

- `GameHub-Setup-x64-<version>.exe`: instalador Windows.
- `GameHub-portable-x64-<version>.zip`: versao portatil.
- `latest.yml` e `releases.json`: manifestos de atualizacao.
- `.sha256`: hashes para verificacao.

## O Que Ja Funciona

### Biblioteca De Jogos

- Scanner de jogos PC, ROMs e midias em multiplos diretorios.
- Cadastro manual de jogos e executaveis.
- Importacao de jogos Steam e Epic Games quando os dados locais existem.
- Capas locais, capas empacotadas e fallback visual quando nao ha imagem.
- Filtros por plataforma, status, tags, tamanho e ordenacao discreta.
- Deteccao de tamanho real de jogos PC por pasta, incluindo jogos grandes como Elden Ring e God of War.
- Remocao segura de entrada da biblioteca sem apagar arquivo por acidente.

### Launcher

- Abertura de jogos PC por `.exe`, sem forcar Steam quando o jogo e nativo.
- Suporte a emuladores detectados no PC.
- Controle de sessao ativa e encerramento seguro por PID/arvore de processo.
- Reanexacao de monitor para jogos PC que ja estao abertos.
- Configuracoes de tela cheia, janela e direcionamento de monitor.

### Interface

- Home com hero tematico, capas e secoes por biblioteca.
- Menu lateral compacto/minimizavel.
- Modo TV/Big Picture para uso com controle.
- Tela de detalhes com configuracao, historico, conquistas/zerados e desempenho.
- Navegacao por teclado e controle.
- Splash/abertura com experiencia estilo console.

### Conquistas, Zerados E Saves

- Aba visual para jogos jogados, zerados e platinados.
- Backup independente de saves quando o usuario marca progresso.
- Preservacao de capa e informacoes mesmo se o jogo for removido depois.
- Link de referencia para baixar/reinstalar futuramente.

### Discord

- Discord Rich Presence para mostrar o jogo atual quando a integracao esta configurada.
- Validacao de status e conexao pelo painel de integracoes.

## Monitoramento De Desempenho

O GameHub monitora jogos em tempo real para deixar a tela aberta em outro monitor enquanto voce joga.

Leituras atuais:

- CPU do processo.
- RAM do jogo e RAM geral do sistema.
- GPU por `nvidia-smi` quando a GPU/driver expoe o processo.
- GPU por contadores do Windows como fallback.
- FPS por RTSS/MSI Afterburner quando o RivaTuner Statistics Server esta ativo.
- Relatorio final com diagnostico e sugestoes.

### FPS Com MSI Afterburner + RTSS

Para FPS em jogos PC, o GameHub le a memoria compartilhada `RTSSSharedMemoryV2`.

Passos:

1. Instale o MSI Afterburner com o RivaTuner Statistics Server.
2. Abra o MSI Afterburner e deixe o RTSS rodando em segundo plano.
3. Abra o jogo pelo GameHub.
4. Na tela de detalhes, use a aba **Historico > Desempenho**.
5. Se o jogo ja estiver aberto, clique em **Reconectar monitor**.

Link oficial:

- [MSI Afterburner](https://us.msi.com/Landing/afterburner/graphics-cards)

## Modo Cinema

O modo cinema organiza filmes, series e documentarios separados da biblioteca de jogos.

Recursos:

- Diretorios dedicados para filmes e series.
- Capas por pasta e busca de metadata.
- Organizacao de series por temporadas e episodios.
- Acompanhamento do que ja foi assistido em base separada.
- Backup da lista de assistidos.
- Favoritos e progresso.
- Reproducao dentro do app quando o formato e suportado pelo player interno.

## Instalacao Para Desenvolvimento

Requisitos:

- Windows 10/11.
- Node.js LTS.
- npm.

```powershell
git clone https://github.com/recalchi/gamehub.git
cd gamehub
npm install
npm run dev
```

Comandos uteis:

```powershell
npm run typecheck
npm run build
npm run build:win
```

## Build, Instalador E Release

GameHub usa Electron, electron-vite e electron-builder com NSIS.

```powershell
# Gera icones do app
npm run icon:generate

# Build de producao
npm run build

# Instalador Windows
npm run dist:win

# ZIP portatil
npm run dist:win:portable

# Pacote completo
npm run dist:win:full
```

Publicacao:

```powershell
npm run publish:win
```

Ou publique criando uma tag `v*` para acionar o workflow `.github/workflows/release-win.yml`.

## Estrutura Do Projeto

```text
src/
  shared/          tipos, IPC, plataformas e catalogos
  main/            processo principal Electron
    core/          scanner, launcher, performance, cinema, covers, saves
    ipc/           handlers IPC
  preload/         bridge seguro para window.api
  renderer/        app React
    src/pages/     Home, Biblioteca, Cinema, Detalhes, Configuracoes
    src/components componentes reutilizaveis
```

Dados do usuario:

```text
%APPDATA%/GameHub/
  settings.json
  library.json
  media-library.json
  media-watched.json
  game-journey.json
  logs/
  covers/
  saves/
```

## Roadmap

### MVP Imediato

- Corrigir erros de typecheck web em `GameDetail` relacionados a `journey`, `archiveRemove` e `GameCompletionStatus`.
- Gerar nova release com instalador e ZIP apos as correcoes de monitoramento.
- Melhorar diagnostico visual quando RTSS nao esta rodando.
- Criar checklist de primeira configuracao para controle, Discord, biblioteca e cinema.

### Biblioteca E Metadata

- Fallback de metadata com TheGamesDB e ScreenScraper, mediante chaves de API.
- Melhor reconciliacao de capas por pasta, nome normalizado e hash.
- Catalogo local com links, tamanho estimado e status de posse/baixado.
- Migracao opcional para SQLite quando a biblioteca passar de milhares de entradas.

### Desempenho

- Leitura de FPS alternativa quando RTSS nao estiver disponivel.
- Melhor integracao com GPUs AMD/Intel.
- Historico de desempenho por jogo.
- Alertas configuraveis para CPU, RAM, VRAM, FPS baixo e quedas.

### Emuladores E Controle

- Assistente de download legal de emuladores.
- Mapeamento por emulador escrevendo em INI/YAML quando suportado.
- Perfis por controle e por jogo.
- Teste guiado de entrada XInput/DInput.

### Cinema

- Metadata mais robusta para filmes, series e documentarios.
- Legendas automaticas PT-BR/EN quando possivel.
- Melhor player interno para MKV e trilhas de audio.
- Organizacao visual estilo streaming por temporadas, continuacao e assistidos.

### Releases

- Assinatura Authenticode para reduzir alertas de seguranca.
- Manifesto de atualizacao com integridade SHA256.
- Pagina de release com changelog e links diretos.

## Stack

| Camada | Tecnologia |
| --- | --- |
| App | Electron 33 |
| UI | React 18, TypeScript, Tailwind, Framer Motion |
| Estado | Zustand |
| Persistencia | JSON local em `%APPDATA%` |
| Busca | Fuse.js |
| Build | electron-vite, electron-builder |
| Icones | lucide-react |

## Legal

GameHub e um launcher e organizador local. Ele nao distribui jogos comerciais, ROMs, BIOS ou midias protegidas. O usuario e responsavel pelos arquivos, contas e licencas que adicionar.

---

# English

GameHub is a local Windows hub for playing, watching and organizing your library. It combines a PC game launcher, emulator hub, cinema mode, artwork, saves, manual achievements, Discord Rich Presence and performance monitoring in a console-inspired interface.

## Quick Links

- [Downloads](#downloads-1)
- [Current Features](#current-features)
- [Performance Monitoring](#performance-monitoring)
- [Cinema Mode](#cinema-mode)
- [Development Setup](#development-setup)
- [Build And Release](#build-and-release)
- [Roadmap](#roadmap-1)

## Downloads

Public packages are published through GitHub Releases:

- [Download the latest version](https://github.com/recalchi/gamehub/releases/latest)
- [View all releases](https://github.com/recalchi/gamehub/releases)

Expected release files:

- `GameHub-Setup-x64-<version>.exe`: Windows installer.
- `GameHub-portable-x64-<version>.zip`: portable build.
- `latest.yml` and `releases.json`: update manifests.
- `.sha256`: verification hashes.

## Current Features

- PC game, ROM and media library scanning.
- Manual executable registration.
- Steam and Epic local import support.
- Artwork handling with local covers, bundled assets and visual fallbacks.
- Library filters by platform, status, tags, size and sorting.
- Native `.exe` launch without forcing Steam mode.
- Active-process tracking and safe termination.
- Reattach performance monitoring to an already running PC game.
- Big Picture/TV mode and controller navigation.
- Game details with setup, history, achievements/completed state and performance.
- Cinema library with movies, series, documentaries, watched tracking and backups.
- Discord Rich Presence integration.

## Performance Monitoring

GameHub can monitor a running game while you keep the details screen open on another monitor.

Current metrics:

- Process CPU.
- Game RAM and system RAM.
- NVIDIA GPU usage through `nvidia-smi`.
- Windows GPU counters as fallback.
- FPS through RTSS/MSI Afterburner shared memory.
- Final diagnostic report with suggestions.

### FPS With MSI Afterburner + RTSS

For PC games, GameHub reads `RTSSSharedMemoryV2`.

Steps:

1. Install MSI Afterburner with RivaTuner Statistics Server.
2. Keep RTSS running in the background.
3. Launch the game through GameHub.
4. Open **History > Performance** in the game details page.
5. If the game is already running, click **Reconnect monitor**.

Official link:

- [MSI Afterburner](https://us.msi.com/Landing/afterburner/graphics-cards)

## Cinema Mode

Cinema mode keeps movies, series and documentaries separate from the game library.

Features:

- Dedicated media folders.
- Folder artwork and metadata enrichment.
- Series grouped by seasons and episodes.
- Watched tracking stored independently from the source files.
- Watched-list backup.
- Favorites and progress.
- In-app playback when the internal player supports the media format.

## Development Setup

```powershell
git clone https://github.com/recalchi/gamehub.git
cd gamehub
npm install
npm run dev
```

Useful commands:

```powershell
npm run typecheck
npm run build
npm run build:win
```

## Build And Release

```powershell
npm run icon:generate
npm run build
npm run dist:win
npm run dist:win:portable
npm run dist:win:full
```

Publish:

```powershell
npm run publish:win
```

Or push a `v*` tag to trigger `.github/workflows/release-win.yml`.

## Roadmap

### Immediate MVP

- Fix existing web typecheck issues in `GameDetail`.
- Publish a new installer and portable ZIP after the monitoring fixes.
- Improve RTSS missing-state diagnostics.
- Add a first-run setup checklist for controller, Discord, library and cinema.

### Library And Metadata

- TheGamesDB and ScreenScraper fallback metadata, requiring API keys.
- Better folder-cover and normalized-title reconciliation.
- Local catalog with links, estimated size and owned/downloaded state.
- Optional SQLite migration for very large libraries.

### Performance

- Alternative FPS providers when RTSS is unavailable.
- Better AMD/Intel GPU support.
- Per-game performance history.
- Configurable CPU, RAM, VRAM and low-FPS alerts.

### Emulators And Controller

- Legal emulator download wizard.
- Per-emulator mapping through INI/YAML when supported.
- Per-controller and per-game profiles.
- Guided XInput/DInput testing.

### Cinema

- Stronger movie, series and documentary metadata.
- Automatic PT-BR/EN subtitles when possible.
- Better internal MKV/audio-track playback.
- Streaming-style season, continue-watching and watched layouts.

### Releases

- Authenticode signing.
- SHA256 integrity manifests.
- Release page with changelog and direct links.

## Legal

GameHub is a local launcher and organizer. It does not distribute commercial games, ROMs, BIOS files or protected media. Users are responsible for the files, accounts and licenses they add.
