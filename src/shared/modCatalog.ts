import type { ModCatalogEntry, ModProjectType } from './types'

export interface ModSeed {
  id: string
  slug: string
  title: string
  projectType: ModProjectType
  category: string
  rank: number
  description: string
  featured?: boolean
  preferredLoaders?: string[]
}

export const MINECRAFT_VERSION_OPTIONS = [
  'auto',
  '1.21.10',
  '1.21.8',
  '1.21.5',
  '1.21.1',
  '1.20.1',
  '1.19.2',
  '1.18.2'
]

export const MINECRAFT_MOD_SEEDS: ModSeed[] = [
  {
    id: 'mc-sodium',
    slug: 'sodium',
    title: 'Sodium',
    projectType: 'mod',
    category: 'Performance',
    rank: 1,
    featured: true,
    preferredLoaders: ['fabric', 'neoforge', 'quilt'],
    description: 'Renderizador moderno para FPS alto e menor stutter.'
  },
  {
    id: 'mc-iris',
    slug: 'iris',
    title: 'Iris Shaders',
    projectType: 'mod',
    category: 'Visual',
    rank: 2,
    featured: true,
    preferredLoaders: ['fabric', 'neoforge', 'quilt'],
    description: 'Suporte a shaders com compatibilidade forte com Sodium.'
  },
  {
    id: 'mc-fabric-api',
    slug: 'fabric-api',
    title: 'Fabric API',
    projectType: 'mod',
    category: 'Base / dependencias',
    rank: 3,
    preferredLoaders: ['fabric'],
    description: 'Biblioteca base exigida por muitos mods Fabric.'
  },
  {
    id: 'mc-lithium',
    slug: 'lithium',
    title: 'Lithium',
    projectType: 'mod',
    category: 'Performance',
    rank: 4,
    preferredLoaders: ['fabric', 'neoforge', 'quilt'],
    description: 'Otimiza fisica, mobs e logica do jogo sem mudar gameplay.'
  },
  {
    id: 'mc-entity-culling',
    slug: 'entityculling',
    title: 'Entity Culling',
    projectType: 'mod',
    category: 'Performance',
    rank: 5,
    preferredLoaders: ['fabric', 'forge', 'neoforge', 'quilt'],
    description: 'Nao renderiza entidades escondidas atras de blocos.'
  },
  {
    id: 'mc-ferrite-core',
    slug: 'ferrite-core',
    title: 'FerriteCore',
    projectType: 'mod',
    category: 'Performance',
    rank: 6,
    preferredLoaders: ['fabric', 'forge', 'neoforge', 'quilt'],
    description: 'Reduz uso de memoria, especialmente em modpacks.'
  },
  {
    id: 'mc-immediatelyfast',
    slug: 'immediatelyfast',
    title: 'ImmediatelyFast',
    projectType: 'mod',
    category: 'Performance',
    rank: 7,
    preferredLoaders: ['fabric', 'forge', 'neoforge', 'quilt'],
    description: 'Melhora renderizacao de HUD, entidades e buffers.'
  },
  {
    id: 'mc-modmenu',
    slug: 'modmenu',
    title: 'Mod Menu',
    projectType: 'mod',
    category: 'Interface',
    rank: 8,
    preferredLoaders: ['fabric', 'quilt'],
    description: 'Lista e configura mods instalados dentro do Minecraft.'
  },
  {
    id: 'mc-xaeros-minimap',
    slug: 'xaeros-minimap',
    title: "Xaero's Minimap",
    projectType: 'mod',
    category: 'Mapa / UX',
    rank: 9,
    preferredLoaders: ['fabric', 'forge', 'neoforge', 'quilt'],
    description: 'Minimapa leve, waypoints e navegacao no mundo.'
  },
  {
    id: 'mc-journeymap',
    slug: 'journeymap',
    title: 'JourneyMap',
    projectType: 'mod',
    category: 'Mapa / UX',
    rank: 10,
    preferredLoaders: ['fabric', 'forge', 'neoforge'],
    description: 'Mapa completo em tempo real com marcadores e web map.'
  },
  {
    id: 'mc-appleskin',
    slug: 'appleskin',
    title: 'AppleSkin',
    projectType: 'mod',
    category: 'Interface',
    rank: 11,
    preferredLoaders: ['fabric', 'forge', 'neoforge', 'quilt'],
    description: 'Mostra saturacao, fome e efeito real dos alimentos.'
  },
  {
    id: 'mc-jade',
    slug: 'jade',
    title: 'Jade',
    projectType: 'mod',
    category: 'Interface',
    rank: 12,
    preferredLoaders: ['fabric', 'forge', 'neoforge', 'quilt'],
    description: 'Overlay para identificar bloco, entidade e informacoes uteis.'
  },
  {
    id: 'mc-distant-horizons',
    slug: 'distanthorizons',
    title: 'Distant Horizons',
    projectType: 'mod',
    category: 'Visual',
    rank: 13,
    preferredLoaders: ['fabric', 'forge', 'neoforge'],
    description: 'Renderiza distancia enorme com LOD para mundos mais imersivos.'
  },
  {
    id: 'mc-terralith',
    slug: 'terralith',
    title: 'Terralith',
    projectType: 'mod',
    category: 'Mundo',
    rank: 14,
    preferredLoaders: ['fabric', 'forge', 'neoforge'],
    description: 'Expande biomas e geracao de mundo sem depender de assets pesados.'
  },
  {
    id: 'mc-complementary-reimagined',
    slug: 'complementary-reimagined',
    title: 'Complementary Shaders - Reimagined',
    projectType: 'shader',
    category: 'Shaders',
    rank: 15,
    preferredLoaders: ['iris'],
    description: 'Shaderpack popular, equilibrado e bonito para usar com Iris.'
  },
  {
    id: 'mc-fabulously-optimized',
    slug: 'fabulously-optimized',
    title: 'Fabulously Optimized',
    projectType: 'modpack',
    category: 'Modpack',
    rank: 16,
    preferredLoaders: ['fabric'],
    description: 'Modpack focado em performance, qualidade de vida e compatibilidade.'
  }
]

export function fallbackModCatalog(): ModCatalogEntry[] {
  return MINECRAFT_MOD_SEEDS.map((seed) => ({
    id: seed.id,
    title: seed.title,
    slug: seed.slug,
    game: 'minecraft',
    gameTitle: 'Minecraft',
    projectType: seed.projectType,
    category: seed.category,
    rank: seed.rank,
    description: seed.description,
    source: 'modrinth',
    sourceUrl: `https://modrinth.com/${seed.projectType}/${seed.slug}`,
    loaders: seed.preferredLoaders ?? [],
    gameVersions: [],
    featured: seed.featured
  }))
}
