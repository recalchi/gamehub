/**
 * Static, bundled achievement catalog for popular PC titles.
 *
 * Each entry describes a game by matchers (titles, steamAppId, exe) and a
 * list of achievement definitions. The resolver in `local-catalog.ts` picks
 * an entry by matching the game's title/path against matchers.
 *
 * Keep entries small (<50KB) and add new games as JSON files imported here.
 * Real achievement icons/IDs should come from the official source where
 * possible — we cite the source in the entry so anyone can verify.
 */
import type { AchievementDefinition, PlatformId } from '@shared/types'
import { GOD_OF_WAR_CATALOG_ENTRIES } from './god-of-war'
import { DEMON_SLAYER_CATALOG_ENTRIES } from './demon-slayer'

export interface AchievementCatalogEntry {
  id: string
  matchers: {
    titles: string[]
    steamAppId?: string
    exe?: string[]
    pathIncludes?: string[]
  }
  platforms: PlatformId[]
  achievements: AchievementDefinition[]
  sourceLabel: string
  sourceUrl?: string
}

type AchievementCategory = NonNullable<AchievementDefinition['category']>
type AchievementTier = NonNullable<AchievementDefinition['tier']>

function erAchievement(
  slug: string,
  title: string,
  description: string,
  category: AchievementCategory,
  tier: AchievementTier = 'bronze'
): AchievementDefinition {
  return {
    id: `er:${slug}`,
    apiName: slug.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
    title,
    description,
    category,
    tier,
    source: 'steam'
  }
}

