import type { AchievementDefinition } from '@shared/types'
import type { AchievementCatalogEntry } from './index'

type AchievementCategory = NonNullable<AchievementDefinition['category']>
type AchievementTier = NonNullable<AchievementDefinition['tier']>
type AchievementSource = NonNullable<AchievementDefinition['source']>

function achievement(
  prefix: string,
  source: AchievementSource,
  slug: string,
  title: string,
  description: string,
  category: AchievementCategory,
  tier: AchievementTier = 'bronze'
): AchievementDefinition {
  return {
    id: `${prefix}:${slug}`,
    apiName: `${prefix}_${slug}`.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
    title,
    description,
    category,
    tier,
    source
  }
}

function gow2018(
  slug: string,
  title: string,
  description: string,
  category: AchievementCategory,
  tier: AchievementTier = 'bronze'
): AchievementDefinition {
  return achievement('gow2018', 'steam', slug, title, description, category, tier)
}

function gowClassic(
  slug: string,
  title: string,
  description: string,
  category: AchievementCategory,
  tier: AchievementTier = 'gamehub'
): AchievementDefinition {
  return achievement('gow1', 'gamehub', slug, title, description, category, tier)
}

function gow2Trophy(
  slug: string,
  title: string,
  description: string,
  category: AchievementCategory,
  tier: AchievementTier = 'bronze',
  source: AchievementSource = 'local'
): AchievementDefinition {
  return achievement('gow2', source, slug, title, description, category, tier)
}

function asGameHubGoal(item: AchievementDefinition): AchievementDefinition {
  return {
    ...item,
    id: item.id.replace(/^gow2:/, 'gow2ps2:'),
    apiName: item.apiName.replace(/^GOW2_/, 'GOW2PS2_'),
    source: 'gamehub',
    tier: item.tier === 'platinum' ? 'gamehub' : item.tier
  }
}

