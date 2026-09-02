import { useRef, useState } from 'react'

import {
  forgottenCheckAiButtonLabel,
  forgottenCheckAiConsentCancelLabel,
  forgottenCheckAiConsentConfirmLabel,
  forgottenCheckAiFallbackNotice,
  forgottenCheckAiPrivacyNotice,
  forgottenCheckIntro,
  forgottenCheckResultDisclaimer,
  getForgottenCheckGuidance,
  getNextForgottenCheckGuidanceIndex,
  summarizeForgottenCheckResult,
} from '../forgottenCheckGuide.js'
import { createAnalysisApprovalKey, createOneShotAnalysisApproval } from '../../../services/security/oneShotAnalysisApproval.js'
import { analyzeForgottenItemsPhoto } from '../../../services/forgottenItemsAnalysis.js'
import SmartCameraLiveView from './SmartCameraLiveView.jsx'

/**
 * "Har jag glömt något?" - the dedicated guided flow.
 *
 * This mode owns its own small state machine (check -> result) instead of
 * sharing the generic checklist-editor screen used by "items"/"pack", so
 * selecting it from the hub goes straight into a real guided camera check:
 * the camera opens in place here, the user is told what to do, they show
 * their things, and "Kolla igen" / "Avsluta kontrollen" return to the
 * right place inside *this* flow - never back to the Smart kamera hub
 * unless the person explicitly asks to leave (onBack, wired to the shared
 * "Hubb" header button in SmartCameraModeViews and to the "Avsluta
 * kontrollen" button below).
 *
 * Opening this mode is the explicit camera request: SmartCameraLiveView
 * auto-starts the local preview here (other Smart Camera modes keep the
 * "Starta kamera" gate). The MediaStream is torn down whenever this
 * component stops rendering it - leaving the check step (stage becomes
 * "result") unmounts SmartCameraLiveView, which runs its own stop/cleanup
 * effect, exactly like closing the mode entirely does. The browser still
 * owns getUserMedia permission; optional remote AI still requires a
 * separate per-photo consent tap.
 *
 * MANUAL CHECK (always available, always local): every "identifierad" tap
 * on a chip below marks that item as shown by the person themselves - the
 * video frame is never inspected for this, and nothing is ever uploaded
 * for it. This is the permanent fallback: it keeps working exactly the
 * same whether or not the optional AI check below is ever used, is
 * unavailable, is declined, or fails.
 *
 * OPTIONAL REMOTE AI CHECK ("Kontrollera saker"): a SEPARATE, explicit,
 * per-photo action. Tapping it captures exactly one still frame (via
 * SmartCameraLiveView's captureFrame(), never a live stream or recording)
 * and shows the privacy notice below before anything is sent. Only the
 * "Skicka bilden för analys" tap actually authorizes sending that one
 * frame - this is the one-shot approval step
 * (services/security/oneShotAnalysisApproval.js), keyed to the exact
 * captured frame object so a later, different frame can never reuse an
 * old approval. Sending itself goes through
 * services/forgottenItemsAnalysis.js, which requires a fresh HMAC
 * consent token from the server (api/_shared/analysisConsent.js, purpose
 * "forgotten-items-analysis") bound to this image's exact byte hash, this
 * user, and a two-minute expiry, exactly like every other remote analysis
 * flow in the app. That service call fails closed for any reason
 * whatsoever (declined, offline, no auth, server misconfigured, AI error,
 * timeout, malformed AI reply) and this component only ever reacts to its
 * { ok: false } result by showing forgottenCheckAiFallbackNotice and
 * leaving the manual check exactly as it was - never by claiming
 * something is missing.
 *
 * RESULT MODEL: summarizeForgottenCheckResult (forgottenCheckGuide.js)
 * merges manual taps and any AI statuses collected so far into
 * identified / uncertain / not_confirmed, always defaulting an unclear or
 * missing AI answer to not_confirmed - never to identified. "Kan inte
 * bekräfta" below shows both uncertain and not_confirmed items, each with
 * its own honest message; nothing here is ever phrased as a definite
 * "glömt" claim (see itemVisibility.js's assertNoMissingClaim, used by
 * the targeted tests for this file).
 */
