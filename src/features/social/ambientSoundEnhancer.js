const TRACKS = ['rain', 'ocean', 'piano', 'spa']
let context = null
let master = null
let nodes = []
let timer = null
let playing = false
let selected = 'rain'

function stop() {
  nodes.forEach((node) => { try { node.stop?.() } catch {} try { node.disconnect?.() } catch {} })
  nodes = []
  if (timer) clearTimeout(timer)
  timer = null
  playing = false
  syncButton()
}

function noiseBuffer(ctx, brown = false) {
  const length = ctx.sampleRate * 4
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1
    last = brown ? (last + 0.02 * white) / 1.02 : white
    data[i] = brown ? last * 3.5 : white
  }
  return buffer
}

function addNoise(ctx, type, frequency, gainValue) {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx, type === 'brown')
  source.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = frequency
  const gain = ctx.createGain()
  gain.gain.value = gainValue
  source.connect(filter).connect(gain).connect(master)
  source.start()
  nodes.push(source, filter, gain)
}

function addTone(ctx, frequency, gainValue, type = 'sine') {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = frequency
  gain.gain.value = gainValue
  osc.connect(gain).connect(master)
  osc.start()
  nodes.push(osc, gain)
}

function buildTrack(track) {
  const ctx = context
  if (track === 'rain') {
    addNoise(ctx, 'white', 5200, 0.22)
    addNoise(ctx, 'brown', 900, 0.11)
  } else if (track === 'ocean') {
    addNoise(ctx, 'brown', 700, 0.3)
    addTone(ctx, 0.12, 0.08)
  } else if (track === 'piano') {
    ;[261.63, 329.63, 392, 523.25].forEach((freq, index) => addTone(ctx, freq, 0.035 / (index + 1)))
    addTone(ctx, 130.81, 0.025, 'triangle')
  } else {
    addNoise(ctx, 'brown', 1200, 0.1)
    ;[174.61, 261.63, 349.23].forEach((freq) => addTone(ctx, freq, 0.025, 'sine'))
  }
}

function player() { return document.querySelector('.social-room-player') }
function playButton() { return player()?.querySelector('.social-room-player-controls button') }

function syncButton() {
  const button = playButton()
  if (!button) return
  button.disabled = false
  button.textContent = playing ? 'II' : '▶'
  button.setAttribute('aria-pressed', playing ? 'true' : 'false')
}

async function play() {
  if (!context) context = new (window.AudioContext || window.webkitAudioContext)()
  await context.resume()
  stop()
  master = context.createGain()
  const volume = Number(player()?.querySelector('input[type="range"]')?.value || 45)
  master.gain.value = Math.max(0, Math.min(1, volume / 100)) * 0.65
  master.connect(context.destination)
  buildTrack(selected)
  playing = true
  const pressedTimer = [...(player()?.querySelectorAll('.social-room-player-timers button') || [])].find((b) => b.getAttribute('aria-pressed') === 'true')
  const minutes = Number.parseInt(pressedTimer?.textContent || '15', 10) || 15
  timer = setTimeout(stop, minutes * 60 * 1000)
  syncButton()
}

function bind() {
  const root = player()
  if (!root || root.dataset.ambientBound === '1') return
  root.dataset.ambientBound = '1'
  const unavailable = [...root.querySelectorAll('small')].find((el) => /Inga godkända|No approved/i.test(el.textContent || ''))
  if (unavailable) unavailable.textContent = 'Välj ljudmiljö och tryck Play.'
  const button = playButton()
  if (button) {
    button.disabled = false
    button.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation()
      if (playing) stop(); else void play()
    }, true)
  }
  const options = [...root.querySelectorAll('.social-room-player-options button')]
  options.forEach((button, index) => button.addEventListener('click', () => {
    selected = TRACKS[index] || 'rain'
    if (playing) void play()
  }))
  const volume = root.querySelector('input[type="range"]')
  volume?.addEventListener('input', () => {
    if (master) master.gain.value = (Number(volume.value) / 100) * 0.65
  })
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const observer = new MutationObserver(bind)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true })
  else bind()
}
