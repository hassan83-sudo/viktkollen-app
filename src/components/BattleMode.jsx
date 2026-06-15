import { useEffect, useMemo, useRef, useState } from 'react'
import {
  claimBattleReward,
  createBattle,
  getBattleHistory,
  joinBattle,
  scoreToWin,
  submitCorrectAnswer,
  subscribeToBattle,
  summarizeBattleHistory,
} from '../lib/battles.js'

function BattleHistory({ history }) {
  const stats = summarizeBattleHistory(history)

  return (
    <section className="panel battle-history-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Battle History</p>
          <h2>Din statistik</h2>
        </div>
      </div>

      <div className="battle-stats-grid">
        <article>
          <span>Vinster</span>
          <strong>{stats.wins}</strong>
        </article>
        <article>
          <span>Förluster</span>
          <strong>{stats.losses}</strong>
        </article>
        <article>
          <span>Win rate</span>
          <strong>{stats.winRate}%</strong>
        </article>
      </div>

      <div className="battle-history-list">
        {history.length === 0 ? (
          <p className="battle-muted">Inga avslutade battles ännu.</p>
        ) : (
          history.slice(0, 6).map((result) => (
            <article key={`${result.battleId}-${result.userId}`}>
              <div>
                <strong>{result.opponentName || 'Motståndare'}</strong>
                <span>{result.subject}</span>
              </div>
              <div className={`battle-result ${result.outcome}`}>
                <strong>
                  {result.outcome === 'win'
                    ? 'Vinst'
                    : result.outcome === 'draw'
                      ? 'Oavgjort'
                      : 'Förlust'}
                </strong>
                <span>+{result.xp} XP</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

function BattleLobby({
  isBusy,
  joinCode,
  onCreate,
  onJoin,
  onJoinCodeChange,
  onSubjectChange,
  selectedSubject,
  subjects,
}) {
  return (
    <section className="panel battle-lobby-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Battle Lobby</p>
          <h2>Utmana en vän</h2>
        </div>
        <span className="score-pill">Först till {scoreToWin}</span>
      </div>

      <div className="battle-subjects" aria-label="Välj battle-ämne">
        {subjects.map((subject) => (
          <button
            className={subject === selectedSubject ? 'active' : ''}
            key={subject}
            onClick={() => onSubjectChange(subject)}
            type="button"
          >
            {subject}
          </button>
        ))}
      </div>

      <div className="battle-lobby-actions">
        <article>
          <span>Ny battle</span>
          <strong>Skapa en kod</strong>
          <p>Välj ämne och skicka koden till din motståndare.</p>
          <button type="button" onClick={onCreate} disabled={isBusy}>
            Skapa battle
          </button>
        </article>

        <form onSubmit={onJoin}>
          <span>Har du en kod?</span>
          <strong>Gå med i battle</strong>
          <label>
            <span>Battle-kod</span>
            <input
              aria-label="Battle-kod"
              maxLength="6"
              onChange={(event) => onJoinCodeChange(event.target.value)}
              placeholder="ABC123"
              value={joinCode}
            />
          </label>
          <button type="submit" disabled={isBusy || joinCode.length < 6}>
            Gå med
          </button>
        </form>
      </div>
    </section>
  )
}

function BattleScore({ battle, userId }) {
  const isCreator = battle.creatorId === userId
  const ownName = isCreator ? battle.creatorName : battle.opponentName
  const ownScore = isCreator ? battle.creatorScore : battle.opponentScore
  const opponentName = isCreator ? battle.opponentName : battle.creatorName
  const opponentScore = isCreator ? battle.opponentScore : battle.creatorScore

  return (
    <div className="battle-scoreboard" aria-label="Live score">
      <article className="current-player">
        <span>{ownName || 'Du'}</span>
        <strong>{ownScore}</strong>
        <div className="battle-score-track">
          <span style={{ width: `${(ownScore / scoreToWin) * 100}%` }} />
        </div>
      </article>
      <span className="battle-versus">VS</span>
      <article>
        <span>{opponentName || 'Väntar...'}</span>
        <strong>{opponentScore}</strong>
        <div className="battle-score-track opponent">
          <span style={{ width: `${(opponentScore / scoreToWin) * 100}%` }} />
        </div>
      </article>
    </div>
  )
}

function BattleMode({ onAwardXp, questionBank, subjects, user }) {
  const [selectedSubject, setSelectedSubject] = useState('Matematik')
  const [joinCode, setJoinCode] = useState('')
  const [battle, setBattle] = useState(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [rewardMessage, setRewardMessage] = useState('')
  const rewardClaimRef = useRef('')
  const questions = questionBank[battle?.subject || selectedSubject]
  const currentQuestion = questions[questionIndex % questions.length]
  const player = useMemo(
    () => ({ id: user.id, name: user.name }),
    [user.id, user.name],
  )

  useEffect(() => {
    let isMounted = true

    getBattleHistory(user.id)
      .then((results) => {
        if (isMounted) {
          setHistory(results)
        }
      })
      .catch((historyError) => {
        if (isMounted) {
          setError(historyError.message)
        }
      })

    return () => {
      isMounted = false
    }
  }, [user.id])

  useEffect(() => {
    if (!battle?.id) {
      return undefined
    }

    return subscribeToBattle(battle.id, (nextBattle) => {
      if (nextBattle) {
        setBattle(nextBattle)
      }
    })
  }, [battle?.id])

  useEffect(() => {
    if (battle?.status !== 'completed') {
      return
    }

    const isCreator = battle.creatorId === user.id
    const alreadyAwarded = isCreator
      ? battle.creatorXpAwarded
      : battle.opponentXpAwarded

    if (alreadyAwarded) {
      return
    }

    if (rewardClaimRef.current === battle.id) {
      return
    }

    rewardClaimRef.current = battle.id

    claimBattleReward({ battle, userId: user.id })
      .then(async ({ battle: nextBattle, outcome, xp }) => {
        setBattle(nextBattle)

        if (xp > 0) {
          onAwardXp(xp)
          setRewardMessage(
            `${outcome === 'win' ? 'Vinst' : outcome === 'draw' ? 'Oavgjort' : 'Förlust'}: +${xp} XP`,
          )
          setHistory(await getBattleHistory(user.id))
        }
      })
      .catch((rewardError) => {
        rewardClaimRef.current = ''
        setError(rewardError.message)
      })
  }, [battle, onAwardXp, user.id])

  async function handleCreate() {
    setIsBusy(true)
    setError('')
    setRewardMessage('')

    try {
      const nextBattle = await createBattle({
        subject: selectedSubject,
        user: player,
      })
      setBattle(nextBattle)
      setQuestionIndex(0)
    } catch (createError) {
      setError(createError.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleJoin(event) {
    event.preventDefault()
    setIsBusy(true)
    setError('')
    setRewardMessage('')

    try {
      const nextBattle = await joinBattle({ code: joinCode, user: player })
      setBattle(nextBattle)
      setSelectedSubject(nextBattle.subject)
      setQuestionIndex(0)
    } catch (joinError) {
      setError(joinError.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function chooseAnswer(option) {
    if (selectedAnswer || battle.status !== 'active') {
      return
    }

    const isCorrect = option === currentQuestion.answer
    setSelectedAnswer(option)
    setFeedback(isCorrect ? 'Rätt!' : `Fel. Rätt svar är ${currentQuestion.answer}.`)

    try {
      if (isCorrect) {
        const nextBattle = await submitCorrectAnswer({
          battle,
          userId: user.id,
        })
        setBattle(nextBattle)
      }
    } catch (answerError) {
      setError(answerError.message)
    }

    window.setTimeout(() => {
      setSelectedAnswer('')
      setFeedback('')
      setQuestionIndex((index) => index + 1)
    }, 900)
  }

  function resetBattle() {
    setBattle(null)
    setJoinCode('')
    setQuestionIndex(0)
    setSelectedAnswer('')
    setFeedback('')
    setRewardMessage('')
    rewardClaimRef.current = ''
  }

  const isCreator = battle?.creatorId === user.id
  const ownScore = battle
    ? isCreator
      ? battle.creatorScore
      : battle.opponentScore
    : 0
  const outcome =
    battle?.status === 'completed'
      ? !battle.winnerId
        ? 'Oavgjort'
        : battle.winnerId === user.id
          ? 'Du vann!'
          : 'Motståndaren vann'
      : ''

  return (
    <section className="battle-layout">
      {!battle ? (
        <BattleLobby
          isBusy={isBusy}
          joinCode={joinCode}
          onCreate={handleCreate}
          onJoin={handleJoin}
          onJoinCodeChange={(value) => setJoinCode(value.toUpperCase())}
          onSubjectChange={setSelectedSubject}
          selectedSubject={selectedSubject}
          subjects={subjects}
        />
      ) : (
        <section className="panel battle-game-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                {battle.subject} · Kod {battle.code}
              </p>
              <h2>
                {battle.status === 'waiting'
                  ? 'Väntar på motståndare'
                  : battle.status === 'completed'
                    ? outcome
                    : 'Battle pågår'}
              </h2>
            </div>
            <button className="battle-exit-button" type="button" onClick={resetBattle}>
              Lämna
            </button>
          </div>

          <BattleScore battle={battle} userId={user.id} />

          {battle.status === 'waiting' && (
            <div className="battle-waiting">
              <span>Battle-kod</span>
              <strong>{battle.code}</strong>
              <p>Skicka koden till en vän. Matchen startar automatiskt när de går med.</p>
            </div>
          )}

          {battle.status === 'active' && (
            <div className="battle-question">
              <div className="battle-question-meta">
                <span>Din poäng: {ownScore}/{scoreToWin}</span>
                <span>Fråga {questionIndex + 1}</span>
              </div>
              <h3>{currentQuestion.question}</h3>
              <div className="answer-grid">
                {currentQuestion.options.map((option) => {
                  const isCorrect =
                    selectedAnswer && option === currentQuestion.answer
                  const isWrong =
                    selectedAnswer === option && option !== currentQuestion.answer

                  return (
                    <button
                      className={`answer-button ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}
                      key={option}
                      onClick={() => chooseAnswer(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
              {feedback && <p className="feedback">{feedback}</p>}
            </div>
          )}

          {battle.status === 'completed' && (
            <div className="battle-complete">
              <strong>{outcome}</strong>
              <p>{rewardMessage || 'Resultatet sparas och din XP uppdateras.'}</p>
              <button type="button" onClick={resetBattle}>
                Till battle lobby
              </button>
            </div>
          )}
        </section>
      )}

      {error && <p className="battle-error">{error}</p>}
      <BattleHistory history={history} />
    </section>
  )
}

export default BattleMode