const GOD_OF_WAR_2018_ACHIEVEMENTS: AchievementDefinition[] = [
  gow2018('enchanted', 'Enchanted', 'Slot an Enchantment into your armor.', 'upgrade'),
  gow2018('the-journey-begins', 'The Journey Begins', 'Defend your home from The Stranger.', 'story'),
  gow2018('nice-moves', 'Nice Moves', 'Obtain a Runic Attack Gem.', 'upgrade'),
  gow2018('a-new-friend', 'A New Friend', 'Survive the Witch of the Woods and continue the journey.', 'story'),
  gow2018('dwarven-ingenuity', 'Dwarven Ingenuity', 'Upgrade a piece of armor.', 'upgrade'),
  gow2018('feels-like-home', 'Feels Like Home', 'Help the Light of Alfheim return.', 'story'),
  gow2018('best-dressed', 'Best Dressed', 'Craft an outfit for Atreus.', 'upgrade'),
  gow2018('dragon-slayer', 'Dragon Slayer', 'Defeat the Dragon of the Mountain.', 'boss', 'silver'),
  gow2018('troubling-consequences', 'Troubling Consequences', 'Defeat Magni and Modi.', 'boss', 'silver'),
  gow2018('hello-old-friend', 'Hello, Old Friend', 'Recover the Blades of Chaos.', 'story', 'silver'),
  gow2018('promise-fulfilled', 'Promise Fulfilled', 'Heal Atreus.', 'story', 'silver'),
  gow2018('round-2', 'Round 2', 'Rescue Atreus from Baldur.', 'boss', 'silver'),
  gow2018('past-haunts', 'Past Haunts', 'Ride the ship out of Helheim.', 'story', 'silver'),
  gow2018('the-best-moves', 'The Best Moves', 'Fully upgrade a Runic Attack.', 'upgrade'),
  gow2018('twilight-beckons', 'Twilight Beckons', 'Defeat Baldur for the final time.', 'boss', 'gold'),
  gow2018('last-wish', 'Last Wish', 'Scatter the ashes at the highest peak.', 'ending', 'gold'),
  gow2018('trilingual', 'Trilingual', 'Learn the languages of Muspelheim and Niflheim.', 'collection'),
  gow2018('all-will-fall', 'All Will Fall', 'Kill 1,000 enemies.', 'milestone'),
  gow2018('death-happened-here', 'Death Happened Here', 'Fully explore Veithurgard.', 'collection'),
  gow2018('idunns-orchard', "Idunn's Orchard", 'Fully upgrade your Health.', 'upgrade', 'silver'),
  gow2018('like-oil-and-water', 'Like Oil and Water', "Complete all of Brok and Sindri's Favors.", 'collection', 'silver'),
  gow2018('quick-tempered', 'Quick Tempered', 'Fully upgrade your rage.', 'upgrade', 'silver'),
  gow2018('beneath-the-surface', 'Beneath the Surface', 'Explore all the Lake of Nine has to offer.', 'collection'),
  gow2018('why-fight-it', 'Why Fight It?', 'Fully upgrade the Blades of Chaos.', 'upgrade', 'silver'),
  gow2018('unfinished-business', 'Unfinished Business', 'Assist all of the wayward spirits.', 'collection'),
  gow2018('dangerous-skies', 'Dangerous Skies', 'Free all of the Dragons.', 'collection', 'silver'),
  gow2018('worthy', 'Worthy', 'Fully upgrade the Leviathan Axe.', 'upgrade', 'silver'),
  gow2018('chooser-of-the-slain', 'Chooser of the Slain', 'Defeat the nine Valkyries.', 'boss', 'gold'),
  gow2018('path-of-the-zealot', 'Path of the Zealot', 'Obtain Traveler armor set.', 'collection'),
  gow2018('fire-and-brimstone', 'Fire and Brimstone', 'Complete all of the Trials of Muspelheim.', 'collection', 'gold'),
  gow2018('the-truth', 'The Truth', 'Read all of the Jotnar shrines.', 'collection'),
  gow2018('primordial', 'Primordial', 'Obtain Ancient armor set.', 'collection'),
  gow2018('darkness-and-fog', 'Darkness and Fog', "Retrieve all treasure from the Workshop's center chamber.", 'collection', 'gold'),
  gow2018('allfather-blinded', 'Allfather Blinded', "Kill all of Odin's Ravens.", 'collection', 'gold'),
  gow2018('treasure-hunter', 'Treasure Hunter', 'Use treasure maps to find all of the dig spots.', 'collection', 'silver'),
  gow2018('curator', 'Curator', 'Collect all of the Artifacts.', 'collection', 'silver'),
  gow2018('father-and-son', 'Father and Son', 'Obtain all other achievements.', 'milestone', 'platinum')
]

const GOD_OF_WAR_PS2_GOALS: AchievementDefinition[] = [
  gowClassic('hydra-slayer', 'Hydra Slayer', 'Derrote a Hydra e conclua a abertura no Mar Egeu.', 'boss'),
  gowClassic('oracle-rescued', 'Oracle Rescued', 'Salve a Oracle e avance para o Templo de Pandora.', 'story'),
  gowClassic('pandoras-box', "Pandora's Box", 'Encontre a caixa de Pandora.', 'story'),
  gowClassic('ares-felled', 'God Killer', 'Derrote Ares e finalize a historia principal.', 'ending'),
  gowClassic('challenge-of-the-gods', 'Challenge of the Gods', 'Conclua todos os desafios opcionais.', 'milestone'),
  gowClassic('red-orb-route', 'Seeing Red', 'Monte uma rota pessoal para maximizar upgrades com red orbs.', 'upgrade'),
  gowClassic('gorgon-eyes', 'Olhos de Gorgon', 'Complete a busca pessoal pelos upgrades de vida.', 'collection'),
  gowClassic('phoenix-feathers', 'Penas de Fenix', 'Complete a busca pessoal pelos upgrades de magia.', 'collection'),
  gowClassic('god-mode', 'Prepare to be a God', 'Finalize uma run em dificuldade alta.', 'milestone'),
  gowClassic('speedrun', 'Speed of Jason McDonald', 'Registre uma run rapida pessoal.', 'milestone'),
  gowClassic('save-backed', 'Backup do Olimpo', 'Crie um backup de save depois de zerar.', 'milestone'),
  {
    ...gowClassic('gamehub-platinum-run', 'GameHub: Platinado classico', 'Checklist para marcar historia, desafios, upgrades e backup final do save.', 'milestone'),
    checklistTotal: 11
  }
]

