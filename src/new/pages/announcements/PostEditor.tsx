import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, ImagePlus, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { checkPostImage, describe, postImageUrl, todayStr, unwrap, uploadPostImage } from '../../../lib/data'
import { btn, btnGhost, btnPrimary, field, label } from '../calendar/cal'
import { PostView } from './PostView'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui/dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { Note } from '@/components/ui/note'

export type Post = {
  id: string; title: string; body: string; image_paths: string[]; is_public: boolean
  posted_at: string; created_by: string; created_at: string
}
export const dayOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MAX = 8
type Img = { key: string; path?: string; file?: File; url: string }

/** Create or edit an announcement, with a live preview, drag-and-drop images and image reordering. */
export function PostEditor({ post, onClose, onSaved }: { post: Post | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(post?.title ?? '')
  const [body, setBody] = useState(post?.body ?? '')
  const [date, setDate] = useState(post ? dayOf(post.posted_at) : todayStr())
  const [isPublic, setIsPublic] = useState(post?.is_public ?? true)
  const [imgs, setImgs] = useState<Img[]>(() => (post?.image_paths ?? []).map((p) => ({ key: p, path: p, url: postImageUrl(p) })))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const made = useRef<string[]>([])
  const pick = useRef<HTMLInputElement>(null)

  useEffect(() => () => made.current.forEach((u) => URL.revokeObjectURL(u)), [])

  function addFiles(list: FileList | File[]) {
    const files = Array.from(list)
    if (!files.length) return
    setErr(null)
    const room = MAX - imgs.length
    if (files.length > room) setErr(`A post can have up to ${MAX} images. ${room > 0 ? `Only the first ${room} were added.` : ''}`)
    const next: Img[] = []
    for (const f of files.slice(0, Math.max(0, room))) {
      const bad = checkPostImage(f)
      if (bad) { setErr(bad); continue }
      const url = URL.createObjectURL(f)
      made.current.push(url)
      next.push({ key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`, file: f, url })
    }
    if (next.length) setImgs((a) => [...a, ...next])
  }

  const move = (from: number, to: number) => setImgs((a) => {
    if (to < 0 || to >= a.length || from === to) return a
    const c = [...a]; const [x] = c.splice(from, 1); c.splice(to, 0, x); return c
  })

  const urls = useMemo(() => imgs.map((i) => i.url), [imgs])
  const backdated = !!post && dayOf(post.posted_at) < dayOf(post.created_at)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!title.trim()) return setErr('Give the post a title.')
    // posted_at: unchanged date keeps the original time; today = now; any other day = midday that day
    let posted_at: string
    if (post && date === dayOf(post.posted_at)) posted_at = post.posted_at
    else if (date === todayStr()) posted_at = new Date().toISOString()
    else posted_at = new Date(`${date}T12:00:00`).toISOString()

    setBusy(true); setErr(null)
    try {
      const image_paths: string[] = []
      for (const i of imgs) image_paths.push(i.path ?? (await uploadPostImage(i.file!)))
      const row = { title: title.trim(), body, posted_at, is_public: isPublic, image_paths }
      if (post) unwrap(await supabase.from('posts').update(row).eq('id', post.id))
      else unwrap(await supabase.from('posts').insert(row))
      onSaved()
    } catch (ex) {
      setErr(describe(ex))
      setBusy(false)
    }
  }

  const onDropFiles = (e: DragEvent) => {
    e.preventDefault(); setOver(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      variant="full"
      label={post ? 'Edit announcement' : 'New announcement'}
      bodyClassName="overflow-hidden p-0"
      header={
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className={btnGhost + ' !px-2'} aria-label="Close the editor"><X className="size-4" aria-hidden="true" /></button>
            <h2 className="text-sm font-medium">{post ? 'Edit announcement' : 'New announcement'}</h2>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={onClose}>Cancel</button>
            <button type="submit" form="post-form" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : post ? 'Save changes' : 'Publish'}</button>
          </div>
        </header>
      }
    >
      <div className="grid h-full min-h-0 lg:grid-cols-2">
        <form id="post-form" onSubmit={submit} className="min-h-0 overflow-y-auto px-5 py-8 sm:px-8 lg:border-r lg:border-border">
          <div className="mx-auto max-w-xl space-y-6">
            <div>
              <label className={label} htmlFor="p-title">Title</label>
              <input id="p-title" className={field + ' text-base'} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div>
              <label className={label} htmlFor="p-body">Message</label>
              <textarea id="p-body" className={field + ' min-h-52 resize-y leading-6'} value={body} maxLength={20000} onChange={(e) => setBody(e.target.value)} />
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                Formatting: **bold**, *italic*, [text](https://link), start lines with - for a list, &gt; for a quote. Leave a blank line between paragraphs.
              </p>
            </div>

            <div>
              <span className={label}>Images · {imgs.length} of {MAX}</span>
              <div
                onDragOver={(e) => { if (drag === null) { e.preventDefault(); setOver(true) } }}
                onDragLeave={() => setOver(false)}
                onDrop={onDropFiles}
                className={cn('rounded-xl border border-dashed border-border p-4 transition-colors', over && 'border-primary bg-primary/5')}
              >
                {imgs.length ? (
                  <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {imgs.map((im, i) => (
                      <li
                        key={im.key}
                        draggable
                        onDragStart={() => setDrag(i)}
                        onDragEnd={() => setDrag(null)}
                        onDragOver={(e) => { if (drag !== null) e.preventDefault() }}
                        onDrop={(e) => { if (drag !== null) { e.preventDefault(); e.stopPropagation(); move(drag, i); setDrag(null) } }}
                        className={cn('group relative aspect-square cursor-grab overflow-hidden rounded-lg border border-border bg-muted', drag === i && 'opacity-40')}
                      >
                        <img src={im.url} alt="" className="size-full object-cover" draggable={false} />
                        <span className="absolute left-1 top-1 rounded bg-background/80 px-1.5 text-[10px] font-semibold tabular-nums">{i === 0 ? 'Lead' : i + 1}</span>
                        <div className="absolute inset-x-0 bottom-0 flex justify-between bg-background/80 p-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          <button type="button" className="rounded p-1 hover:bg-secondary" onClick={() => move(i, i - 1)} aria-label="Move earlier" disabled={i === 0}><ArrowLeft className="size-3.5" aria-hidden="true" /></button>
                          <button type="button" className="rounded p-1 hover:bg-secondary" onClick={() => setImgs((a) => a.filter((_, j) => j !== i))} aria-label="Remove from this post"><X className="size-3.5" aria-hidden="true" /></button>
                          <button type="button" className="rounded p-1 hover:bg-secondary" onClick={() => move(i, i + 1)} aria-label="Move later" disabled={i === imgs.length - 1}><ArrowRight className="size-3.5" aria-hidden="true" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  onClick={() => pick.current?.click()}
                  disabled={imgs.length >= MAX}
                  className={cn('flex w-full flex-col items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50', imgs.length ? 'mt-4' : 'py-6')}
                >
                  <ImagePlus className="size-5" aria-hidden="true" />
                  <span>Drag images here, or click to choose</span>
                  <span className="text-xs">PNG, JPEG or WebP, up to 10 MB each. The first image leads the post.</span>
                </button>
                <input ref={pick} type="file" multiple accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => { addFiles(e.target.files ?? []); e.target.value = '' }} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Drag a picture onto another to reorder. Removing a picture only takes it out of this post.</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="p-date">Date</label>
                <DatePicker id="p-date" value={date} onChange={(v) => setDate(v || todayStr())} />
                <p className="mt-1.5 text-xs text-muted-foreground">Set an earlier date to backdate the post.</p>
              </div>
              <div>
                <span className={label}>Who can see it</span>
                <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Visibility">
                  {[{ v: true, t: 'Public' }, { v: false, t: 'Team only' }].map((o) => (
                    <button key={o.t} type="button" aria-pressed={isPublic === o.v} onClick={() => setIsPublic(o.v)}
                      className={cn('h-8 rounded px-3 text-sm font-medium', isPublic === o.v ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                      {o.t}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">Public posts also appear on the landing page.</p>
              </div>
            </div>

            {err ? <Note>{err}</Note> : null}
          </div>
        </form>

        <aside className="hidden min-h-0 overflow-y-auto bg-muted/30 px-8 py-8 lg:block" aria-label="Live preview">
          <p className="mb-6 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Live preview</p>
          <div className="mx-auto max-w-xl">
            <PostView title={title} body={body} urls={urls} date={post && date === dayOf(post.posted_at) ? post.posted_at : date === todayStr() ? new Date().toISOString() : `${date}T12:00:00`} isPublic={isPublic} backdated={backdated || date < todayStr()} size="sm" />
          </div>
        </aside>
      </div>
    </Dialog>
  )
}
