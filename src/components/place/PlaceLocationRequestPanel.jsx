import { useEffect, useMemo, useState } from 'react'
import { displayNameForUser } from '../../features/place/placeFamilyMemberService.js'
import {
  acceptFamilyInvite,
  createFamilyInvite,
  loadFamilyAccessState,
} from '../../features/place/placeFamilyAccessService.js'
import {
  loadLocationRequests,
  respondToLocationRequest,
  sendLocationRequest,
  subscribeLocationRequests,
} from '../../features/place/placeLocationRequestService.js'

function PlaceLocationRequestPanel({ familyMembers, userId, sharingEnabled }) {
  const [requests, setRequests] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [familyAccessLoaded, setFamilyAccessLoaded] = useState(false)
  const [hasFamily, setHasFamily] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteExpiresAt, setInviteExpiresAt] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [familyBusy, setFamilyBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      const result = await loadLocationRequests()
      if (cancelled) return
      setRequests(Array.isArray(result.data) ? result.data : [])
      setError(result.error?.message || '')
      setLoaded(true)
    }

    refresh()
    const unsubscribe = subscribeLocationRequests(refresh)

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    loadFamilyAccessState().then((result) => {
      if (cancelled) return
      setHasFamily(Boolean(result.data?.hasFamily))
      if (result.error) setError(result.error.message || 'Familjekopplingen kunde inte kontrolleras.')
      setFamilyAccessLoaded(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const pendingIncoming = useMemo(
    () => requests.filter((request) => request.status === 'pending' && request.target_user_id === userId),
    [requests, userId],
  )

  const pendingOutgoingKeys = useMemo(
    () => new Set(
      requests
        .filter((request) => request.status === 'pending' && request.requester_user_id === userId)
        .map((request) => `${request.family_id}:${request.target_user_id}`),
    ),
    [requests, userId],
  )

  const otherMembers = useMemo(
    () => (familyMembers || []).filter((member) => member.user_id !== userId),
    [familyMembers, userId],
  )

  async function handleCreateInvite() {
    if (familyBusy) return

    setFamilyBusy(true)
    setError('')
    setNotice('')
    const result = await createFamilyInvite()

    if (result.error) {
      setError(result.error.message || 'Inbjudningskoden kunde inte skapas.')
    } else if (result.data?.invite_code) {
      setHasFamily(true)
      setInviteCode(result.data.invite_code)
      setInviteExpiresAt(result.data.expires_at || '')
      setNotice('Koden är klar. Ge den bara till personen du vill lägga till i familjen.')
    }

    setFamilyBusy(false)
  }

  async function handleJoinFamily(event) {
    event.preventDefault()
    if (familyBusy || !joinCode.trim()) return

    setFamilyBusy(true)
    setError('')
    setNotice('')
    const result = await acceptFamilyInvite(joinCode)

    if (result.error) {
      setError(result.error.message?.includes('Invalid or expired')
        ? 'Koden är fel, utgången eller redan använd.'
        : (result.error.message || 'Familjen kunde inte anslutas.'))
      setFamilyBusy(false)
      return
    }

    setHasFamily(true)
    setJoinCode('')
    setNotice('Familjen är ansluten. Viktkollen uppdateras nu.')
    setFamilyBusy(false)
    window.setTimeout(() => window.location.reload(), 500)
  }

  async function handleSend(member) {
    const key = `${member.family_id}:${member.user_id}`
    if (busyId || pendingOutgoingKeys.has(key)) return

    setBusyId(key)
    setError('')
    setNotice('')
    const result = await sendLocationRequest({ familyId: member.family_id, targetUserId: member.user_id })

    if (result.error) {
      setError(result.error.code === '23505' ? 'Förfrågan är redan skickad.' : (result.error.message || 'Förfrågan kunde inte skickas.'))
    } else if (result.data) {
      setRequests((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)])
      setNotice(`Platsförfrågan skickad till ${displayNameForUser(familyMembers, member.user_id)}.`)
    }

    setBusyId('')
  }

  async function handleResponse(request, response) {
    if (busyId) return

    setBusyId(request.id)
    setError('')
    setNotice('')
    const result = await respondToLocationRequest(request.id, response)

    if (result.error) {
      setError(result.error.message || 'Svaret kunde inte sparas.')
    } else if (result.data) {
      setRequests((current) => current.map((item) => (item.id === result.data.id ? result.data : item)))
      if (response === 'accepted') {
        setNotice(sharingEnabled
          ? 'Förfrågan godkänd. Din aktiva platsdelning fortsätter enligt dina inställningar.'
          : 'Förfrågan godkänd. Ingen plats delas förrän du själv slår på platsdelning.')
      } else {
        setNotice('Förfrågan avvisad. Ingen plats delas.')
      }
    }

    setBusyId('')
  }

  return (
    <section className="place-card place-location-request-panel" aria-labelledby="place-location-request-title">
      <div className="place-family-access">
        <h2>👨‍👩‍👧 Familjekoppling</h2>
        <p><small>Konton kopplas inte automatiskt. En person skapar en kod och den andra skriver in koden för att gå med.</small></p>

        {familyAccessLoaded ? (
          <p><strong>{hasFamily ? 'Du är kopplad till en familj.' : 'Du är inte kopplad till någon familj ännu.'}</strong></p>
        ) : <p><small>Kontrollerar familjekoppling…</small></p>}

        <button type="button" disabled={familyBusy} onClick={handleCreateInvite}>
          {familyBusy ? 'Arbetar…' : hasFamily ? 'Skapa inbjudningskod' : 'Skapa familj och inbjudningskod'}
        </button>

        {inviteCode ? (
          <div className="place-family-invite-code" role="status">
            <p><strong>Inbjudningskod: {inviteCode}</strong></p>
            <p><small>Koden kan användas en gång{inviteExpiresAt ? ` och gäller till ${new Date(inviteExpiresAt).toLocaleString()}` : ''}.</small></p>
          </div>
        ) : null}

        <form onSubmit={handleJoinFamily}>
          <label>
            Gå med med kod
            <input
              type="text"
              value={joinCode}
              maxLength={8}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="8 tecken"
              onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </label>
          <button type="submit" disabled={familyBusy || joinCode.length !== 8}>Gå med i familjen</button>
        </form>
      </div>

      <hr />
      <h2 id="place-location-request-title">📍 Platsförfrågan</h2>
      <p><small>Be en familjemedlem att frivilligt dela sin plats. En förfrågan startar aldrig platsdelning automatiskt.</small></p>

      {pendingIncoming.length > 0 ? (
        <div className="place-location-request-incoming">
          <p><strong>Förfrågningar till dig</strong></p>
          {pendingIncoming.map((request) => (
            <div key={request.id} className="place-location-request-row">
              <span>{displayNameForUser(familyMembers, request.requester_user_id)} vill be om din plats.</span>
              <div>
                <button type="button" disabled={busyId === request.id} onClick={() => handleResponse(request, 'accepted')}>Godkänn</button>{' '}
                <button type="button" disabled={busyId === request.id} onClick={() => handleResponse(request, 'declined')}>Avvisa</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {otherMembers.length > 0 ? (
        <div className="place-location-request-members">
          <p><strong>Be om plats</strong></p>
          {otherMembers.map((member) => {
            const key = `${member.family_id}:${member.user_id}`
            const pending = pendingOutgoingKeys.has(key)
            return (
              <div key={key} className="place-location-request-row">
                <span>{displayNameForUser(familyMembers, member.user_id)}</span>
                <button type="button" disabled={pending || Boolean(busyId)} onClick={() => handleSend(member)}>
                  {pending ? 'Förfrågan skickad' : busyId === key ? 'Skickar…' : 'Be om plats'}
                </button>
              </div>
            )
          })}
        </div>
      ) : <p><small>Ingen annan familjemedlem är ansluten ännu.</small></p>}

      {notice ? <p role="status"><strong>{notice}</strong></p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}

export default PlaceLocationRequestPanel
