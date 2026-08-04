import { useMemo, useState } from 'react'
import { buildSocialModel } from '../services/social/socialEngine.js'

function Metric({ label, value, note }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  )
}

function FriendList({ friends }) {
  if (!friends.length) return <p>Inga vänner är tillagda i den lokala modellen ännu.</p>

  return (
    <ul className="social-list">
      {friends.map((friend) => (
        <li key={friend.id}>
          <strong>{friend.displayName}</strong>
          <span>{friend.accountabilityPartner ? 'Accountability partner' : friend.status}</span>
        </li>
      ))}
    </ul>
  )
}

function SharePreview({ preview }) {
  return (
    <article className="social-card">
      <h3>Share preview</h3>
      <p>{preview.previewText}</p>
      <small>Token: {preview.token.id}. Lokal modell, ingen nätverkssändning.</small>
    </article>
  )
}

function LeaderboardPreview({ leaderboard }) {
  if (!leaderboard.enabled) {
    return (
      <article className="social-card">
        <h3>Leaderboard</h3>
        <p>{leaderboard.reason}</p>
      </article>
    )
  }

  return (
    <article className="social-card">
      <h3>Opt-in leaderboard</h3>
      <p>{leaderboard.reason}</p>
      <ul className="social-list">
        {leaderboard.entries.map((entry) => (
          <li key={entry.friendId}>
            <strong>{entry.displayName}</strong>
            <span>{entry.score} · {entry.metric}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

export default function SocialCenter({
  adaptiveCoachFeedback = {},
  analysisDate,
  checkIn,
  goalsHabits = {},
  healthSnapshot,
  meals = [],
  profile = {},
  reminderState = {},
  weights = [],
}) {
  const [socialState, setSocialState] = useState({
    friends: [],
    invites: [],
    privacy: {
      achievementSharing: 'shared',
      leaderboardOptIn: false,
      progressSharing: 'private',
      shareDisplayName: 'Viktkollen-användare',
      weeklySummarySharing: 'private',
    },
    sharedChallenges: [],
    sharedGoals: [],
  })
  const model = useMemo(() => buildSocialModel({
    adaptiveCoachFeedback,
    checkIn,
    goalsHabits,
    healthSnapshot,
    meals,
    profile,
    reminderState,
    socialState,
    weights,
  }, { analysisDate }), [
    adaptiveCoachFeedback,
    analysisDate,
    checkIn,
    goalsHabits,
    healthSnapshot,
    meals,
    profile,
    reminderState,
    socialState,
    weights,
  ])

  function toggleLeaderboard() {
    setSocialState((current) => ({
      ...current,
      privacy: {
        ...current.privacy,
        leaderboardOptIn: !current.privacy.leaderboardOptIn,
      },
    }))
  }

  function addLocalInvite() {
    setSocialState((current) => ({
      ...current,
      invites: [
        ...current.invites,
        {
          createdAt: new Date().toISOString(),
          id: `invite-${current.invites.length + 1}`,
          recipientHint: 'Privat länk',
          status: 'draft',
          visibility: 'shared',
        },
      ],
    }))
  }

  return (
    <section className="panel social-center" id="social-center" aria-labelledby="social-center-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Social & Accountability V1</p>
          <h2 id="social-center-heading">Socialt stöd</h2>
          <span>Lokala previews, privacy först och ingen social press.</span>
        </div>
      </div>

      <div className="summary-grid">
        <Metric label="Vänner" value={model.summary.friendCount} note={`${model.summary.pendingInviteCount} inbjudningar`} />
        <Metric label="Partner" value={model.accountability.partnerCount} note={model.accountability.text} />
        <Metric label="Delade mål" value={model.summary.sharedGoalCount} note={`${model.sharing.sharedChallengeCount} challenges`} />
        <Metric label="Privacy" value={model.privacyReadiness.privateByDefault ? 'Private first' : 'Delning aktiv'} note={model.privacyReadiness.label} />
      </div>

      <div className="content-grid">
        <article className="social-card">
          <h3>Privacy controls</h3>
          <p>Progress: {model.privacy.progressSharing}. Veckosummering: {model.privacy.weeklySummarySharing}. Achievements: {model.privacy.achievementSharing}.</p>
          <label className="toggle-row">
            <input type="checkbox" checked={model.leaderboard.enabled} onChange={toggleLeaderboard} />
            <span>Aktivera trygg opt-in leaderboard</span>
          </label>
        </article>

        <article className="social-card">
          <h3>Invite system</h3>
          <p>{model.friends.pendingInviteCount} lokala inbjudningar väntar. Inga länkar skickas automatiskt.</p>
          <button className="secondary-button" type="button" onClick={addLocalInvite}>
            Skapa lokal invite
          </button>
        </article>

        <article className="social-card">
          <h3>Vänner och partners</h3>
          <FriendList friends={model.friends.friends} />
        </article>

        <SharePreview preview={model.sharing.weeklyPreview} />
        <SharePreview preview={model.sharing.achievementPreview} />
        <LeaderboardPreview leaderboard={model.leaderboard} />
      </div>
    </section>
  )
}
