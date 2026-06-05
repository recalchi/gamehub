/**
 * Static catalog of save-file locations for popular PC titles.
 *
 * Keys are normalized lowercase title slugs (alphanumerics + spaces collapsed,
 * accents stripped — see `normalizeTitle`). Values are arrays of candidate
 * paths with `${ENV_VAR}` placeholders that we expand at lookup time.
 *
 * Order matters: first existing path wins. Put authoritative locations first,
 * legacy ones last.
 *
 * IMPORTANT: PC titles here are local-install entries. Steam/Epic/Riot saves
 * are still resolved by their store integration — never mix.
 */
export const PC_SAVE_CATALOG: Record<string, string[]> = {
  'elden ring': [
    '${APPDATA}\\EldenRing',
    '${USERPROFILE}\\Documents\\EldenRing'
  ],
  'dark souls': ['${USERPROFILE}\\Documents\\NBGI\\DarkSouls'],
  'dark souls ii': ['${APPDATA}\\DarkSoulsII'],
  'dark souls iii': ['${APPDATA}\\DarkSoulsIII'],
  'sekiro shadows die twice': ['${APPDATA}\\Sekiro'],
  'cyberpunk 2077': [
    '${USERPROFILE}\\Saved Games\\CD Projekt Red\\Cyberpunk 2077'
  ],
  'the witcher 3 wild hunt': [
    '${USERPROFILE}\\Documents\\The Witcher 3'
  ],
  'grand theft auto v': [
    '${USERPROFILE}\\Documents\\Rockstar Games\\GTA V\\Profiles'
  ],
  'red dead redemption 2': [
    '${USERPROFILE}\\Documents\\Rockstar Games\\Red Dead Redemption 2\\Profiles'
  ],
  'hollow knight': [
    '${USERPROFILE}\\AppData\\LocalLow\\Team Cherry\\Hollow Knight'
  ],
  'stardew valley': ['${APPDATA}\\StardewValley\\Saves'],
  'terraria': ['${USERPROFILE}\\Documents\\My Games\\Terraria'],
  'minecraft': ['${APPDATA}\\.minecraft\\saves'],
  'hades': [
    '${USERPROFILE}\\Documents\\Saved Games\\Hades'
  ],
  'hades ii': [
    '${USERPROFILE}\\Documents\\Saved Games\\Hades II'
  ],
  'celeste': [
    '${USERPROFILE}\\AppData\\Local\\Celeste\\Saves'
  ],
  'skyrim': ['${USERPROFILE}\\Documents\\My Games\\Skyrim\\Saves'],
  'skyrim special edition': [
    '${USERPROFILE}\\Documents\\My Games\\Skyrim Special Edition\\Saves'
  ],
  'fallout 4': ['${USERPROFILE}\\Documents\\My Games\\Fallout4\\Saves'],
  'fallout new vegas': [
    '${USERPROFILE}\\Documents\\My Games\\FalloutNV\\Saves'
  ],
  'baldurs gate 3': [
    '${LOCALAPPDATA}\\Larian Studios\\Baldur\'s Gate 3\\PlayerProfiles'
  ],
  'divinity original sin 2': [
    '${LOCALAPPDATA}\\Larian Studios\\Divinity Original Sin 2\\PlayerProfiles'
  ],
  'persona 5 royal': [
    '${USERPROFILE}\\AppData\\Local\\SEGA\\P5R'
  ],
  'death stranding': [
    '${APPDATA}\\KojimaProductions\\DeathStranding'
  ],
  'monster hunter rise': [
    '${USERPROFILE}\\Documents\\Capcom\\MHRise'
  ],
  'monster hunter world': [
    '${USERPROFILE}\\AppData\\Roaming\\Capcom\\Monster Hunter World'
  ],
  'resident evil 4': ['${APPDATA}\\My Games\\CAPCOM\\RE4R'],
  'resident evil village': ['${APPDATA}\\My Games\\CAPCOM\\RE8'],
  'lies of p': [
    '${LOCALAPPDATA}\\LiesofP\\Saved\\SaveGames'
  ],
  'remnant ii': [
    '${LOCALAPPDATA}\\Remnant2\\Saved\\SaveGames'
  ],
  'control': ['${LOCALAPPDATA}\\Remedy\\Control'],
  'disco elysium': ['${APPDATA}\\..\\LocalLow\\ZA UM\\Disco Elysium'],
  'subnautica': [
    '${USERPROFILE}\\AppData\\LocalLow\\Unknown Worlds\\Subnautica\\Subnautica\\SavedGames'
  ],
  'no mans sky': [
    '${APPDATA}\\HelloGames\\NMS'
  ],
  'doom eternal': ['${USERPROFILE}\\Saved Games\\id Software\\DOOMEternal'],
  'doom 2016': ['${USERPROFILE}\\Saved Games\\id Software\\DOOM'],
  'sons of the forest': [
    '${USERPROFILE}\\AppData\\LocalLow\\Endnight\\SonsOfTheForest\\Saves'
  ],
  'the forest': [
    '${USERPROFILE}\\AppData\\LocalLow\\SKS\\TheForest'
  ],
  'palworld': [
    '${LOCALAPPDATA}\\Pal\\Saved\\SaveGames'
  ],
  'helldivers 2': [
    '${APPDATA}\\Arrowhead\\Helldivers2\\steam_save'
  ],
  'enshrouded': [
    '${APPDATA}\\Enshrouded'
  ],
  'lethal company': [
    '${USERPROFILE}\\AppData\\LocalLow\\ZeekerssRBLX\\Lethal Company'
  ],
  'starfield': [
    '${USERPROFILE}\\Documents\\My Games\\Starfield\\Saves'
  ],
  'diablo iv': [
    '${USERPROFILE}\\Documents\\Diablo IV'
  ]
}

/**
 * Roots scanned for fuzzy fallback when a title isn't in the static catalog.
 * Returned in order — first hit wins.
 */
export const PC_FALLBACK_ROOTS = [
  '${APPDATA}',
  '${LOCALAPPDATA}',
  '${USERPROFILE}\\Documents\\My Games',
  '${USERPROFILE}\\Documents',
  '${USERPROFILE}\\Saved Games',
  '${USERPROFILE}\\AppData\\LocalLow'
]

/** Normalize a game title to the slug shape used as catalog key. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Expand `${VAR}` placeholders using process.env. Returns null if any unknown var. */
export function expandPath(template: string): string | null {
  const expanded = template.replace(/\$\{([A-Z_]+)\}/g, (_, name) => process.env[name] ?? '__MISSING__')
  if (expanded.includes('__MISSING__')) return null
  return expanded
}
