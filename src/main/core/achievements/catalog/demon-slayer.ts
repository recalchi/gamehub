import type { AchievementDefinition } from '@shared/types'
import type { AchievementCatalogEntry } from './index'

type AchievementCategory = NonNullable<AchievementDefinition['category']>
type AchievementTier = NonNullable<AchievementDefinition['tier']>
type AchievementSource = NonNullable<AchievementDefinition['source']>

function achievement(
  source: AchievementSource,
  slug: string,
  title: string,
  description: string,
  category: AchievementCategory,
  tier: AchievementTier = 'bronze'
): AchievementDefinition {
  return {
    id: `dshc:${slug}`,
    apiName: `DSHC_${slug}`.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
    title,
    description,
    category,
    tier,
    source
  }
}

function steam(
  slug: string,
  title: string,
  description: string,
  category: AchievementCategory,
  tier: AchievementTier = 'bronze'
): AchievementDefinition {
  return achievement('steam', slug, title, description, category, tier)
}

function gamehub(
  slug: string,
  title: string,
  description: string,
  category: AchievementCategory,
  checklistTotal: number
): AchievementDefinition {
  return {
    ...achievement('gamehub', slug, title, description, category, 'gamehub'),
    checklistTotal
  }
}

const DEMON_SLAYER_HINOKAMI_ACHIEVEMENTS: AchievementDefinition[] = [
  steam('prologue', 'Prologue', 'Complete the Prologue.', 'story'),
  steam('entranced', 'Entranced', 'Trigger a Trance Memory.', 'milestone'),
  steam('final-selection', 'Final Selection', 'Complete Chapter 1: Final Selection.', 'story'),
  steam('the-swamp-demon', 'The Swamp Demon', 'Complete Chapter 2: The Swamp Demon.', 'story'),
  steam('there-can-only-be-one', 'There Can Only Be One', 'Play VS Mode for the first time.', 'milestone'),
  steam('a-taste-for-competition', 'A Taste for Competition', 'Win in VS Mode for the first time.', 'milestone'),
  steam('on-second-thought', 'On Second Thought...', 'Perform an Emergency Escape in VS Mode.', 'milestone'),
  steam('death-match-in-asakusa', 'Death Match in Asakusa', 'Complete Chapter 3: Death Match in Asakusa.', 'story'),
  steam('deja-vu', 'Déjà Vu', 'View a memory fragment.', 'collection'),
  steam('perfect-record', 'Perfect Record', 'Win in VS Mode without losing a single round.', 'milestone'),
  steam('echoing-drums', 'Echoing Drums', 'Complete Chapter 4: Echoing Drums.', 'story'),
  steam('prologue-rank-s', 'Prologue Rank S', 'Earn an S rank in the Prologue.', 'milestone'),
  steam('hinokami', 'Hinokami', 'Complete Chapter 5: Hinokami.', 'story', 'silver'),
  steam('im-on-it', "I'm On It", 'Clear a special mission for the first time.', 'milestone'),
  steam('combo-no-25', 'Combo No. 25', 'Get a 25-hit combo in VS Mode.', 'milestone'),
  steam('ultimate-finish', 'Ultimate Finish', 'Get an Ultimate Art Finish in VS Mode.', 'milestone'),
  steam('hashira-meeting', 'Hashira Meeting', 'Complete Chapter 6: Hashira Meeting.', 'story', 'silver'),
  steam('practice-makes-perfect', 'Practice Makes Perfect', 'Play Practice mode.', 'milestone'),
  steam('the-butterfly-mansion', 'The Butterfly Mansion', 'Complete Chapter 7: The Butterfly Mansion.', 'story', 'silver'),
  steam('smashing-gourds', 'Smashing Gourds', 'Clear Gourd Breaker in Chapter 7 for the first time.', 'milestone'),
  steam('dont-spill-the-tea', "(Don't) Spill the Tea", 'Clear Tea Splasher in Chapter 7 for the first time.', 'milestone'),
  steam('mugen-train', 'Mugen Train', 'Complete Chapter 8: Mugen Train.', 'story', 'gold'),
  steam('the-hinokami-chronicles', 'The Hinokami Chronicles', 'Complete every chapter.', 'ending', 'gold'),
  steam('a-fast-learner', 'A Fast Learner', 'Clear a Rank 1 challenge in Training.', 'upgrade'),
  steam('one-of-a-kind', 'One of a Kind', 'Customize your Slayer ID.', 'collection'),
  steam('no-panel-unturned', 'No Panel Unturned', 'Unlock every panel of a single reward board, excluding Demons.', 'collection', 'silver'),
  steam('photogenic', 'Photogenic', 'Collect 200 profile photos, excluding downloadable content.', 'collection', 'silver'),
  steam('in-too-steep', 'In Too Steep', 'Earn an S rank in the Tea Splasher minigame on normal difficulty.', 'milestone', 'silver'),
  steam('memory-lane', 'Memory Lane', 'Collect 200 quotes, excluding downloadable content.', 'collection', 'silver'),
  steam('reminiscence', 'Reminiscence', 'View 25 memory fragments.', 'collection'),
  steam('audiophile', 'Audiophile', 'Collect 50 music tracks.', 'collection', 'silver'),
  steam('student-becomes-master', 'The Student Becomes The Master', 'Clear a Rank 10 challenge in Training.', 'upgrade', 'silver'),
  steam('chapter-1-rank-s', 'Chapter 1 Rank S', 'Earn an S rank in Chapter 1.', 'milestone', 'silver'),
  steam('chapter-2-rank-s', 'Chapter 2 Rank S', 'Earn an S rank in Chapter 2.', 'milestone', 'silver'),
  steam('chapter-4-rank-s', 'Chapter 4 Rank S', 'Earn an S rank in Chapter 4.', 'milestone', 'silver'),
  steam('a-lotta-hot-air', 'A Lotta Hot Air', 'Earn an S rank in the Gourd Breaker minigame on normal difficulty.', 'milestone', 'silver'),
  steam('chapter-3-rank-s', 'Chapter 3 Rank S', 'Earn an S rank in Chapter 3.', 'milestone', 'silver'),
  steam('never-forget', 'Never Forget', 'View 50 memory fragments.', 'collection', 'silver'),
  steam('chapter-5-rank-s', 'Chapter 5 Rank S', 'Earn an S rank in Chapter 5.', 'milestone', 'silver'),
  steam('special-agent', 'Special Agent', 'Earn S ranks on five special missions on normal difficulty.', 'milestone', 'silver'),
  steam('death-by-a-thousand-cuts', 'Death By a Thousand Cuts', 'Finish an opponent with a Light Attack: 5-Hit Combo in VS Mode.', 'milestone', 'silver'),
  steam('chapter-6-rank-s', 'Chapter 6 Rank S', 'Earn an S rank in Chapter 6.', 'milestone', 'silver'),
  steam('chapter-7-rank-s', 'Chapter 7 Rank S', 'Earn an S rank in Chapter 7.', 'milestone', 'silver'),
  steam('chapter-8-rank-s', 'Chapter 8 Rank S', 'Earn an S rank in Chapter 8.', 'milestone', 'gold'),
  steam('all-chapters-rank-s', 'All Chapters Rank S', 'Earn an S rank in all chapters.', 'milestone', 'gold'),
  steam('always-be-prepared', 'Always Be Prepared', "Clear 10 characters' Rank 10 challenges in Training.", 'upgrade', 'gold'),
  steam('overachiever', 'Overachiever', 'Unlock all achievements in Demon Slayer -Kimetsu no Yaiba- The Hinokami Chronicles.', 'milestone', 'platinum'),
  gamehub(
    'gamehub-story-run',
    'GameHub: Arco Hinokami completo',
    'Checklist pessoal para marcar Prologue, capitulos 1-8 e finalizacao da historia.',
    'story',
    10
  ),
  gamehub(
    'gamehub-rank-s-route',
    'GameHub: Rota Rank S',
    'Checklist pessoal para organizar Prologue, capitulos 1-8 e All Chapters Rank S.',
    'milestone',
    10
  ),
  gamehub(
    'gamehub-training-versus-route',
    'GameHub: Treino e Versus dominados',
    'Checklist pessoal para Training, VS Mode, combos, escape e finalizacoes.',
    'milestone',
    12
  ),
  gamehub(
    'gamehub-platinum-run',
    'GameHub: Platinado Hinokami',
    'Checklist manual para acompanhar as 47 conquistas oficiais mesmo jogando fora da Steam.',
    'milestone',
    47
  )
]

export const DEMON_SLAYER_CATALOG_ENTRIES: AchievementCatalogEntry[] = [
  {
    id: 'demon-slayer-hinokami-chronicles',
    matchers: {
      titles: [
        'demon slayer kimetsu no yaiba',
        'demon slayer kimetsu no yaiba the hinokami chronicles',
        'kimetsu no yaiba the hinokami chronicles',
        'hinokami chronicles'
      ],
      steamAppId: '1490890',
      exe: ['APK.exe'],
      pathIncludes: ['Demon Slayer - Kimetsu no Yaiba', 'Demon-Slayer-Kimetsu-no-Yaiba']
    },
    platforms: ['pc'],
    sourceLabel: 'Steam + GameHub · Demon Slayer: The Hinokami Chronicles',
    sourceUrl: 'https://steamcommunity.com/stats/1490890/achievements',
    achievements: DEMON_SLAYER_HINOKAMI_ACHIEVEMENTS
  }
]
