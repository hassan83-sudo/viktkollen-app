import { useEffect, useState } from 'react'
import { supabase } from '../../../services/supabaseClient.js'
import '../SocialBoard.css'

const ADMIN_USER_ID = 'd449f4d1-d2c7-41fd-8c74-e8b1bbe46f89'

function SocialBoard() {
  const [posts, setPosts] = useState([])
  const [userId, setUserId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isAdmin = userId === ADMIN_USER_ID

  async function loadPosts() {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('social_board_posts')
      .select('id, title, body, created_at')
      .order('created_at', { ascending: false })

    if (loadError) {
      setError('Kunde inte hämta tavlan.')
      setPosts([])
    } else {
      setPosts(data || [])
      setError('')
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data?.user?.id || '')
    })
    loadPosts()
    return () => { cancelled = true }
  }, [])

  async function addPost(event) {
    event.preventDefault()
    if (!isAdmin || saving || !title.trim() || !body.trim()) return

    setSaving(true)
    const { error: insertError } = await supabase.from('social_board_posts').insert({
      title: title.trim().slice(0, 120),
      body: body.trim().slice(0, 4000),
      created_by: userId,
      enabled: true,
    })
    setSaving(false)

    if (insertError) {
      setError('Kunde inte lägga till inlägget.')
      return
    }

    setTitle('')
    setBody('')
    await loadPosts()
  }

  async function removePost(id) {
    if (!isAdmin) return
    const { error: deleteError } = await supabase.from('social_board_posts').delete().eq('id', id)
    if (deleteError) {
      setError('Kunde inte ta bort inlägget.')
      return
    }
    await loadPosts()
  }

  return (
    <article className="social-room-card is-wide social-board">
      <p className="social-room-eyebrow">FRÅN VIKTKOLLEN</p>
      <h2>Tavlan</h2>
      <p>Funktioner, instruktioner, säkerhet, integritet, driftinformation och frivilliga utmaningar visas här.</p>

      {isAdmin ? (
        <form className="social-board-admin" onSubmit={addPost}>
          <strong>Lägg till på tavlan</strong>
          <input type="text" maxLength={120} placeholder="Rubrik" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <textarea rows={6} maxLength={4000} placeholder="Skriv texten här. Du kan använda flera rader för steg-för-steg." value={body} onChange={(event) => setBody(event.target.value)} required />
          <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Lägger till…' : 'Lägg till'}</button>
        </form>
      ) : null}

      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p>Hämtar tavlan…</p> : null}

      <div className="social-board-list">
        {posts.map((post) => (
          <section className="social-board-post" key={post.id}>
            <div className="social-board-post-head">
              <h3>{post.title}</h3>
              {isAdmin ? <button className="secondary-button" type="button" onClick={() => removePost(post.id)}>Ta bort</button> : null}
            </div>
            <p className="social-board-body">{post.body}</p>
          </section>
        ))}
      </div>
    </article>
  )
}

export default SocialBoard
