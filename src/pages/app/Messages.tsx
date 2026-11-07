import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import {
  checkPostImage, describe, fmtDate, postImageUrl, removePostImages, todayStr, unwrap, uploadPostImage, useLoad, useTeam,
} from '../../lib/data'
import { Chip, Dialog, EmptyState, Field, LoadState, PageHead, Rich } from '../../components/ui'
import { sectionByPath } from './sections'
import './pages.css'

export type Post = {
  id: string; title: string; body: string; image_paths: string[]; is_public: boolean
  posted_at: string; created_by: string; created_at: string
}

const dayOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Messages() {
  const s = sectionByPath('messages')
  const { name: who } = useTeam()
  const { data, error, loading, reload } = useLoad<Post[]>(async () =>
    unwrap<Post[]>(await supabase.from('posts').select('*').order('posted_at', { ascending: false })) ?? [])

  const [editing, setEditing] = useState<Post | 'new' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function remove(p: Post) {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return
    try {
      unwrap(await supabase.from('posts').delete().eq('id', p.id))
      await removePostImages(p.image_paths)
      reload()
    } catch (e) { setMsg(describe(e)) }
  }

  return (
    <div className="pg">
      <PageHead title={s.label} blurb={s.blurb} action={<button type="button" className="btn btn--dark" onClick={() => setEditing('new')}>New post</button>} />

      {msg && <p className="notice notice--err" role="alert">{msg}</p>}

      <LoadState loading={loading && !data} error={error}>
        {data && data.length === 0 ? (
          <EmptyState
            title="No posts yet."
            text="Write the first announcement. Public posts also appear on the landing page."
            action={<button type="button" className="btn btn--dark" onClick={() => setEditing('new')}>New post</button>}
          />
        ) : (
          (data ?? []).map((p) => (
            <article className="post" key={p.id}>
              <div className="post__top">
                <h2>{p.title}</h2>
                <div className="item__acts">
                  <button type="button" className="btn btn--sm" onClick={() => setEditing(p)}>Edit</button>
                  <button type="button" className="btn btn--sm btn--danger" onClick={() => remove(p)}>Delete</button>
                </div>
              </div>
              <div className="post__meta">
                <span>{fmtDate(p.posted_at)}</span>
                {who(p.created_by) && <span>by {who(p.created_by)}</span>}
                {dayOf(p.posted_at) < dayOf(p.created_at) && <Chip>Backdated</Chip>}
                <Chip on={p.is_public}>{p.is_public ? 'Public' : 'Team only'}</Chip>
              </div>
              <Rich text={p.body} />
              {p.image_paths.length > 0 && (
                <div className="post__imgs">
                  {p.image_paths.map((path) => (
                    <a key={path} href={postImageUrl(path)} target="_blank" rel="noopener noreferrer">
                      <img src={postImageUrl(path)} alt="" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </LoadState>

      <PostDialog value={editing} onClose={() => setEditing(null)} onDone={reload} />
    </div>
  )
}

function PostDialog({ value, onClose, onDone }: { value: Post | 'new' | null; onClose: () => void; onDone: () => void }) {
  const post = value && value !== 'new' ? value : null
  const [seq, setSeq] = useState(0) // bumping this resets the form for the next post
  const [carry, setCarry] = useState<string | null>(null)
  const close = () => { setCarry(null); onClose() }
  return (
    <Dialog open={!!value} onClose={close} title={post ? 'Edit post' : 'New post'}>
      {value && (
        <PostForm
          key={`${post?.id ?? 'new'}-${seq}`} post={post} defaultDate={carry}
          onClose={close} onDone={onDone}
          onAnother={(date) => { setCarry(date); setSeq((n) => n + 1) }}
        />
      )}
    </Dialog>
  )
}

function PostForm({
  post, defaultDate, onClose, onDone, onAnother,
}: {
  post: Post | null; defaultDate: string | null
  onClose: () => void; onDone: () => void; onAnother: (date: string) => void
}) {
  const [keep, setKeep] = useState<string[]>(post?.image_paths ?? [])
  const [files, setFiles] = useState<File[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const title = String(fd.get('title') ?? '').trim()
    const body = String(fd.get('body') ?? '')
    const date = String(fd.get('date') ?? '') || todayStr()
    const isPublic = fd.get('public') === 'on'
    if (!title) return setErr('Give the post a title.')
    if (keep.length + files.length > 8) return setErr('A post can have up to 8 images.')
    for (const f of files) { const bad = checkPostImage(f); if (bad) return setErr(bad) }

    // posted_at: unchanged date keeps the original time; today = now; any other day = midday that day
    let posted_at: string
    if (post && date === dayOf(post.posted_at)) posted_at = post.posted_at
    else if (date === todayStr()) posted_at = new Date().toISOString()
    else posted_at = new Date(`${date}T12:00:00`).toISOString()

    setBusy(true)
    const uploaded: string[] = []
    try {
      for (const f of files) uploaded.push(await uploadPostImage(f))
      const image_paths = [...keep, ...uploaded]
      if (post) {
        unwrap(await supabase.from('posts').update({ title, body, posted_at, is_public: isPublic, image_paths }).eq('id', post.id))
        await removePostImages(post.image_paths.filter((p) => !keep.includes(p)))
      } else {
        unwrap(await supabase.from('posts').insert({ title, body, posted_at, is_public: isPublic, image_paths }))
      }
      onDone()
      const again = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-again') === '1'
      if (again && !post) onAnother(date)
      else onClose()
    } catch (ex) {
      await removePostImages(uploaded)
      setErr(describe(ex))
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Title"><input type="text" name="title" autoFocus maxLength={200} defaultValue={post?.title ?? ''} /></Field>
      <Field label="Message" hint="Formatting: **bold**, *italic*, [text](https://link), start lines with - for a list. Leave a blank line between paragraphs.">
        <textarea name="body" rows={8} maxLength={20000} defaultValue={post?.body ?? ''} />
      </Field>
      <div className="row2">
        <Field label="Date" hint="Set an earlier date to backdate the post."><input type="date" name="date" defaultValue={post ? dayOf(post.posted_at) : defaultDate ?? todayStr()} /></Field>
        <Field label="Images" hint="PNG, JPEG or WebP, up to 10 MB each.">
          <input type="file" multiple accept=".png,.jpg,.jpeg,.webp" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </Field>
      </div>
      {keep.length > 0 && (
        <div className="thumbs" aria-label="Current images">
          {keep.map((p) => (
            <div className="thumb" key={p}>
              <img src={postImageUrl(p)} alt="" />
              <button type="button" aria-label="Remove image" onClick={() => setKeep(keep.filter((k) => k !== p))}>×</button>
            </div>
          ))}
        </div>
      )}
      <label className="check">
        <input type="checkbox" name="public" defaultChecked={post?.is_public ?? true} />
        Show on the public landing page
      </label>
      {err && <p className="formerr" role="alert">{err}</p>}
      <div className="dlg__foot">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        {!post && <button type="submit" data-again="1" className="btn" disabled={busy}>Publish and add another</button>}
        <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Saving…' : post ? 'Save changes' : 'Publish'}</button>
      </div>
    </form>
  )
}
