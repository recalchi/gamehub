import type { PlatformId } from './types'

/**
 * Curated catalog of legal free / open-source / public-domain games.
 *
 * Inclusion rules:
 *   - License must allow free redistribution (CC0, public domain, MIT, GPL,
 *     "freeware" with explicit author permission, etc.)
 *   - URL must be a stable direct download (GitHub release asset, archive.org,
 *     project site). We never link to suspicious mirrors.
 *   - No commercial ROMs ever, even abandonware.
 *
 * The user can supplement this with their own URLs via the "Add Game" modal
 * "Baixar de URL" tab — this catalog is just convenience curation.
 */

export interface CuratedEntry {
  id: string
  title: string
  platform: PlatformId
  /** Direct-download URL */
  url: string
  /** Plain English license note (CC0, MIT, etc.) */
  license: string
  /** One-liner about the game */
  description: string
  /** Optional homepage to learn more (opens in external browser) */
  homepage?: string
  /** Optional cover URL (we'll cache it like libretro covers) */
  cover?: string
  /** SHA256 of the downloaded file — set when we have a way to verify */
  sha256?: string
  /** Approximate size in MB, for UX before download starts */
  approxSizeMb?: number
  /** Optional curated mod links shown when this game is installed. */
  mods?: CuratedModLink[]
}

export interface CuratedModLink {
  source: 'nexusmods' | 'modrinth' | 'github' | 'official' | 'other'
  url: string
  title: string
  description?: string
}

/**
 * Standalone mod recommendations matched by normalized title rather than by
 * curated-entry id. Lets us surface mods for games the user installed outside
 * the curated catalog (Steam, manual install, etc.).
 */
export const MOD_RECOMMENDATIONS: Record<string, CuratedModLink[]> = {
  'elden ring': [
    {
      source: 'nexusmods',
      url: 'https://www.nexusmods.com/eldenring/mods/510',
      title: 'Seamless Co-op',
      description: 'Co-op completo sem invasões; o mod mais popular de Elden Ring.'
    },
    {
      source: 'nexusmods',
      url: 'https://www.nexusmods.com/eldenring/mods/3419',
      title: 'The Convergence',
      description: 'Overhaul gigante: classes novas, magias e itens.'
    }
  ],
  'skyrim': [
    {
      source: 'nexusmods',
      url: 'https://www.nexusmods.com/skyrimspecialedition/mods/266',
      title: 'SKSE64 / Address Library',
      description: 'Base para qualquer setup de mods em Skyrim SE.'
    },
    {
      source: 'nexusmods',
      url: 'https://www.nexusmods.com/skyrimspecialedition/mods/30',
      title: 'Unofficial Skyrim Special Edition Patch',
      description: 'Pacote essencial de correções de bugs.'
    }
  ],
  'minecraft': [
    {
      source: 'modrinth',
      url: 'https://modrinth.com/mod/sodium',
      title: 'Sodium',
      description: 'Otimização de renderização — performance massiva.'
    },
    {
      source: 'modrinth',
      url: 'https://modrinth.com/mod/iris',
      title: 'Iris Shaders',
      description: 'Suporte a shaders compatível com Sodium.'
    }
  ],
  'the witcher 3 wild hunt': [
    {
      source: 'nexusmods',
      url: 'https://www.nexusmods.com/witcher3/mods/1021',
      title: 'HD Reworked Project',
      description: 'Texturas em alta resolução, otimizado.'
    }
  ],
  'cyberpunk 2077': [
    {
      source: 'nexusmods',
      url: 'https://www.nexusmods.com/cyberpunk2077/mods/107',
      title: 'CyberEngineTweaks',
      description: 'Console + framework para tweaks/scripts.'
    }
  ]
}

