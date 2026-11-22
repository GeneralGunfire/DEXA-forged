import { useState, type ReactNode } from 'react'
import { Globe2, Lock } from 'lucide-react'
import { fmtDate } from '../../../lib/data'
import { Rich } from '@/components/rich'
import { Gallery, Lightbox } from './Gallery'

/** One announcement: used in the feed and in the editor's live preview. */
export function PostView({ title, body, urls, date, author, isPublic, backdated, actions, size = 'lg' }: {
  title: string; body: string; urls: string[]; date: string; author?: string; isPublic: boolean
  backdated?: boolean; actions?: ReactNode; size?: 'lg' | 'sm'
}) {
  const [viewer, setViewer] = useState<number | null>(null)
  return (
    <article>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <time dateTime={date}>{fmtDate(date)}</time>
        {author ? <span>by {author}</span> : null}
        {backdated ? <span className="rounded border border-border px-1.5 py-0.5">Backdated</span> : null}
        <span className="inline-flex items-center gap-1.5">
          {isPublic ? <Globe2 className="size-3.5" aria-hidden="true" /> : <Lock className="size-3.5" aria-hidden="true" />}
          {isPublic ? 'Public' : 'Team only'}
        </span>
        {actions ? <span className="ml-auto">{actions}</span> : null}
      </div>
      <h2 className={size === 'lg' ? 'mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl' : 'mt-3 text-xl font-semibold tracking-tight text-foreground'}>
        {title.trim() || <span className="text-muted-foreground">Untitled</span>}
      </h2>
      {body.trim() ? <Rich text={body} className="mt-4 max-w-prose" /> : null}
      {urls.length ? <div className="mt-6"><Gallery urls={urls} onOpen={setViewer} /></div> : null}
      {viewer !== null ? <Lightbox urls={urls} start={viewer} onClose={() => setViewer(null)} /> : null}
    </article>
  )
}
