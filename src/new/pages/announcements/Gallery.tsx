import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** One, two, three or many images, laid out to suit the count. Tall and wide pictures are never stretched. */
export function Gallery({ urls, onOpen }: { urls: string[]; onOpen: (i: number) => void }) {
  const tile = (i: number, cls: string, extra?: React.ReactNode) => (
    <button key={i} type="button" onClick={() => onOpen(i)} aria-label={`Open image ${i + 1} of ${urls.length}`}
      className={cn('group relative overflow-hidden rounded-xl bg-muted', cls)}>
      <img src={urls[i]} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
      {extra}
    </button>
  )
  if (urls.length === 0) return null

  if (urls.length === 1) {
    // a single picture: as large as the column allows, contained so a tall one is not cropped
    return (
      <button type="button" onClick={() => onOpen(0)} aria-label="Open image" className="group relative block w-full overflow-hidden rounded-2xl bg-muted">
        <img src={urls[0]} alt="" className="mx-auto max-h-[34rem] w-auto max-w-full object-contain" />
      </button>
    )
  }
  if (urls.length === 2) return <div className="grid grid-cols-2 gap-2">{[0, 1].map((i) => tile(i, 'aspect-[4/3]'))}</div>
  if (urls.length === 3) {
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-2">
        {tile(0, 'row-span-2 aspect-auto min-h-64')}
        {tile(1, 'aspect-[4/3]')}
        {tile(2, 'aspect-[4/3]')}
      </div>
    )
  }
  // four or more: a wide lead image, then a strip of the rest (with "+N" on the last tile)
  const strip = urls.slice(1, 5)
  const more = urls.length - 5
  return (
    <div className="grid gap-2">
      {tile(0, 'aspect-[16/9]')}
      <div className="grid grid-cols-4 gap-2">
        {strip.map((_, k) => tile(k + 1, 'aspect-square', k === 3 && more > 0 ? (
          <span className="absolute inset-0 grid place-items-center bg-background/70 text-lg font-semibold">+{more}</span>
        ) : null))}
      </div>
    </div>
  )
}

/** Full-screen viewer with next and previous (buttons, arrow keys, Escape to close). */
export function Lightbox({ urls, start, onClose }: { urls: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start)
  const n = urls.length
  const go = (d: number) => setI((x) => (x + d + n) % n)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label="Image viewer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex items-center justify-between px-5 py-4 text-sm text-muted-foreground">
        <span className="tabular-nums">{i + 1} / {n}</span>
        <button type="button" onClick={onClose} aria-label="Close the viewer" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><X className="size-5" aria-hidden="true" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <img src={urls[i]} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        {n > 1 ? (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous image" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/80 p-3 hover:bg-secondary sm:left-6"><ChevronLeft className="size-5" aria-hidden="true" /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next image" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/80 p-3 hover:bg-secondary sm:right-6"><ChevronRight className="size-5" aria-hidden="true" /></button>
          </>
        ) : null}
      </div>
    </div>
  )
}
