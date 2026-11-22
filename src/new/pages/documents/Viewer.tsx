import { useEffect, useRef, useState } from 'react'
import { Download, Minus, Plus } from 'lucide-react'
import { describe, downloadFile, fileKind, signedUrl } from '../../../lib/data'
import { btn } from '../calendar/cal'
import { Dialog } from '@/components/ui/dialog'
import { Note } from '@/components/ui/note'
import { InlineLoading } from '@/components/ui/loading'

export type ViewDoc = { name: string; path: string; mime: string | null }
export const ext = (path: string) => (path.split('.').pop() ?? '').toLowerCase()
export const canView = (d: ViewDoc) => ['PDF', 'Image'].includes(fileKind(d.mime, d.path))

/** Shows a PDF or picture inside New Forge. The file comes from the private bucket by a short-lived signed link. */
export function Viewer({ doc, onClose }: { doc: ViewDoc | null; onClose: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  if (!doc) return null
  const kind = fileKind(doc.mime, doc.path)
  return (
    <Dialog
      open
      size="xl"
      onClose={() => { setErr(null); onClose() }}
      title={doc.name}
      notice={err}
      bodyClassName="p-0"
      footer={
        <button type="button" className={btn} onClick={() => downloadFile(doc.path, `${doc.name}.${ext(doc.path)}`).catch((e) => setErr(describe(e)))}>
          <Download className="size-4" aria-hidden="true" /> Download
        </button>
      }
    >
      {kind === 'PDF' ? <Pdf path={doc.path} /> : <Img path={doc.path} name={doc.name} />}
    </Dialog>
  )
}

function Img({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { signedUrl(path).then(setUrl).catch((e) => setErr(describe(e))) }, [path])
  if (err) return <div className="p-6"><Note>{err}</Note></div>
  return <div className="grid min-h-64 place-items-center p-4">{url ? <img src={url} alt={name} className="max-h-[70svh] w-auto rounded-md" /> : <InlineLoading />}</div>
}

function Pdf({ path }: { path: string }) {
  const host = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null)
  const [zoom, setZoom] = useState(1)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [msg, setMsg] = useState('')
  const [pages, setPages] = useState(0)

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
        lib.GlobalWorkerOptions.workerSrc = worker.default
        const res = await fetch(await signedUrl(path))
        if (!res.ok) throw new Error('The file could not be downloaded.')
        const pdf = await lib.getDocument({ data: new Uint8Array(await res.arrayBuffer()), isEvalSupported: false }).promise
        if (dead) { void pdf.destroy(); return }
        pdfRef.current = pdf
        setPages(pdf.numPages)
        setState('ready')
      } catch (e) { if (!dead) { setState('error'); setMsg(e instanceof Error ? e.message : 'The PDF could not be opened.') } }
    })()
    return () => { dead = true; void pdfRef.current?.destroy(); pdfRef.current = null }
  }, [path])

  // each page is drawn as it scrolls into view, at the width of the viewer times the zoom
  useEffect(() => {
    const pdf = pdfRef.current, el = host.current
    if (state !== 'ready' || !pdf || !el) return
    let dead = false
    const width = Math.max(240, el.clientWidth - 48) * zoom
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const draw = async (c: HTMLCanvasElement) => {
      if (c.dataset.w === String(width)) return
      c.dataset.w = String(width)
      const page = await pdf.getPage(Number(c.dataset.page))
      if (dead) return
      const base = page.getViewport({ scale: 1 })
      const vp = page.getViewport({ scale: (width / base.width) * dpr })
      c.width = vp.width; c.height = vp.height
      c.style.width = `${width}px`; c.style.height = `${vp.height / dpr}px`
      await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise
    }
    const io = new IntersectionObserver((ee) => ee.forEach((x) => { if (x.isIntersecting) void draw(x.target as HTMLCanvasElement) }), { root: el, rootMargin: '600px 0px' })
    el.querySelectorAll<HTMLCanvasElement>('canvas').forEach((c) => io.observe(c))
    return () => { dead = true; io.disconnect() }
  }, [state, zoom, pages])

  if (state === 'error') return <div className="p-6"><Note>{msg}</Note></div>
  return (
    <div className="flex h-[68svh] min-h-0 flex-col">
      {state === 'ready' ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}><Minus className="size-4" aria-hidden="true" /></button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}><Plus className="size-4" aria-hidden="true" /></button>
          <span className="ml-auto text-xs text-muted-foreground">{pages} {pages === 1 ? 'page' : 'pages'}</span>
        </div>
      ) : null}
      {state === 'loading' ? <p className="p-6 text-sm text-muted-foreground">Opening the document…</p> : null}
      <div ref={host} className="min-h-0 flex-1 space-y-3 overflow-auto bg-muted/40 p-4">
        {Array.from({ length: pages }, (_, i) => <canvas key={i} data-page={i + 1} aria-label={`Page ${i + 1} of ${pages}`} className="mx-auto block rounded-sm bg-white shadow" />)}
      </div>
    </div>
  )
}