export const CURATED_CATALOG: CuratedEntry[] = [
  // ----- PC -----
  {
    id: 'anarch-pc',
    title: 'Anarch',
    platform: 'pc',
    url: 'https://gitlab.com/drummyfish/anarch/-/raw/master/bin/Anarch_winshitxp_sdl_1-01.zip?inline=false',
    license: 'CC0 / Public Domain',
    description:
      'Doom-like FPS pequeno e portável, criado por drummyfish. Renderiza por software, roda em qualquer hardware.',
    homepage: 'https://drummyfish.gitlab.io/anarch/',
    cover: 'https://gitlab.com/drummyfish/anarch/-/raw/master/media/logo_big.png',
    approxSizeMb: 1
  },

  // Daniel Remar's freeware classics — distribuídos gratuitamente no site
  // oficial (remargames.se) desde 2008, ZIPs estáveis hospedados pelo autor.
  {
    id: 'hero-core-pc',
    title: 'Hero Core',
    platform: 'pc',
    url: 'https://www.remargames.se/games/herocore.zip',
    license: 'Freeware (Daniel Remar)',
    description:
      'Aventura de ação retro em preto-e-branco com chefes desafiadores e exploração não-linear. Sequência espiritual de Hero.',
    homepage: 'https://www.remargames.se/herocore.php',
    cover: 'https://www.remargames.se/siteimg/gameicon_herocore.gif',
    approxSizeMb: 7
  },
  {
    id: 'strawberry-pc',
    title: 'Strawberry',
    platform: 'pc',
    url: 'https://www.remargames.se/games/strawberry.zip',
    license: 'Freeware (Daniel Remar)',
    description:
      'Plataforma 2D charmoso onde você guia um morango pelo mundo coletando itens e resolvendo puzzles ambientais.',
    homepage: 'https://www.remargames.se/strawberry.php',
    cover: 'https://www.remargames.se/siteimg/gameicon_strawberry.gif',
    approxSizeMb: 18
  },
  {
    id: 'remedy-pc',
    title: 'Remedy',
    platform: 'pc',
    url: 'https://www.remargames.se/games/remedy.zip',
    license: 'Freeware (Daniel Remar)',
    description:
      'Aventura de exploração com narrativa sutil, num mundo de pequenas surpresas. Estilo pixel art delicado.',
    homepage: 'https://www.remargames.se/remedy.php',
    cover: 'https://www.remargames.se/siteimg/gameicon_remedy.gif',
    approxSizeMb: 21
  },
  {
    id: 'pitch-pc',
    title: 'Pitch',
    platform: 'pc',
    url: 'https://www.remargames.se/games/pitch.zip',
    license: 'Freeware (Daniel Remar)',
    description:
      'Aventura experimental com mecânicas únicas. Trilha sonora marcante. Recente — 37MB de conteúdo.',
    homepage: 'https://www.remargames.se/pitch.php',
    cover: 'https://www.remargames.se/siteimg/gameicon_pitch.gif',
    approxSizeMb: 37
  },

  // ----- PC extras -----
  {
    id: 'iji-pc',
    title: 'Iji',
    platform: 'pc',
    url: 'https://www.remargames.se/games/iji.zip',
    license: 'Freeware (Daniel Remar)',
    description:
      'Action-platformer grande e cult, com escolhas de combate, upgrades e uma campanha cheia de segredos.',
    homepage: 'https://www.remargames.se/iji.php',
    cover: 'https://www.remargames.se/siteimg/gameicon_iji.gif',
    approxSizeMb: 45
  },
  {
    id: 'garden-gnome-carnage-pc',
    title: 'Garden Gnome Carnage',
    platform: 'pc',
    url: 'https://www.remargames.se/games/ggc.zip',
    license: 'Freeware (Daniel Remar)',
    description:
      'Arcade caotico e absurdo: um gnomo pendurado em um predio defendendo o natal com tijolos e reflexo.',
    homepage: 'https://www.remargames.se/ggc.php',
    cover: 'https://www.remargames.se/siteimg/gameicon_ggc.gif',
    approxSizeMb: 9
  },
  {
    id: 'castle-of-elite-pc',
    title: 'Castle of Elite',
    platform: 'pc',
    url: 'https://www.remargames.se/games/castle.zip',
    license: 'Freeware (Daniel Remar)',
    description:
      'Puzzle-platformer de tela unica com foco em timing, chaves, armadilhas e editor de fases.',
    homepage: 'https://www.remargames.se/castle.php',
    cover: 'https://www.remargames.se/siteimg/gameicon_castle.gif',
    approxSizeMb: 6
  },
  {
    id: 'retrobattle-pc',
    title: 'Retrobattle',
    platform: 'pc',
    url: 'https://www.remargames.se/games/retrobattle.zip',
    license: 'Freeware (Daniel Remar)',
    description:
      'Plataforma arcade com energia de fliperama, inimigos em ondas e pontuacao para tentar melhorar run apos run.',
    homepage: 'https://www.remargames.se/retrobattle.php',
    cover: 'https://www.remargames.se/siteimg/gameicon_retrobattle.gif',
    approxSizeMb: 6
  },
  {
    id: 'hero-pc',
    title: 'Hero',
    platform: 'pc',
    url: 'https://www.remargames.se/games/hero.zip',
    license: 'Freeware (Daniel Remar)',
    description:
      'Shooter retro por fases, direto ao ponto, com chefes e leitura de padroes no estilo dos classicos 8-bit.',
    homepage: 'https://www.remargames.se/hero.php',
    cover: 'https://www.remargames.se/siteimg/gameicon_hero.gif',
    approxSizeMb: 5
  },
  {
    id: 'teeworlds-pc',
    title: 'Teeworlds',
    platform: 'pc',
    url: 'https://downloads.teeworlds.com/teeworlds-0.7.5-win64.zip',
    license: 'BSD-style / zlib',
    description:
      'Multiplayer 2D rapido com gancho, armas simples e partidas curtas. Otimo para testar controle e teclado.',
    homepage: 'https://www.teeworlds.com/',
    cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/380840/library_600x900.jpg',
    approxSizeMb: 10
  },
  {
    id: 'the-powder-toy-pc',
    title: 'The Powder Toy',
    platform: 'pc',
    url: 'https://github.com/ThePowderToy/The-Powder-Toy/releases/download/v99.5.394/powder-v99.5.394%2Bsteam-x86_64-windows-msvc.exe',
    license: 'GPLv3',
    description:
      'Sandbox de fisica e particulas: fogo, agua, pressao, circuitos e simulacoes em tempo real.',
    homepage: 'https://powdertoy.co.uk/',
    cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/439880/library_600x900.jpg',
    approxSizeMb: 7
  },
  {
    id: 'openhv-pc',
    title: 'OpenHV',
    platform: 'pc',
    url: 'https://github.com/OpenHV/OpenHV/releases/download/20250725/OpenHV-20250725-x64-winportable.zip',
    license: 'GPLv3 / open source',
    description:
      'RTS sci-fi standalone inspirado na escola classica: bases, unidades, coleta de recursos e escaramucas.',
    homepage: 'https://www.openhv.net/',
    cover: 'https://www.openhv.net/images/icon.png',
    approxSizeMb: 145
  },
  {
    id: 'endless-sky-pc',
    title: 'Endless Sky',
    platform: 'pc',
    url: 'https://github.com/endless-sky/endless-sky/releases/download/v0.10.16/EndlessSky-win64-v0.10.16.zip',
    license: 'GPLv3 / CC-BY-SA assets',
    description:
      'RPG espacial open-source com comercio, missoes, frota, combate e exploracao em galaxia aberta.',
    homepage: 'https://endless-sky.github.io/',
    cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/404410/library_600x900.jpg',
    approxSizeMb: 351
  },
  {
    id: 'supertux-pc',
    title: 'SuperTux',
    platform: 'pc',
    url: 'https://github.com/SuperTux/supertux/releases/download/v0.7.0/SuperTux-v0.7.0-win64-portable.zip',
    license: 'GPLv3 / CC-BY-SA assets',
    description:
      'Plataforma 2D classico, polido e grande, com fases, mundo de gelo, inimigos e suporte a controles.',
    homepage: 'https://www.supertux.org/',
    cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1572920/library_600x900.jpg',
    approxSizeMb: 294
  },

  // ----- NES (homebrew freeware do Shiru - classicos, redistribuicao livre) -----
  // Capas em /pic/<name>.png.
  {
    id: 'alter-ego-nes',
    title: 'Alter Ego',
    platform: 'nes',
    url: 'https://shiru.untergrund.net/files/nes/alter_ego.zip',
    license: 'Freeware (Shiru, redistribuição livre)',
    description:
      'Puzzle-platformer onde você controla dois personagens espelhados simultaneamente. Um dos homebrews NES mais polidos já feitos.',
    homepage: 'https://shiru.untergrund.net/software.shtml',
    cover: 'https://shiru.untergrund.net/pic/alter_ego.png',
    approxSizeMb: 1
  },
  {
    id: 'lawn-mower-nes',
    title: 'Lawn Mower',
    platform: 'nes',
    url: 'https://shiru.untergrund.net/files/nes/lawn_mower.zip',
    license: 'Freeware (Shiru, redistribuição livre)',
    description:
      'Corte a grama em todos os jardins evitando obstáculos. Homebrew clássico para NES.',
    homepage: 'https://shiru.untergrund.net/software.shtml',
    cover: 'https://shiru.untergrund.net/pic/lawn_mower.png',
    approxSizeMb: 1
  },
  {
    id: 'lan-master-nes',
    title: 'LAN Master',
    platform: 'nes',
    url: 'https://shiru.untergrund.net/files/nes/lan_master.zip',
    license: 'Freeware (Shiru, redistribuição livre)',
    description:
      'Puzzle de conexão de rede no estilo Pipe Mania, mas todinho em 8-bit. Reflexo e lógica.',
    homepage: 'https://shiru.untergrund.net/software.shtml',
    cover: 'https://shiru.untergrund.net/pic/lan_master.png',
    approxSizeMb: 1
  },
  {
    id: 'zooming-secretary-nes',
    title: 'Zooming Secretary',
    platform: 'nes',
    url: 'https://shiru.untergrund.net/files/nes/zooming_secretary.zip',
    license: 'Freeware (Shiru, redistribuição livre)',
    description:
      'Action-puzzle onde uma secretária entrega documentos no escritório. Ritmo crescente.',
    homepage: 'https://shiru.untergrund.net/software.shtml',
    cover: 'https://shiru.untergrund.net/pic/zooming_secretary.png',
    approxSizeMb: 1
  },
  {
    id: 'chase-nes',
    title: 'Chase',
    platform: 'nes',
    url: 'https://shiru.untergrund.net/files/nes/chase.zip',
    license: 'Freeware (Shiru, redistribuição livre)',
    description: 'Mini-jogo arcade de perseguição. Curto, polido, viciante.',
    homepage: 'https://shiru.untergrund.net/software.shtml',
    cover: 'https://shiru.untergrund.net/pic/chase.png',
    approxSizeMb: 1
  },

  // ----- SNES -----
  {
    id: 'christmas-craze-snes',
    title: 'Christmas Craze',
    platform: 'snes',
    url: 'https://shiru.untergrund.net/files/snes/christmas_craze.zip',
    license: 'Freeware (Shiru, redistribuição livre)',
    description:
      'Plataforma natalino para SNES com gráficos detalhados em 16-bit. Action arcade festivo.',
    homepage: 'https://shiru.untergrund.net/software.shtml',
    cover: 'https://shiru.untergrund.net/pic/christmas_craze.png',
    approxSizeMb: 1
  },

  // ----- Test fixture -----
  {
    id: 'tinyfugue-readme',
    title: 'GameHub Demo Readme',
    platform: 'pc',
    url: 'https://raw.githubusercontent.com/octocat/Hello-World/master/README',
    license: 'Test fixture',
    description:
      'Entrada de teste — baixa um arquivo de 13 bytes do repositório octocat/Hello-World do GitHub. Útil para validar a infraestrutura de download.',
    approxSizeMb: 1
  }
  // Add more entries here. Keep the catalog short — the goal is a polished
  // showcase, not a comprehensive index.
]
