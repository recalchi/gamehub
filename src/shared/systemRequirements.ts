/**
 * Bundled system requirements catalog for popular PC titles. Used by the
 * Catalog → Biblioteca GameHub view to give players an at-a-glance read of
 * whether their rig should handle the game without leaving the launcher.
 *
 * Keys are normalized title slugs (lowercase, alphanumerics + single spaces).
 * Numbers should be the publisher's official requirements; cite the source
 * URL so future contributors can audit.
 */
export interface SystemRequirementsSpec {
  os: string
  cpu: string
  gpu: string
  ramGb: number
  storageGb: number
  notes?: string
}

export interface GameSystemRequirements {
  minimum: SystemRequirementsSpec
  recommended: SystemRequirementsSpec
  sourceUrl?: string
}

export const SYSTEM_REQUIREMENTS: Record<string, GameSystemRequirements> = {
  'elden ring': {
    sourceUrl: 'https://store.steampowered.com/app/1245620',
    minimum: {
      os: 'Windows 10',
      cpu: 'Intel Core i5-8400 / AMD Ryzen 3 3300X',
      gpu: 'NVIDIA GTX 1060 3GB / AMD RX 580 4GB',
      ramGb: 12,
      storageGb: 60
    },
    recommended: {
      os: 'Windows 10/11',
      cpu: 'Intel Core i7-8700K / AMD Ryzen 5 3600X',
      gpu: 'NVIDIA GTX 1070 8GB / AMD RX Vega 56 8GB',
      ramGb: 16,
      storageGb: 60
    }
  },
  'cyberpunk 2077': {
    sourceUrl: 'https://store.steampowered.com/app/1091500',
    minimum: {
      os: 'Windows 10 64-bit',
      cpu: 'Intel Core i7-6700 / AMD Ryzen 5 1600',
      gpu: 'NVIDIA GTX 1060 6GB / AMD RX 580 8GB / Intel Arc A380',
      ramGb: 12,
      storageGb: 70,
      notes: 'SSD obrigatório.'
    },
    recommended: {
      os: 'Windows 10/11 64-bit',
      cpu: 'Intel Core i7-12700 / AMD Ryzen 7 7800X3D',
      gpu: 'NVIDIA RTX 2060 SUPER / AMD RX 5700 XT / Intel Arc A770',
      ramGb: 16,
      storageGb: 70
    }
  },
  'the witcher 3 wild hunt': {
    sourceUrl: 'https://store.steampowered.com/app/292030',
    minimum: {
      os: 'Windows 10',
      cpu: 'Intel Core i5-2500K / AMD FX-8350',
      gpu: 'NVIDIA GTX 770 2GB / AMD R9 290 4GB',
      ramGb: 8,
      storageGb: 50
    },
    recommended: {
      os: 'Windows 10/11',
      cpu: 'Intel Core i7-3770 / AMD FX-8350',
      gpu: 'NVIDIA GTX 1060 6GB / AMD RX 480 8GB',
      ramGb: 12,
      storageGb: 50
    }
  },
  'grand theft auto v': {
    sourceUrl: 'https://store.steampowered.com/app/271590',
    minimum: {
      os: 'Windows 10 64-bit',
      cpu: 'Intel Core 2 Quad CPU Q6600 / AMD Phenom 9850',
      gpu: 'NVIDIA 9800 GT 1GB / AMD HD 4870 1GB',
      ramGb: 4,
      storageGb: 100
    },
    recommended: {
      os: 'Windows 10/11 64-bit',
      cpu: 'Intel Core i5-3470 / AMD FX-8350',
      gpu: 'NVIDIA GTX 660 2GB / AMD HD 7870 2GB',
      ramGb: 8,
      storageGb: 100
    }
  },
  'red dead redemption 2': {
    sourceUrl: 'https://store.steampowered.com/app/1174180',
    minimum: {
      os: 'Windows 10 (April 2018 update v1803)',
      cpu: 'Intel Core i5-2500K / AMD FX-6300',
      gpu: 'NVIDIA GTX 770 2GB / AMD R9 280 3GB',
      ramGb: 8,
      storageGb: 150
    },
    recommended: {
      os: 'Windows 10/11',
      cpu: 'Intel Core i7-4770K / AMD Ryzen 5 1500X',
      gpu: 'NVIDIA GTX 1060 6GB / AMD RX 480 4GB',
      ramGb: 12,
      storageGb: 150
    }
  },
  'hollow knight': {
    sourceUrl: 'https://store.steampowered.com/app/367520',
    minimum: {
      os: 'Windows 7',
      cpu: 'Intel Core 2 Duo E5200',
      gpu: 'GeForce 9800GTX+ (1GB)',
      ramGb: 4,
      storageGb: 9
    },
    recommended: {
      os: 'Windows 10/11',
      cpu: 'Intel Core i5',
      gpu: 'GeForce GTX 560+',
      ramGb: 8,
      storageGb: 9
    }
  },
  'baldurs gate 3': {
    sourceUrl: 'https://store.steampowered.com/app/1086940',
    minimum: {
      os: 'Windows 10 64-bit',
      cpu: 'Intel Core i5-4690 / AMD FX 4350',
      gpu: 'NVIDIA GTX 970 / AMD RX 480',
      ramGb: 8,
      storageGb: 150,
      notes: 'DirectX 11.'
    },
    recommended: {
      os: 'Windows 10/11 64-bit',
      cpu: 'Intel Core i7-8700K / AMD Ryzen 5 3600',
      gpu: 'NVIDIA RTX 2060 SUPER / AMD RX 5700 XT',
      ramGb: 16,
      storageGb: 150
    }
  },
  'starfield': {
    sourceUrl: 'https://store.steampowered.com/app/1716740',
    minimum: {
      os: 'Windows 10/11 com atualizações',
      cpu: 'AMD Ryzen 5 2600X / Intel Core i7-6800K',
      gpu: 'AMD Radeon RX 5700 / NVIDIA GTX 1070 Ti',
      ramGb: 16,
      storageGb: 125,
      notes: 'SSD obrigatório.'
    },
    recommended: {
      os: 'Windows 10/11',
      cpu: 'AMD Ryzen 5 3600X / Intel Core i5-10600K',
      gpu: 'AMD Radeon RX 6800 XT / NVIDIA RTX 2080',
      ramGb: 16,
      storageGb: 125
    }
  },
  'palworld': {
    sourceUrl: 'https://store.steampowered.com/app/1623730',
    minimum: {
      os: 'Windows 10 64-bit',
      cpu: 'i5-3570K 3.4 GHz 4 Core',
      gpu: 'GeForce GTX 1050 (2GB)',
      ramGb: 16,
      storageGb: 40
    },
    recommended: {
      os: 'Windows 10/11 64-bit',
      cpu: 'i9-9900K 3.6 GHz 8 Core',
      gpu: 'GeForce RTX 2070',
      ramGb: 32,
      storageGb: 40
    }
  },
  'helldivers 2': {
    sourceUrl: 'https://store.steampowered.com/app/553850',
    minimum: {
      os: 'Windows 10 64-bit',
      cpu: 'Intel Core i7-4790K / AMD Ryzen 5 1500X',
      gpu: 'NVIDIA GTX 1050 Ti / AMD RX 470',
      ramGb: 8,
      storageGb: 100
    },
    recommended: {
      os: 'Windows 10/11 64-bit',
      cpu: 'Intel Core i7-9700K / AMD Ryzen 7 3700X',
      gpu: 'NVIDIA RTX 2060 / AMD RX 6600 XT',
      ramGb: 16,
      storageGb: 100
    }
  },
  'stardew valley': {
    sourceUrl: 'https://store.steampowered.com/app/413150',
    minimum: {
      os: 'Windows Vista or greater',
      cpu: '2 Ghz',
      gpu: '256 mb video memory, shader model 3.0+',
      ramGb: 2,
      storageGb: 1
    },
    recommended: {
      os: 'Windows 10/11',
      cpu: '2 Ghz',
      gpu: '256 mb video memory, shader model 3.0+',
      ramGb: 4,
      storageGb: 1
    }
  },
  'minecraft': {
    sourceUrl: 'https://help.minecraft.net/hc/en-us/articles/360035131371',
    minimum: {
      os: 'Windows 10/11',
      cpu: 'Intel Core i3-3210 / AMD A8-7600',
      gpu: 'Intel HD Graphics 4000 / AMD Radeon R5',
      ramGb: 4,
      storageGb: 4
    },
    recommended: {
      os: 'Windows 10/11',
      cpu: 'Intel Core i5-4690 / AMD A10-7800',
      gpu: 'GeForce 700 series / AMD Radeon RX 200 series',
      ramGb: 8,
      storageGb: 4
    }
  },
  'hades': {
    sourceUrl: 'https://store.steampowered.com/app/1145360',
    minimum: {
      os: 'Windows 7 SP1',
      cpu: 'Dual Core 2.4 GHz',
      gpu: '1GB VRAM / DirectX 10+ support',
      ramGb: 4,
      storageGb: 15
    },
    recommended: {
      os: 'Windows 10/11',
      cpu: 'Quad Core 3.0+ GHz',
      gpu: '2GB VRAM / DirectX 10+ support',
      ramGb: 8,
      storageGb: 15
    }
  }
}

export function normalizeReqsKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