const ELDEN_RING_ACHIEVEMENTS: AchievementDefinition[] = [
  erAchievement('roundtable-hold', 'Roundtable Hold', 'Chegou a Roundtable Hold.', 'story'),
  erAchievement('margit-the-fell-omen', 'Margit, the Fell Omen', 'Derrotou Margit, the Fell Omen.', 'boss'),
  erAchievement('shardbearer-godrick', 'Shardbearer Godrick', 'Derrotou Shardbearer Godrick.', 'boss', 'silver'),
  erAchievement('great-rune', 'Great Rune', 'Restaurou o poder de uma Great Rune.', 'story'),
  erAchievement('red-wolf-of-radagon', 'Red Wolf of Radagon', 'Derrotou Red Wolf of Radagon.', 'boss'),
  erAchievement('rennala-queen-of-the-full-moon', 'Rennala, Queen of the Full Moon', 'Derrotou Rennala, Queen of the Full Moon.', 'boss', 'silver'),
  erAchievement('leonine-misbegotten', 'Leonine Misbegotten', 'Derrotou Leonine Misbegotten.', 'boss'),
  erAchievement('royal-knight-loretta', 'Royal Knight Loretta', 'Derrotou Royal Knight Loretta.', 'boss'),
  erAchievement('shardbearer-radahn', 'Shardbearer Radahn', 'Derrotou Shardbearer Radahn.', 'boss', 'silver'),
  erAchievement('mimic-tear', 'Mimic Tear', 'Derrotou Mimic Tear.', 'boss'),
  erAchievement('godfrey-first-elden-lord', 'Godfrey, First Elden Lord', 'Derrotou Godfrey, First Elden Lord.', 'boss', 'silver'),
  erAchievement('shardbearer-morgott', 'Shardbearer Morgott', 'Derrotou Shardbearer Morgott.', 'boss', 'silver'),
  erAchievement('magma-wyrm-makar', 'Magma Wyrm Makar', 'Derrotou Magma Wyrm Makar.', 'boss'),
  erAchievement('god-slaying-armament', 'God-Slaying Armament', 'Melhorou qualquer armamento ate o estagio maximo.', 'upgrade', 'silver'),
  erAchievement('fire-giant', 'Fire Giant', 'Derrotou Fire Giant.', 'boss', 'silver'),
  erAchievement('erdtree-aflame', 'Erdtree Aflame', 'Usou kindling para incendiar a Erdtree.', 'story', 'silver'),
  erAchievement('commander-niall', 'Commander Niall', 'Derrotou Commander Niall.', 'boss'),
  erAchievement('shardbearer-rykard', 'Shardbearer Rykard', 'Derrotou Shardbearer Rykard.', 'boss', 'silver'),
  erAchievement('astel-naturalborn-of-the-void', 'Astel, Naturalborn of the Void', 'Derrotou Astel, Naturalborn of the Void.', 'boss'),
  erAchievement('godskin-duo', 'Godskin Duo', 'Derrotou Godskin Duo.', 'boss', 'silver'),
  erAchievement('godskin-noble', 'Godskin Noble', 'Derrotou Godskin Noble.', 'boss'),
  erAchievement('ancestor-spirit', 'Ancestor Spirit', 'Derrotou Ancestor Spirit.', 'boss'),
  erAchievement('maliketh-the-black-blade', 'Maliketh the Black Blade', 'Derrotou Maliketh the Black Blade.', 'boss', 'gold'),
  erAchievement('shardbearer-mohg', 'Shardbearer Mohg', 'Derrotou Shardbearer Mohg.', 'boss', 'silver'),
  erAchievement('hoarah-loux-warrior', 'Hoarah Loux, Warrior', 'Derrotou Hoarah Loux, Warrior.', 'boss', 'gold'),
  erAchievement('valiant-gargoyles', 'Valiant Gargoyles', 'Derrotou Valiant Gargoyles.', 'boss'),
  erAchievement('loretta-knight-of-the-haligtree', 'Loretta, Knight of the Haligtree', 'Derrotou Loretta, Knight of the Haligtree.', 'boss'),
  erAchievement('elemer-of-the-briar', 'Elemer of the Briar', 'Derrotou Elemer of the Briar.', 'boss'),
  erAchievement('dragonkin-soldier-of-nokstella', 'Dragonkin Soldier of Nokstella', 'Derrotou Dragonkin Soldier of Nokstella.', 'boss'),
  erAchievement('regal-ancestor-spirit', 'Regal Ancestor Spirit', 'Derrotou Regal Ancestor Spirit.', 'boss'),
  erAchievement('shardbearer-malenia', 'Shardbearer Malenia', 'Derrotou Shardbearer Malenia.', 'boss', 'gold'),
  erAchievement('mohg-the-omen', 'Mohg, the Omen', 'Derrotou Mohg, the Omen.', 'boss'),
  erAchievement('dragonlord-placidusax', 'Dragonlord Placidusax', 'Derrotou Dragonlord Placidusax.', 'boss', 'gold'),
  erAchievement('lichdragon-fortissax', 'Lichdragon Fortissax', 'Derrotou Lichdragon Fortissax.', 'boss', 'gold'),
  erAchievement('age-of-the-stars', 'Age of the Stars', 'Alcancou o final Age of the Stars.', 'ending', 'gold'),
  erAchievement('elden-lord', 'Elden Lord', 'Alcancou o final Elden Lord.', 'ending', 'gold'),
  erAchievement('legendary-armaments', 'Legendary Armaments', 'Adquiriu todos os armamentos lendarios.', 'collection', 'silver'),
  erAchievement('legendary-ashen-remains', 'Legendary Ashen Remains', 'Adquiriu todos os Legendary Ashen Remains.', 'collection', 'silver'),
  erAchievement('legendary-talismans', 'Legendary Talismans', 'Adquiriu todos os talismas lendarios.', 'collection', 'silver'),
  erAchievement('legendary-sorceries-and-incantations', 'Legendary Sorceries and Incantations', 'Adquiriu todas as sorceries e incantations lendarias.', 'collection', 'silver'),
  erAchievement('lord-of-frenzied-flame', 'Lord of Frenzied Flame', 'Alcancou o final Lord of Frenzied Flame.', 'ending', 'gold'),
  erAchievement('elden-ring', 'Elden Ring', 'Obteve todas as conquistas oficiais.', 'milestone', 'platinum'),
  {
    id: 'er:gamehub-achievement-bosses',
    apiName: 'GAMEHUB_ACHIEVEMENT_BOSSES',
    title: 'GameHub: 30 chefes de conquista',
    description: 'Checklist pessoal para marcar todos os chefes que liberam conquista/trofeu oficial.',
    category: 'boss',
    tier: 'gamehub',
    source: 'gamehub',
    checklistTotal: 30
  },
  {
    id: 'er:gamehub-base-game-boss-hunt',
    apiName: 'GAMEHUB_BASE_GAME_BOSS_HUNT',
    title: 'GameHub: caca completa de bosses',
    description: 'Marco pessoal para quem quer registrar uma limpa completa nos chefes do jogo base.',
    category: 'milestone',
    tier: 'gamehub',
    source: 'gamehub',
    checklistTotal: 166
  }
]

