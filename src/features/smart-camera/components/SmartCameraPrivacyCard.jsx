import { useTranslation } from 'react-i18next'
import { getSmartCameraPrivacyLayers } from '../../shared/privacy/privacyLayers.js'
import { smartCameraPrivacySv } from '../../../i18n/smartCameraHubResources.js'

const itemKeys = {
  [smartCameraPrivacySv.noCameraForAudio]: 'noCameraForAudio',
  [smartCameraPrivacySv.cameraLive]: 'cameraLive',
  [smartCameraPrivacySv.cameraOff]: 'cameraOff',
  [smartCameraPrivacySv.audioToServer]: 'audioToServer',
  [smartCameraPrivacySv.frameToAi]: 'frameToAi',
  [smartCameraPrivacySv.noFrameToAi]: 'noFrameToAi',
  [smartCameraPrivacySv.voiceToAi]: 'voiceToAi',
  [smartCameraPrivacySv.audioNotSaved]: 'audioNotSaved',
  [smartCameraPrivacySv.cameraNotSaved]: 'cameraNotSaved',
}

export default function SmartCameraPrivacyCard({
  aiReceivesFrame = false,
  audioToServer = false,
  cameraActive = false,
  savedLabels = [],
  voiceToAi = false,
}) {
  const { t } = useTranslation('home')
  const layers = getSmartCameraPrivacyLayers({ aiReceivesFrame, audioToServer, cameraActive, savedLabels, voiceToAi })
  const text = (key) => t(`smartCameraPrivacy.${key}`)

  return (
    <section className="smart-camera-privacy" aria-label={text('aria')}>
      {Object.values(layers).map((layer) => (
        <article key={layer.id}>
          <strong>{text(layer.id)}</strong>
          {layer.items.map((item) => (
            <p key={item}>{itemKeys[item] ? text(itemKeys[item]) : item}</p>
          ))}
          {layer.localOnly && <small>{text('local')}</small>}
        </article>
      ))}
    </section>
  )
}
