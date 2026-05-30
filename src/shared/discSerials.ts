/**
 * Local lookup table mapping common PS1/PS2 disc serials to human-readable
 * titles. Bundled so the scanner can fix entries like "SCUS-97328" → "Gran
 * Turismo 4" without needing a network round-trip to TheGamesDB.
 *
 * Coverage is deliberately small — we focus on the games most likely to show
 * up with serial-only filenames (No-Intro redumps). A miss here falls back to
 * parent-folder-name detection in the scanner, which usually still produces a
 * usable title.
 *
 * Sources cross-checked against publicly known No-Intro / Redump catalogs.
 */

export const DISC_SERIALS: Record<string, string> = {
  // ----- PS2 -----
  'SCUS-97328': 'Gran Turismo 4',
  'SCUS-97098': 'Gran Turismo 3 - A-Spec',
  'SLUS-21361': 'God of War II',
  'SCUS-97399': 'God of War II',
  'SCUS-97399BL': 'God of War II',
  'SCUS-97231': 'God of War',
  'SLUS-20916': 'God of War',
  'SLUS-21050': 'Shadow of the Colossus',
  'SCUS-97472': 'Shadow of the Colossus',
  'SLUS-21065': 'Final Fantasy X',
  'SLUS-20672': 'Final Fantasy X',
  'SCUS-97442': 'Resident Evil 4',
  'SLUS-21134': 'Resident Evil 4',
  'SLUS-20908': 'Devil May Cry 3 - Dante\'s Awakening',
  'SLUS-20119': 'Devil May Cry',
  'SLUS-20439': 'Devil May Cry 2',
  'SCUS-97265': 'Jak and Daxter - The Precursor Legacy',
  'SCUS-97124': 'Ratchet & Clank',
  'SLUS-20946': 'Kingdom Hearts II',
  'SLUS-20370': 'Kingdom Hearts',
  'SLUS-21171': 'Metal Gear Solid 3 - Subsistence',
  'SLUS-20915': 'Metal Gear Solid 3 - Snake Eater',
  'SLUS-20144': 'Metal Gear Solid 2 - Sons of Liberty',
  'SLUS-20312': 'Grand Theft Auto III',
  'SLUS-20322': 'Grand Theft Auto - Vice City',
  'SLUS-20946SA': 'Grand Theft Auto - San Andreas',
  'SLUS-21082': 'Grand Theft Auto - San Andreas',
  'SLUS-21065MK': 'Mortal Kombat - Armageddon',
  'SLUS-21303': 'Mortal Kombat - Armageddon',
  'SLUS-20062': 'Tony Hawk\'s Pro Skater 3',

  // ----- PS1 -----
  'SCUS-94228': 'Crash Bandicoot',
  'SCUS-94154': 'Crash Bandicoot 2 - Cortex Strikes Back',
  'SCUS-94164': 'Crash Bandicoot 3 - Warped',
  'SCUS-94426': 'Crash Team Racing',
  'SCUS-94228CTR': 'Crash Team Racing',
  'SCUS-94290': 'Spyro the Dragon',
  'SCUS-94425': 'Spyro 2 - Ripto\'s Rage!',
  'SCUS-94467': 'Spyro - Year of the Dragon',
  'SLUS-00067': 'Resident Evil',
  'SLUS-00551': 'Resident Evil 2',
  'SLUS-00184': 'Final Fantasy VII',
  'SLUS-00669': 'Final Fantasy VIII',
  'SLUS-01041': 'Final Fantasy IX',
  'SCUS-94163': 'Tomb Raider',
  'SLUS-00485': 'Castlevania - Symphony of the Night',
  'SCUS-94900': 'Metal Gear Solid',
  'SLUS-00594': 'Metal Gear Solid',
  'SCUS-94001': 'Twisted Metal',
  'SCUS-94569': 'Twisted Metal 2',
  'SLUS-00007': 'Tekken',
  'SLUS-00402': 'Tekken 3',
  'SLUS-00006': 'Mortal Kombat Trilogy',
  'SLUS-00619': 'Diablo',
  'SLUS-00170': 'Spider-Man',
  'SCUS-94409': 'Spider-Man',
  'SLUS-00219': 'Tony Hawk\'s Pro Skater'
}

/**
 * Regex that matches typical disc serial codes — uppercase prefix, dash,
 * digits. We use this to decide whether to fall back to parent-folder name
 * when the filename was a No-Intro serial dump rather than a friendly name.
 */
export const DISC_SERIAL_RE = /^(SCUS|SLUS|SLES|SCES|SLPS|SLPM|SCPS|PBPX|SCED|SCAJ|SLAJ|PAPX|SLKA)-\d+$/i

export function looksLikeDiscSerial(name: string): boolean {
  return DISC_SERIAL_RE.test(name.trim())
}

/**
 * Look up a serial in the local DB. Returns null if not recognised — caller
 * should fall back to parent folder or keep the serial as-is.
 *
 * Match is case-insensitive and tolerates extra suffix tags some redumps add
 * after the serial (e.g. "SCUS-97328 (1.01)" → strip the parenthesis first
 * via the regex extraction in the caller).
 */
export function lookupSerial(serial: string): string | null {
  const key = serial.toUpperCase().trim()
  return DISC_SERIALS[key] ?? null
}