/** Lightweight seed. Extend by adding entries below. */
export const LOCAL_ACHIEVEMENT_CATALOG: AchievementCatalogEntry[] = [
  {
    id: 'elden-ring',
    matchers: {
      titles: ['elden ring'],
      steamAppId: '1245620',
      exe: ['eldenring.exe', 'start_protected_game.exe']
    },
    platforms: ['pc'],
    sourceLabel: 'Steam + GameHub · Elden Ring',
    sourceUrl: 'https://steamcommunity.com/stats/1245620/achievements',
    achievements: ELDEN_RING_ACHIEVEMENTS
  },
  ...GOD_OF_WAR_CATALOG_ENTRIES,
  ...DEMON_SLAYER_CATALOG_ENTRIES,
  {
    id: 'hollow-knight',
    matchers: {
      titles: ['hollow knight'],
      steamAppId: '367520',
      exe: ['hollow_knight.exe']
    },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Hollow Knight',
    sourceUrl: 'https://store.steampowered.com/app/367520',
    achievements: [
      { id: 'hk:the-hollow-knight', apiName: 'THE_HOLLOW_KNIGHT', title: 'The Hollow Knight', description: 'Defeat the Hollow Knight.' },
      { id: 'hk:sealed-siblings', apiName: 'SEALED_SIBLINGS', title: 'Sealed Siblings', description: 'Defeat the Hollow Knight with Hornet.' },
      { id: 'hk:dream-no-more', apiName: 'DREAM_NO_MORE', title: 'Dream No More', description: 'Defeat the Radiance.' },
      { id: 'hk:embrace-the-void', apiName: 'EMBRACE_THE_VOID', title: 'Embrace the Void', description: 'Defeat the Absolute Radiance.' },
      { id: 'hk:steel-soul', apiName: 'STEEL_SOUL', title: 'Steel Soul', description: 'Complete the game on Steel Soul mode.' },
      { id: 'hk:pantheon-of-hallownest', apiName: 'PANTHEON_HALLOWNEST', title: 'Pantheon of Hallownest', description: 'Defeat all bosses in the Pantheon of Hallownest.' }
    ]
  },
  {
    id: 'hades',
    matchers: {
      titles: ['hades'],
      steamAppId: '1145360',
      exe: ['hades.exe']
    },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Hades',
    sourceUrl: 'https://store.steampowered.com/app/1145360',
    achievements: [
      { id: 'hd:is-there-no-escape', apiName: 'NO_ESCAPE', title: 'Is There No Escape?', description: 'Reach the Surface.' },
      { id: 'hd:thanks-for-playing', apiName: 'THANKS_PLAYING', title: 'Thanks for Playing!', description: 'See the credits.' },
      { id: 'hd:troves-galore', apiName: 'TROVES', title: 'Troves Galore', description: 'Unlock all Charon shop options.' },
      { id: 'hd:olympian-favor', apiName: 'OLYMPIAN_FAVOR', title: 'Olympian Favor', description: 'Reach max heat with every god.' }
    ]
  },
  {
    id: 'stardew-valley',
    matchers: {
      titles: ['stardew valley'],
      steamAppId: '413150',
      exe: ['stardew valley.exe']
    },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Stardew Valley',
    sourceUrl: 'https://store.steampowered.com/app/413150',
    achievements: [
      { id: 'sv:greenhorn', apiName: 'GREENHORN', title: 'Greenhorn', description: 'Earn 15,000g.' },
      { id: 'sv:cowpoke', apiName: 'COWPOKE', title: 'Cowpoke', description: 'Earn 50,000g.' },
      { id: 'sv:homesteader', apiName: 'HOMESTEADER', title: 'Homesteader', description: 'Earn 250,000g.' },
      { id: 'sv:millionaire', apiName: 'MILLIONAIRE', title: 'Millionaire', description: 'Earn 1,000,000g.' },
      { id: 'sv:legend', apiName: 'LEGEND', title: 'Legend', description: 'Earn 10,000,000g.' }
    ]
  },
  {
    id: 'celeste',
    matchers: { titles: ['celeste'], steamAppId: '504230', exe: ['celeste.exe'] },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Celeste',
    sourceUrl: 'https://store.steampowered.com/app/504230',
    achievements: [
      { id: 'cs:summit', apiName: 'SUMMIT', title: 'The Summit', description: 'Reach the summit.' },
      { id: 'cs:farewell', apiName: 'FAREWELL', title: 'Farewell', description: 'Complete the Farewell chapter.' },
      { id: 'cs:c-side', apiName: 'C_SIDE', title: 'C-Sides', description: 'Beat all C-Sides.' },
      { id: 'cs:strawberry-jam', apiName: 'STRAWBERRIES_175', title: 'Strawberry Hoarder', description: 'Collect 175 strawberries.' }
    ]
  },
  {
    id: 'cyberpunk-2077',
    matchers: { titles: ['cyberpunk 2077'], steamAppId: '1091500', exe: ['cyberpunk2077.exe'] },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Cyberpunk 2077',
    sourceUrl: 'https://store.steampowered.com/app/1091500',
    achievements: [
      { id: 'cp:the-fool', apiName: 'THE_FOOL', title: 'The Fool', description: 'Become a Mercenary.' },
      { id: 'cp:the-star', apiName: 'THE_STAR', title: 'The Star', description: 'Leave Night City with the Aldecaldos.' },
      { id: 'cp:the-sun', apiName: 'THE_SUN', title: 'The Sun', description: 'Become a legend of the Afterlife.' },
      { id: 'cp:the-devil', apiName: 'THE_DEVIL', title: 'The Devil', description: 'Sign the deal with Arasaka.' },
      { id: 'cp:temperance', apiName: 'TEMPERANCE', title: 'Temperance', description: 'Let Johnny take the body.' },
      { id: 'cp:phantom-liberty', apiName: 'PHANTOM_LIBERTY', title: 'Phantom Liberty', description: 'Complete the Phantom Liberty expansion.' }
    ]
  },
  {
    id: 'witcher-3',
    matchers: { titles: ['the witcher 3 wild hunt', 'the witcher 3'], steamAppId: '292030', exe: ['witcher3.exe'] },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · The Witcher 3',
    sourceUrl: 'https://store.steampowered.com/app/292030',
    achievements: [
      { id: 'tw3:passed-the-trial', apiName: 'PASSED_THE_TRIAL', title: 'Passed the Trial', description: 'Finish the game on any difficulty.' },
      { id: 'tw3:walked-the-path', apiName: 'WALKED_THE_PATH', title: 'Walked the Path', description: 'Finish the game on Death March difficulty.' },
      { id: 'tw3:family-counselor', apiName: 'FAMILY_COUNSELOR', title: 'Family Counselor', description: 'Help reunite the Bloody Baron with his wife and daughter.' },
      { id: 'tw3:assassin-of-kings', apiName: 'ASSASSIN_OF_KINGS', title: 'Assassin of Kings', description: 'Kill all the people responsible for assassinating monarchs.' },
      { id: 'tw3:butcher-of-blaviken', apiName: 'BUTCHER_OF_BLAVIKEN', title: 'Butcher of Blaviken', description: 'Kill 5,000 enemies.' }
    ]
  },
  {
    id: 'baldurs-gate-3',
    matchers: { titles: ['baldurs gate 3', 'baldur s gate 3'], steamAppId: '1086940' },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Baldur\'s Gate 3',
    sourceUrl: 'https://store.steampowered.com/app/1086940',
    achievements: [
      { id: 'bg3:foehammer', apiName: 'FOEHAMMER', title: 'Foehammer', description: 'Complete the game.' },
      { id: 'bg3:critical-hit', apiName: 'CRITICAL_HIT', title: 'Critical Hit!', description: 'Land a critical hit.' },
      { id: 'bg3:absolutist', apiName: 'ABSOLUTIST', title: 'Absolutist', description: 'Side with the Absolute.' },
      { id: 'bg3:liberator', apiName: 'LIBERATOR', title: 'Liberator', description: 'Defeat the Absolute.' },
      { id: 'bg3:honour-mode', apiName: 'HONOUR_MODE', title: 'Honour Mode', description: 'Complete Honour Mode (no save scumming).' }
    ]
  },
  {
    id: 'red-dead-2',
    matchers: { titles: ['red dead redemption 2'], steamAppId: '1174180', exe: ['rdr2.exe'] },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Red Dead Redemption 2',
    sourceUrl: 'https://store.steampowered.com/app/1174180',
    achievements: [
      { id: 'rdr2:american-dreamers', apiName: 'AMERICAN_DREAMERS', title: 'American Dreamers', description: 'Get one perfect pelt for every animal of value.' },
      { id: 'rdr2:lending-a-hand', apiName: 'LENDING_A_HAND', title: 'Lending a Hand', description: 'Complete all optional Honor story missions.' },
      { id: 'rdr2:western-stories', apiName: 'WESTERN_STORIES', title: 'Western Stories', description: 'Reach the maximum bonding level with every horse breed.' },
      { id: 'rdr2:legend-of-the-east', apiName: 'LEGEND_OF_THE_EAST', title: 'Legend of the East', description: 'Complete all Stranger mission strands.' },
      { id: 'rdr2:best-in-the-west', apiName: 'BEST_IN_THE_WEST', title: 'Best in the West', description: 'Reach the highest rank in Online.' }
    ]
  },
  {
    id: 'gta-v',
    matchers: { titles: ['grand theft auto v', 'gta v', 'gta 5'], steamAppId: '271590' },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · GTA V',
    sourceUrl: 'https://store.steampowered.com/app/271590',
    achievements: [
      { id: 'gtav:welcome-to-los-santos', apiName: 'WELCOME_LS', title: 'Welcome to Los Santos', description: 'Complete the prologue.' },
      { id: 'gtav:to-live-or-die', apiName: 'TO_LIVE_OR_DIE', title: 'To Live or Die in Los Santos', description: 'Complete the final mission.' },
      { id: 'gtav:solid-gold-baby', apiName: 'SOLID_GOLD', title: 'Solid Gold, Baby!', description: 'Earn any 70 Gold Medals on Missions, Strangers and Freaks.' },
      { id: 'gtav:career-criminal', apiName: 'CAREER_CRIMINAL', title: 'Career Criminal', description: 'Attain 100% Completion.' }
    ]
  },
  {
    id: 'palworld',
    matchers: { titles: ['palworld'], steamAppId: '1623730' },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Palworld',
    sourceUrl: 'https://store.steampowered.com/app/1623730',
    achievements: [
      { id: 'pw:first-pal', apiName: 'FIRST_PAL', title: 'My First Pal', description: 'Caught your first Pal.' },
      { id: 'pw:tower-fall', apiName: 'TOWER_FALL', title: 'Tower Conqueror', description: 'Defeat a Tower Boss.' },
      { id: 'pw:full-paldeck', apiName: 'FULL_PALDECK', title: 'Paldeck Complete', description: 'Catch every Pal.' }
    ]
  },
  {
    id: 'helldivers-2',
    matchers: { titles: ['helldivers 2', 'helldivers ii'], steamAppId: '553850' },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Helldivers 2',
    sourceUrl: 'https://store.steampowered.com/app/553850',
    achievements: [
      { id: 'hd2:first-mission', apiName: 'FIRST_MISSION', title: 'For Democracy!', description: 'Complete your first mission.' },
      { id: 'hd2:super-citizen', apiName: 'SUPER_CITIZEN', title: 'Super Citizen', description: 'Reach max level.' },
      { id: 'hd2:bug-stomper', apiName: 'BUG_STOMPER', title: 'Bug Stomper', description: 'Defeat 1,000 Terminids.' },
      { id: 'hd2:bot-buster', apiName: 'BOT_BUSTER', title: 'Bot Buster', description: 'Defeat 1,000 Automatons.' }
    ]
  },
  {
    id: 'starfield',
    matchers: { titles: ['starfield'], steamAppId: '1716740' },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Starfield',
    sourceUrl: 'https://store.steampowered.com/app/1716740',
    achievements: [
      { id: 'sf:one-small-step', apiName: 'ONE_SMALL_STEP', title: 'One Small Step', description: 'Join Constellation.' },
      { id: 'sf:into-the-unknown', apiName: 'INTO_THE_UNKNOWN', title: 'Into the Unknown', description: 'Complete the main story.' },
      { id: 'sf:starborn', apiName: 'STARBORN', title: 'Starborn', description: 'Begin New Game+ as a Starborn.' }
    ]
  },
  {
    id: 'lethal-company',
    matchers: { titles: ['lethal company'], steamAppId: '1966720' },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Lethal Company',
    sourceUrl: 'https://store.steampowered.com/app/1966720',
    achievements: [
      { id: 'lc:first-paycheck', apiName: 'FIRST_PAYCHECK', title: 'First Paycheck', description: 'Meet quota at least once.' },
      { id: 'lc:dead-from-flora', apiName: 'KILLED_BY_PLANT', title: 'Compost', description: 'Die to a non-monster hazard.' }
    ]
  },
  {
    id: 'sons-of-the-forest',
    matchers: { titles: ['sons of the forest'], steamAppId: '1326470' },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Sons of the Forest',
    sourceUrl: 'https://store.steampowered.com/app/1326470',
    achievements: [
      { id: 'sotf:survivor', apiName: 'SURVIVOR', title: 'Survivor', description: 'Survive 10 in-game days.' },
      { id: 'sotf:rescue', apiName: 'RESCUE', title: 'Rescue', description: 'Find a companion.' },
      { id: 'sotf:complete', apiName: 'COMPLETE', title: 'Escape', description: 'Reach the ending.' }
    ]
  },
  {
    id: 'resident-evil-4-remake',
    matchers: { titles: ['resident evil 4', 'resident evil 4 remake'], steamAppId: '2050650' },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Resident Evil 4 Remake',
    sourceUrl: 'https://store.steampowered.com/app/2050650',
    achievements: [
      { id: 're4:story-completed', apiName: 'STORY_COMPLETED', title: 'A Heroic Rescue', description: 'Complete the main story.' },
      { id: 're4:professional', apiName: 'PROFESSIONAL', title: 'Professional Diorama', description: 'Complete the game on Professional.' },
      { id: 're4:s-rank', apiName: 'S_RANK', title: 'Top of the Class', description: 'Earn an S Rank.' }
    ]
  },
  {
    id: 'lies-of-p',
    matchers: { titles: ['lies of p'], steamAppId: '1627720' },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Lies of P',
    sourceUrl: 'https://store.steampowered.com/app/1627720',
    achievements: [
      { id: 'lop:real-boy', apiName: 'REAL_BOY', title: 'Real Boy', description: 'Reach the Real Boy ending.' },
      { id: 'lop:rise-puppet', apiName: 'RISE_PUPPET', title: 'Rise of P', description: 'Reach the Rise of P ending.' },
      { id: 'lop:free-from-puppet-string', apiName: 'FREE_PUPPET', title: 'Free from the Puppet String', description: 'Reach the Free from the Puppet String ending.' }
    ]
  },
  {
    id: 'remnant-2',
    matchers: { titles: ['remnant ii', 'remnant 2'], steamAppId: '1282100' },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Remnant II',
    sourceUrl: 'https://store.steampowered.com/app/1282100',
    achievements: [
      { id: 'r2:annihilation', apiName: 'ANNIHILATION', title: 'Annihilation', description: 'Defeat Annihilation in N\'Erud.' },
      { id: 'r2:the-many-faced', apiName: 'MANY_FACED', title: 'The Many Faced', description: 'Defeat the Many Faced Devourer.' }
    ]
  },
  {
    id: 'dark-souls-3',
    matchers: { titles: ['dark souls iii', 'dark souls 3'], steamAppId: '374320' },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Dark Souls III',
    sourceUrl: 'https://store.steampowered.com/app/374320',
    achievements: [
      { id: 'ds3:to-link-the-fire', apiName: 'TO_LINK_THE_FIRE', title: 'To Link the First Flame', description: 'Reach "To Link the Fire" ending.' },
      { id: 'ds3:usurp-the-fire', apiName: 'USURP_THE_FIRE', title: 'The Usurpation of Fire', description: 'Reach "The Usurpation of Fire" ending.' },
      { id: 'ds3:end-of-fire', apiName: 'END_OF_FIRE', title: 'The End of Fire', description: 'Reach "The End of Fire" ending.' }
    ]
  },
  {
    id: 'sekiro',
    matchers: { titles: ['sekiro shadows die twice', 'sekiro'], steamAppId: '814380' },
    platforms: ['pc'],
    sourceLabel: 'GameHub catalog · Sekiro',
    sourceUrl: 'https://store.steampowered.com/app/814380',
    achievements: [
      { id: 'sk:shura', apiName: 'SHURA', title: 'Shura', description: 'Reach the Shura ending.' },
      { id: 'sk:purification', apiName: 'PURIFICATION', title: 'Purification', description: 'Reach the Purification ending.' },
      { id: 'sk:dragons-homecoming', apiName: 'DRAGONS_HOMECOMING', title: 'Dragon\'s Homecoming', description: 'Reach the Dragon\'s Homecoming ending.' },
      { id: 'sk:immortal-severance', apiName: 'IMMORTAL_SEVERANCE', title: 'Immortal Severance', description: 'Reach the Immortal Severance ending.' }
    ]
  }
]