export default function ForgottenItemsCheck({ list, onBack, onCameraActive }) {
  const [stage, setStage] = useState('check')
  const [visibleIds, setVisibleIds] = useState([])
  const [guidanceIndex, setGuidanceIndex] = useState(0)
  const [cameraActive, setCameraActive] = useState(false)
  const [pendingCanvas, setPendingCanvas] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNotice, setAiNotice] = useState('')
  const [aiStatusesById, setAiStatusesById] = useState(null)
  const liveViewRef = useRef(null)
  const approvalRef = useRef(createOneShotAnalysisApproval())
  const items = list?.items || []
  const guidance = getForgottenCheckGuidance(guidanceIndex)
  const result = summarizeForgottenCheckResult(items, visibleIds, aiStatusesById)
  const uncertainItems = result.uncertain || []

  function handleCameraActive(active) {
    setCameraActive(active)
    onCameraActive?.(active)
  }

  function toggleShown(itemId) {
    setVisibleIds((current) => {
      const isShown = current.includes(itemId)
      const next = isShown ? current.filter((id) => id !== itemId) : [...current, itemId]
      if (!isShown) setGuidanceIndex((index) => getNextForgottenCheckGuidanceIndex(index))
      return next
    })
  }

  // Step 1 of the AI check: capture one frame and hold it, unsent, until
  // the person explicitly approves sending it (confirmAiCheck below).
  // Nothing is sent to the network here.
  function requestAiCheck() {
    setAiNotice('')
    const canvas = liveViewRef.current?.captureFrame?.()
    if (!canvas) {
      setAiNotice(forgottenCheckAiFallbackNotice)
      return
    }
    approvalRef.current.clear()
    setPendingCanvas(canvas)
  }

  function cancelAiCheck() {
    approvalRef.current.clear()
    setPendingCanvas(null)
  }

  // Step 2: the actual, explicit, per-photo approval. consume() only
  // returns true once for this exact captured frame - a second call with
  // the same key (or any call without a matching approve() first) returns
  // false, so this can never authorize more than the one frame the person
  // just saw the privacy notice for.
  async function confirmAiCheck() {
    const canvas = pendingCanvas
    if (!canvas || aiBusy) return
    const key = createAnalysisApprovalKey([{ label: 'forgotten-items-frame', source: canvas }])
    approvalRef.current.approve(key)
    const consentApproved = approvalRef.current.consume(key)
    setPendingCanvas(null)
    if (!consentApproved) {
      setAiNotice(forgottenCheckAiFallbackNotice)
      return
    }

    setAiBusy(true)
    const response = await analyzeForgottenItemsPhoto({ canvas, consentApproved, items })
    setAiBusy(false)

    if (!response.ok) {
      setAiNotice(forgottenCheckAiFallbackNotice)
      return
    }

    setAiNotice('')
    setAiStatusesById((current) => {
      const next = { ...(current || {}) }
      response.result.items.forEach((entry) => {
        next[entry.id] = entry.status
      })
      return next
    })
  }

  if (stage === 'result') {
    return (
      <div className="smart-camera-forgotten-result">
        <p className="smart-camera-note">{forgottenCheckResultDisclaimer}</p>
        <p className="smart-camera-forgotten-summary">{result.summary}</p>
        <section className="smart-camera-compare">
          <h3>Kontrollerat</h3>
          {result.seen.length
            ? result.seen.map((item) => <p key={item.id}>✓ {item.label}</p>)
            : <p>Inget bekräftat ännu.</p>}
          <h3>Kan inte bekräfta</h3>
          {(uncertainItems.length || result.check.length)
            ? (
              <>
                {uncertainItems.map((item) => <p key={item.id}>? {item.message}</p>)}
                {result.check.map((item) => <p key={item.id}>? {item.message}</p>)}
              </>
            )
            : <p>Allt på listan är bekräftat.</p>}
        </section>
        <div className="smart-camera-row">
          <button className="primary-button" type="button" onClick={() => setStage('check')}>Kolla igen</button>
          <button className="secondary-button" type="button" onClick={onBack}>Avsluta kontrollen</button>
        </div>
      </div>
    )
  }

  return (
    <div className="smart-camera-forgotten-check">
      <p className="smart-camera-note">{forgottenCheckIntro}</p>
      <SmartCameraLiveView ref={liveViewRef} autoStart enabled facingMode="environment" onActiveChange={handleCameraActive} />
      <p className="smart-camera-forgotten-guidance" aria-live="polite" data-voice-guidance="true">
        {guidance.phrase}
      </p>
      {items.length === 0 ? (
        <p className="smart-camera-note">
          Din lista över saker att ta med är tom. Lägg till punkter under "Vad har jag med mig?" eller "Göra mig klar" så visas de här.
        </p>
      ) : (
        <nav className="smart-camera-mode-grid smart-camera-forgotten-items" aria-label="Saker att visa för kameran">
          {items.map((item) => {
            const shown = visibleIds.includes(item.id)
            const aiStatus = aiStatusesById?.[item.id]
            const aiHint = shown
              ? ''
              : aiStatus === 'identified'
                ? 'AI: identifierad'
                : aiStatus === 'uncertain'
                  ? 'AI: osäker'
                  : ''
            return (
              <button
                key={item.id}
                aria-pressed={shown}
                className={`smart-camera-mode-chip${shown ? ' is-marked' : ''}`}
                type="button"
                onClick={() => toggleShown(item.id)}
              >
                <span aria-hidden="true">{shown ? '✓' : '?'}</span>
                <strong>{item.label}</strong>
                <small>{shown ? 'Markerad som visad' : (aiHint || 'Jag visar den här')}</small>
              </button>
            )
          })}
        </nav>
      )}
      <p className="smart-camera-note">
        Att ett föremål inte är markerat betyder inte att du har glömt det - det betyder bara att du inte visat det för kameran än.
      </p>
      {items.length > 0 && !pendingCanvas && (
        <div className="smart-camera-row">
          <button
            className="secondary-button"
            disabled={!cameraActive || aiBusy}
            type="button"
            onClick={requestAiCheck}
          >
            {aiBusy ? 'Analyserar...' : forgottenCheckAiButtonLabel}
          </button>
        </div>
      )}
      {pendingCanvas && (
        <div className="smart-camera-forgotten-ai-consent">
          <p className="smart-camera-note">{forgottenCheckAiPrivacyNotice}</p>
          <div className="smart-camera-row">
            <button className="primary-button" type="button" onClick={confirmAiCheck}>{forgottenCheckAiConsentConfirmLabel}</button>
            <button className="secondary-button" type="button" onClick={cancelAiCheck}>{forgottenCheckAiConsentCancelLabel}</button>
          </div>
        </div>
      )}
      {aiNotice && <p className="smart-camera-note">{aiNotice}</p>}
      {items.length > 0 && (
        <div className="smart-camera-row">
          <button className="primary-button" type="button" onClick={() => setStage('result')}>Se resultat</button>
        </div>
      )}
    </div>
  )
}
