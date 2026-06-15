import { isSupabaseConfigured, supabase } from './supabase.js'

const localBattleKey = 'pluggarena.battles'
const localResultKey = 'pluggarena.battleResults'
const scoreToWin = 10

function migrateDemoNames(value) {
  const legacyNames = {
    [['A', 'li'].join('')]: 'Optical',
    [['Em', 'ma'].join('')]: 'Rana',
  }

  if (typeof value === 'string' && legacyNames[value]) {
    return legacyNames[value]
  }

  if (Array.isArray(value)) {
    return value.map(migrateDemoNames)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, migrateDemoNames(entry)]),
    )
  }

  return value
}

function readLocal(key, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    const parsedValue = value ? migrateDemoNames(JSON.parse(value)) : fallback

    if (value) {
      window.localStorage.setItem(key, JSON.stringify(parsedValue))
    }

    return parsedValue
  } catch {
    return fallback
  }
}

function writeLocal(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent('pluggarena:battle-change'))
}

function createCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(
    { length: 6 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('')
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function mapBattle(row) {
  if (!row) {
    return null
  }

  return {
    code: row.code,
    createdAt: row.created_at,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    creatorScore: row.creator_score,
    creatorXpAwarded: row.creator_xp_awarded,
    finishedAt: row.finished_at,
    id: row.id,
    opponentId: row.opponent_id,
    opponentName: row.opponent_name,
    opponentScore: row.opponent_score,
    opponentXpAwarded: row.opponent_xp_awarded,
    status: row.status,
    subject: row.subject,
    winnerId: row.winner_id,
  }
}

function toBattleRow(battle) {
  return {
    code: battle.code,
    created_at: battle.createdAt,
    creator_id: battle.creatorId,
    creator_name: battle.creatorName,
    creator_score: battle.creatorScore,
    creator_xp_awarded: battle.creatorXpAwarded,
    finished_at: battle.finishedAt,
    id: battle.id,
    opponent_id: battle.opponentId,
    opponent_name: battle.opponentName,
    opponent_score: battle.opponentScore,
    opponent_xp_awarded: battle.opponentXpAwarded,
    status: battle.status,
    subject: battle.subject,
    winner_id: battle.winnerId,
  }
}

function getLocalBattles() {
  return readLocal(localBattleKey, [])
}

function saveLocalBattle(battle) {
  const battles = getLocalBattles()
  const nextBattles = [
    battle,
    ...battles.filter((entry) => entry.id !== battle.id),
  ]
  writeLocal(localBattleKey, nextBattles)
  return battle
}

function getOutcome(battle, userId) {
  if (!battle || battle.status !== 'completed') {
    return null
  }

  if (!battle.winnerId) {
    return 'draw'
  }

  return battle.winnerId === userId ? 'win' : 'loss'
}

export function getBattleXp(outcome) {
  if (outcome === 'win') {
    return 500
  }

  if (outcome === 'draw') {
    return 250
  }

  return 100
}

export async function createBattle({ subject, user }) {
  const battle = {
    code: createCode(),
    createdAt: new Date().toISOString(),
    creatorId: user.id,
    creatorName: user.name,
    creatorScore: 0,
    creatorXpAwarded: false,
    finishedAt: null,
    id: createId(),
    opponentId: null,
    opponentName: null,
    opponentScore: 0,
    opponentXpAwarded: false,
    status: 'waiting',
    subject,
    winnerId: null,
  }

  if (!isSupabaseConfigured) {
    return saveLocalBattle(battle)
  }

  const { data, error } = await supabase
    .from('battles')
    .insert(toBattleRow(battle))
    .select()
    .single()

  if (error) {
    throw error
  }

  return mapBattle(data)
}

export async function joinBattle({ code, user }) {
  const normalizedCode = code.trim().toUpperCase()

  if (!isSupabaseConfigured) {
    const battle = getLocalBattles().find(
      (entry) => entry.code === normalizedCode && entry.status === 'waiting',
    )

    if (!battle) {
      throw new Error('Ingen väntande battle hittades med den koden.')
    }

    if (battle.creatorId === user.id) {
      throw new Error('Du kan inte gå med i din egen battle.')
    }

    return saveLocalBattle({
      ...battle,
      opponentId: user.id,
      opponentName: user.name,
      status: 'active',
    })
  }

  const { data: battle, error: findError } = await supabase
    .from('battles')
    .select('*')
    .eq('code', normalizedCode)
    .eq('status', 'waiting')
    .maybeSingle()

  if (findError) {
    throw findError
  }

  if (!battle) {
    throw new Error('Ingen väntande battle hittades med den koden.')
  }

  if (battle.creator_id === user.id) {
    throw new Error('Du kan inte gå med i din egen battle.')
  }

  const { data, error } = await supabase
    .from('battles')
    .update({
      opponent_id: user.id,
      opponent_name: user.name,
      status: 'active',
    })
    .eq('id', battle.id)
    .eq('status', 'waiting')
    .select()
    .single()

  if (error) {
    throw error
  }

  return mapBattle(data)
}

export async function getBattle(battleId) {
  if (!isSupabaseConfigured) {
    return getLocalBattles().find((battle) => battle.id === battleId) ?? null
  }

  const { data, error } = await supabase
    .from('battles')
    .select('*')
    .eq('id', battleId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return mapBattle(data)
}

export function subscribeToBattle(battleId, onChange) {
  if (!isSupabaseConfigured) {
    const handleChange = () => {
      getBattle(battleId).then(onChange)
    }

    window.addEventListener('storage', handleChange)
    window.addEventListener('pluggarena:battle-change', handleChange)

    return () => {
      window.removeEventListener('storage', handleChange)
      window.removeEventListener('pluggarena:battle-change', handleChange)
    }
  }

  const channel = supabase
    .channel(`battle:${battleId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'battles',
        filter: `id=eq.${battleId}`,
      },
      (payload) => onChange(mapBattle(payload.new)),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export async function submitCorrectAnswer({ battle, userId }) {
  const isCreator = battle.creatorId === userId
  const ownScore = isCreator ? battle.creatorScore : battle.opponentScore
  const otherScore = isCreator ? battle.opponentScore : battle.creatorScore
  const nextScore = Math.min(ownScore + 1, scoreToWin)
  const isDraw = nextScore >= scoreToWin && otherScore >= scoreToWin
  const isCompleted = nextScore >= scoreToWin
  const updates = {
    ...(isCreator
      ? { creatorScore: nextScore }
      : { opponentScore: nextScore }),
    ...(isCompleted
      ? {
        finishedAt: new Date().toISOString(),
        status: 'completed',
        winnerId: isDraw ? null : userId,
      }
      : {}),
  }

  if (!isSupabaseConfigured) {
    return saveLocalBattle({ ...battle, ...updates })
  }

  const rowUpdates = {
    ...(isCreator
      ? { creator_score: nextScore }
      : { opponent_score: nextScore }),
    ...(isCompleted
      ? {
        finished_at: updates.finishedAt,
        status: 'completed',
        winner_id: updates.winnerId,
      }
      : {}),
  }
  const { data, error } = await supabase
    .from('battles')
    .update(rowUpdates)
    .eq('id', battle.id)
    .eq('status', 'active')
    .select()
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ? mapBattle(data) : getBattle(battle.id)
}

async function saveLocalResult({ battle, outcome, userId, xp }) {
  const results = readLocal(localResultKey, [])
  const exists = results.some(
    (result) => result.battleId === battle.id && result.userId === userId,
  )

  if (!exists) {
    writeLocal(localResultKey, [
      {
        battleId: battle.id,
        createdAt: battle.finishedAt,
        opponentName:
          battle.creatorId === userId
            ? battle.opponentName
            : battle.creatorName,
        outcome,
        subject: battle.subject,
        userId,
        xp,
      },
      ...results,
    ])
  }
}

export async function claimBattleReward({ battle, userId }) {
  const isCreator = battle.creatorId === userId
  const alreadyAwarded = isCreator
    ? battle.creatorXpAwarded
    : battle.opponentXpAwarded

  if (alreadyAwarded) {
    return { battle, outcome: getOutcome(battle, userId), xp: 0 }
  }

  const outcome = getOutcome(battle, userId)
  const xp = getBattleXp(outcome)

  if (!isSupabaseConfigured) {
    const nextBattle = saveLocalBattle({
      ...battle,
      ...(isCreator
        ? { creatorXpAwarded: true }
        : { opponentXpAwarded: true }),
    })
    await saveLocalResult({ battle: nextBattle, outcome, userId, xp })
    return { battle: nextBattle, outcome, xp }
  }

  const awardedColumn = isCreator
    ? 'creator_xp_awarded'
    : 'opponent_xp_awarded'
  const { data, error } = await supabase
    .from('battles')
    .update({ [awardedColumn]: true })
    .eq('id', battle.id)
    .eq(awardedColumn, false)
    .select()
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return { battle, outcome, xp: 0 }
  }

  const opponentName =
    battle.creatorId === userId ? battle.opponentName : battle.creatorName

  const { error: resultError } = await supabase.from('battle_results').insert({
    battle_id: battle.id,
    opponent_name: opponentName,
    outcome,
    subject: battle.subject,
    user_id: userId,
    xp_awarded: xp,
  })

  if (resultError && resultError.code !== '23505') {
    throw resultError
  }

  const { data: results, error: statsError } = await supabase
    .from('battle_results')
    .select('outcome')
    .eq('user_id', userId)

  if (statsError) {
    throw statsError
  }

  const stats = results.reduce(
    (summary, result) => ({
      draws: summary.draws + (result.outcome === 'draw' ? 1 : 0),
      losses: summary.losses + (result.outcome === 'loss' ? 1 : 0),
      wins: summary.wins + (result.outcome === 'win' ? 1 : 0),
    }),
    { draws: 0, losses: 0, wins: 0 },
  )

  const { error: upsertError } = await supabase.from('battle_stats').upsert({
    draws: stats.draws,
    losses: stats.losses,
    updated_at: new Date().toISOString(),
    user_id: userId,
    wins: stats.wins,
  })

  if (upsertError) {
    throw upsertError
  }

  return { battle: mapBattle(data), outcome, xp }
}

export async function getBattleHistory(userId) {
  if (!isSupabaseConfigured) {
    return readLocal(localResultKey, [])
      .filter((result) => result.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  const { data, error } = await supabase
    .from('battle_results')
    .select('battle_id, created_at, opponent_name, outcome, subject, xp_awarded')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return data.map((result) => ({
    battleId: result.battle_id,
    createdAt: result.created_at,
    opponentName: result.opponent_name,
    outcome: result.outcome,
    subject: result.subject,
    userId,
    xp: result.xp_awarded,
  }))
}

export function summarizeBattleHistory(history) {
  const wins = history.filter((result) => result.outcome === 'win').length
  const losses = history.filter((result) => result.outcome === 'loss').length
  const draws = history.filter((result) => result.outcome === 'draw').length
  const total = history.length

  return {
    draws,
    losses,
    total,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    wins,
  }
}

export { scoreToWin }
