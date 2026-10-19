// Deliberately a small text-only format, not HTML or a Markdown interpreter.
// Model text is always a React text child; links, images and tags stay literal.
function paragraphChunks(text, language) {
  if (text.length < 360 || typeof Intl.Segmenter !== 'function') return [text]
  const sentences = [...new Intl.Segmenter(language, { granularity: 'sentence' }).segment(text)].map((part) => part.segment)
  const chunks = []
  for (let index = 0; index < sentences.length; index += 3) chunks.push(sentences.slice(index, index + 3).join(''))
  return chunks
}

export default function HelpAnswer({ text = '', language = 'sv' }) {
  const blocks = []
  let lines = []
  let list = null
  let listStart = 1
  function flush() {
    if (lines.length) {
      const content = lines.join('\n')
      if (list) {
        const Tag = list === 'ordered' ? 'ol' : 'ul'
        blocks.push(<Tag key={blocks.length} start={list === 'ordered' ? listStart : undefined}>{lines.map((line, index) => <li key={index}>{line}</li>)}</Tag>)
      } else {
        for (const chunk of paragraphChunks(content, language)) blocks.push(<p key={blocks.length}>{chunk}</p>)
      }
    }
    lines = []; list = null
  }
  for (const raw of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    const heading = /^#{1,4}\s+(.+)$/.exec(line)
    const bullet = /^[-*•]\s+(.+)$/.exec(line)
    const ordered = /^(\d+)[.)]\s+(.+)$/.exec(line)
    if (!line || heading) {
      flush()
      if (heading) blocks.push(<h3 key={blocks.length}>{heading[1]}</h3>)
      continue
    }
    const kind = bullet ? 'unordered' : ordered ? 'ordered' : null
    if (kind !== list) { flush(); if (ordered) listStart = Number(ordered[1]) }
    list = kind
    lines.push(bullet?.[1] || ordered?.[2] || raw)
  }
  flush()
  return <div className="ai-help-answer" lang={language}>{blocks}</div>
}