const GOD_OF_WAR_II_TROPHIES: AchievementDefinition[] = [
  gow2Trophy('breaking-wind', 'Breaking Wind', "Acquire Typhon's Bane.", 'story'),
  gow2Trophy('big-tuff-buff-and-rough', 'Big, Tuff, Buff and Rough', 'Acquire Rage of the Titans.', 'story'),
  gow2Trophy('blue-balls', 'Blue Balls', "Acquire Cronos' Rage.", 'story'),
  gow2Trophy('shiner', 'Shiner', 'Acquire the Golden Fleece.', 'story'),
  gow2Trophy('rock-their-world', 'Rock their World', 'Acquire the Head of Euryale.', 'boss'),
  gow2Trophy('learning-to-fly', 'Learning to Fly', 'Acquire the Icarus Wings.', 'story'),
  gow2Trophy('shaky-ground', 'Shaky Ground', "Acquire Atlas' Quake.", 'story'),
  gow2Trophy('death-from-above-2009', 'Death from Above 2009', 'Defeat the Dark Rider for the first time.', 'boss'),
  gow2Trophy('resurrection', 'Resurrection', 'Climb from the pit of Hades.', 'story'),
  gow2Trophy('rock-hard', 'Rock Hard', 'Defeat the Titan Minotaur inside Atlas.', 'boss'),
  gow2Trophy('pickn-on-the-little-guy', "Pick'n on the Little Guy", 'Win the battle outside the Palace of the Fates.', 'boss'),
  gow2Trophy('hot-plate', 'Watcha Got on the Hot Plate?', 'Solve the Phoenix Chamber.', 'story'),
  gow2Trophy('whip-it-good', 'Whip it Good', 'Whip the Steeds of Time.', 'story'),
  gow2Trophy('lift-with-your-knees', 'Lift with Your Knees', 'Topple the Temple in the Bog of the Forgotten.', 'story'),
  gow2Trophy('swinger', 'Swinger', 'Cross the collapsing Grapple Bridge.', 'story'),
  gow2Trophy('stoner', 'Stoner', 'Stone and shatter enemies with Euryale.', 'boss'),
  gow2Trophy('super-sized', 'Super Sized', 'Get a 500-hit combo.', 'milestone', 'silver'),
  gow2Trophy('hitting-your-stride', 'Hitting Your Stride', 'Power up any item.', 'upgrade', 'silver'),
  gow2Trophy('eye-cant-believe-it', "Eye Can't Believe It", 'Collect all Gorgon Eyes.', 'collection', 'silver'),
  gow2Trophy('go-make-a-pillow', 'Go Make a Pillow!', 'Collect all Phoenix Feathers.', 'collection', 'silver'),
  gow2Trophy('eye-sore', 'Eye Sore', 'Collect 20 Cyclops Eyes.', 'collection', 'silver'),
  gow2Trophy('boss-batch-1', 'Boss Batch 1', 'Defeat the Colossus, Theseus and the Barbarian King.', 'boss', 'silver'),
  gow2Trophy('boss-batch-2', 'Boss Batch 2', 'Defeat Euryale and Perseus.', 'boss', 'silver'),
  gow2Trophy('boss-batch-3', 'Boss Batch 3', 'Defeat the Kraken and all three Sisters of Fate.', 'boss', 'silver'),
  gow2Trophy('daddy-issues', 'Daddy Issues', 'Defeat Zeus.', 'ending', 'gold'),
  gow2Trophy('rise-and-shine', 'Rise and SHINE', 'Awaken the Phoenix.', 'story', 'silver'),
  gow2Trophy('spread-em', "Spread 'Em", 'Open the wings of the Temple of the Fates.', 'story', 'silver'),
  gow2Trophy('shine-king', 'Shine King', 'Open the door to the Temple of Euryale.', 'story', 'silver'),
  gow2Trophy('blowin-your-wad', "Blowin' Your Wad", 'Max out all weapons and magic.', 'upgrade', 'gold'),
  gow2Trophy('the-end-begins', 'The End Begins', 'Finish God of War II.', 'ending', 'gold'),
  gow2Trophy('15-min-fight-scene', '15 Min Fight Scene', 'Battle your way to the Loom Chamber.', 'milestone', 'gold'),
  gow2Trophy('bleeding-thumbs', 'Bleeding Thumbs', 'Beat the Challenge of the Titans.', 'milestone', 'gold'),
  gow2Trophy('feel-the-urn', 'Feel the Urn', 'Collect and use at least two Urns of Power.', 'collection', 'silver'),
  gow2Trophy('germans-good-stuff', 'You Know the Germans Make Good Stuff...', 'Collect all Uber Chests.', 'collection', 'gold'),
  gow2Trophy('trophy-of-gaia', 'Trophy of Gaia', 'Unlock all God of War II trophies.', 'milestone', 'platinum')
]

