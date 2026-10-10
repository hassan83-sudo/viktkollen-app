import { useEffect, useReducer } from 'react'

import {
  createSlideshowState,
  estimateDurationMs,
  getSlideshowSpeed,
  slideshowReducer,
  slideshowSpeedOrder,
  slideshowSpeeds,
  slideshowStatus,
} from '../slideshow.js'

function formatSeconds(ms) {
  const seconds = ms / 1000
  return seconds < 10 ? seconds.toFixed(1).replace('.', ',') : String(Math.round(seconds))
}

export default function QuickCheckSlideshow({ items, onSpeedChange, speedId }) {
  const [state, dispatch] = useReducer(slideshowReducer, items.length, createSlideshowState)
  const speed = getSlideshowSpeed(speedId)
  const playing = state.status === slideshowStatus.playing

  useEffect(() => {
    dispatch({ itemCount: items.length, type: 'setItemCount' })
  }, [items.length])

  useEffect(() => {
    if (!playing) return undefined
    const timer = window.setTimeout(() => dispatch({ type: 'tick' }), speed.intervalMs)
    return () => window.clearTimeout(timer)
  }, [playing, state.index, speed.intervalMs])

  if (!items.length) {
    return (
      <section className="item-bank-slideshow is-empty">
        <p className="smart-camera-note">Välj saker i Sakbanken först. Sedan kan du köra Snabbkoll.</p>
      </section>
    )
  }

  const current = items[Math.min(state.index, items.length - 1)]
  const finished = state.status === slideshowStatus.finished
  const idle = state.status === slideshowStatus.idle

  return (
    <section className="item-bank-slideshow" aria-label="Snabbkoll">
      <div className="item-bank-speed" role="radiogroup" aria-label="Hastighet">
        {slideshowSpeedOrder.map((id) => (
          <button
            key={id}
            aria-checked={speed.id === id}
            className={speed.id === id ? 'is-active' : ''}
            role="radio"
            type="button"
            onClick={() => onSpeedChange?.(id)}
          >
            <strong>{slideshowSpeeds[id].label}</strong>
            <small>{slideshowSpeeds[id].hint}</small>
          </button>
        ))}
      </div>

      <div className={`item-bank-slide${finished ? ' is-finished' : ''}`} data-testid="item-bank-slide">
        {finished
          ? (
            <>
              <span className="item-bank-slide-icon" aria-hidden="true">✅</span>
              <strong className="item-bank-slide-name">Klart!</strong>
              <span className="item-bank-slide-meta">{items.length} saker genomgångna</span>
            </>
          )
          : (
            <>
              <span className="item-bank-slide-icon" aria-hidden="true">{current.icon}</span>
              <strong className="item-bank-slide-name" aria-live={playing ? 'off' : 'polite'}>{current.label}</strong>
              <span className="item-bank-slide-meta">
                {idle ? `${items.length} saker · ca ${formatSeconds(estimateDurationMs(items.length, speed.id))} sek` : `${state.index + 1} / ${items.length}`}
              </span>
            </>
          )}
      </div>

      <div
        className="item-bank-progress"
        role="progressbar"
        aria-label="Framsteg"
        aria-valuemax={items.length}
        aria-valuemin={0}
        aria-valuenow={finished ? items.length : idle ? 0 : state.index + 1}
      >
        <span style={{ width: `${((finished ? items.length : idle ? 0 : state.index + 1) / items.length) * 100}%` }} />
      </div>

      <div className="item-bank-controls">
        {idle && (
          <button className="primary-button" type="button" onClick={() => dispatch({ type: 'start' })}>▶ Starta</button>
        )}
        {playing && (
          <button className="primary-button" type="button" onClick={() => dispatch({ type: 'pause' })}>⏸ Pausa</button>
        )}
        {state.status === slideshowStatus.paused && (
          <button className="primary-button" type="button" onClick={() => dispatch({ type: 'resume' })}>▶ Fortsätt</button>
        )}
        {!idle && (
          <button className="secondary-button" type="button" onClick={() => dispatch({ type: 'restart' })}>↺ Starta om</button>
        )}
      </div>
    </section>
  )
}
