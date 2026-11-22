import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { postImageUrl, unwrap, useLoad, useTeam } from '../../../lib/data'
import { btn, btnPrimary } from '../calendar/cal'
import { PostView } from './PostView'
import { dayOf, PostEditor, type Post } from './PostEditor'
import { Loading } from '@/components/ui/loading'

export default function Announcements() {
  const { name } = useTeam()
  const { data, error, loading, reload } = useLoad<Post[]>(async () =>
    unwrap<Post[]>(await supabase.from('posts').select('*').order('posted_at', { ascending: false })) ?? [])
  const [editing, setEditing] = useState<Post | 'new' | null>(null)

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Admin</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Announcements</h1>
          <p className="mt-2 text-sm text-muted-foreground">News for the team, with text and images. Public posts also appear on the landing page.</p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden="true" /> New announcement</button>
      </header>

      <div className="mt-10">
        {error ? (
          <p className="text-sm text-destructive" role="alert">Could not load the announcements: {error}</p>
        ) : loading && !data ? (
          <Loading variant="cards" />
        ) : data && data.length === 0 ? (
          <div className="border-t border-border py-16 text-center">
            <p className="text-lg font-medium">No announcements yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">Write the first one. Public posts also appear on the landing page.</p>
            <button type="button" className={btnPrimary + ' mt-6'} onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden="true" /> New announcement</button>
          </div>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {(data ?? []).map((p) => (
              <div key={p.id} className="py-12 first:pt-10">
                <PostView
                  title={p.title}
                  body={p.body}
                  urls={p.image_paths.map(postImageUrl)}
                  date={p.posted_at}
                  author={name(p.created_by) || undefined}
                  isPublic={p.is_public}
                  backdated={dayOf(p.posted_at) < dayOf(p.created_at)}
                  actions={<button type="button" className={btn + ' !h-8'} onClick={() => setEditing(p)}><Pencil className="size-3.5" aria-hidden="true" /> Edit</button>}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <PostEditor
          key={editing === 'new' ? 'new' : editing.id}
          post={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload() }}
        />
      ) : null}
    </div>
  )
}