const GOD_OF_WAR_II_PS2_GOALS: AchievementDefinition[] = [
  ...GOD_OF_WAR_II_TROPHIES.map(asGameHubGoal),
  {
    ...achievement(
      'gow2',
      'gamehub',
      'gamehub-ps2-platinum-run',
      'GameHub: Platinado PS2',
      'Checklist pessoal para fechar historia, bosses, coletaveis, desafios e backup do save no PS2.',
      'milestone',
      'gamehub'
    ),
    checklistTotal: 35
  }
]

export const GOD_OF_WAR_CATALOG_ENTRIES: AchievementCatalogEntry[] = [
  {
    id: 'god-of-war-ps2',
    matchers: {
      titles: ['god of war'],
      exe: []
    },
    platforms: ['ps2'],
    sourceLabel: 'GameHub roadmap · God of War',
    sourceUrl: 'https://retroachievements.org/',
    achievements: GOD_OF_WAR_PS2_GOALS
  },
  {
    id: 'god-of-war-ii-ps2',
    matchers: {
      titles: ['god of war ii', 'god of war 2'],
      exe: []
    },
    platforms: ['ps2'],
    sourceLabel: 'GameHub roadmap · God of War II',
    sourceUrl: 'https://psnprofiles.com/trophies/242-god-of-war-ii',
    achievements: GOD_OF_WAR_II_PS2_GOALS
  },
  {
    id: 'god-of-war-ii-hd',
    matchers: {
      titles: ['god of war ii hd', 'god of war 2 hd'],
      exe: []
    },
    platforms: ['ps3'],
    sourceLabel: 'PS3 trophy roadmap · God of War II HD',
    sourceUrl: 'https://psnprofiles.com/trophies/242-god-of-war-ii',
    achievements: GOD_OF_WAR_II_TROPHIES
  },
  {
    id: 'god-of-war-2018',
    matchers: {
      titles: ['god of war', 'god of war 2018', 'gow'],
      steamAppId: '1593500',
      exe: ['gow.exe']
    },
    platforms: ['pc'],
    sourceLabel: 'Steam · God of War',
    sourceUrl: 'https://steamcommunity.com/stats/1593500/achievements/',
    achievements: GOD_OF_WAR_2018_ACHIEVEMENTS
  }
]
