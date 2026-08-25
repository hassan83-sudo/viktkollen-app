import { getSmartCameraPrivacyLayers } from '../../shared/privacy/privacyLayers.js'

export default function SmartCameraPrivacyCard({
  aiReceivesFrame = false,
  cameraActive = false,
  savedLabels = [],
  voiceToAi = false,
}) {
  const layers = getSmartCameraPrivacyLayers({ aiReceivesFrame, cameraActive, savedLabels, voiceToAi })

  return (
    <section className="smart-camera-privacy" aria-label="Vad kameran ser, vad AI får och vad som sparas">
      {Object.values(layers).map((layer) => (
        <article key={layer.id}>
          <strong>{layer.title}</strong>
          {layer.items.map((item) => (
            <p key={item}>{item}</p>
          ))}
          {layer.localOnly && <small>Lokalt</small>}
        </article>
      ))}
    </section>
  )
}
