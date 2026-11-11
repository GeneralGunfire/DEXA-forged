import { useEffect, useRef, useState } from 'react'
import { downloadFile, fileKind, signedUrl } from '../lib/data'
import { Dialog } from './ui'
import '../pages/app/viewer.css'

export type ViewDoc = { name: string; path: string; mime: string | null }

/**
 * Opens a PDF or image inside Forged. PDFs are drawn with PDF.js onto canvases, so they look the same on a
 * phone as on a desktop (phone browsers often show only page one of an embedded PDF).
 * The file is fetched with a short-lived signed link and never leaves the private bucket.
 */
export function DocViewer({ doc, onClose }: { doc: ViewDoc | null; onClose: () => void }) {
  return (
    <Dialog open={!!doc} onClose={onClose} title={doc?.name ?? 'Document'} wide>
      {doc && <Body doc={doc} />}
    </Dialog>
  )
}

function Body({ doc }: { doc: ViewDoc }) {
  const kind = fileKind(doc.mime, doc.path)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="viewer">
      <div className="viewer__bar">
        <button type="button" className="btn btn--sm" onClick={() => downloadFile(doc.path, doc.name).catch((e) => setErr(String(e?.message ?? e)))}>Download</button>
      </div>
      {err && <p className="notice notice--err" role="alert">{err}</p>}
      {kind === 'PDF' ? <PdfPages path={doc.path} /> : kind === 'Image' ? <Img path={doc.path} name={doc.name} /> : (
        <p className="muted">This type of file cannot be shown here. Use Download.</p>
      )}
    </div>
  )
}

function Img({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { signedUrl(path).then(setUrl).catch((e) => setErr(String(e?.message ?? e))) }, [path])
  if (err) return <p className="notice notice--err" role="alert">{err}</p>
  return url ? <img className="viewer__img" src={url} alt={name} /> : <p className="muted">Loading…</p>
}

function PdfPages({ path }: { path: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [msg, setMsg] = useState('')
  const [pages, setPages] = useState(0)
  const pdfRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null)

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const [lib, worker] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ])
        lib.GlobalWorkerOptions.workerSrc = worker.default
        const res = await fetch(await signedUrl(path))
        if (!res.ok) throw new Error('The file could not be downloaded.')
        const data = new Uint8Array(await res.arrayBuffer())
        const pdf = await lib.getDocument({ data, isEvalSupported: false }).promise
        if (dead) { pdf.destroy(); return }
        pdfRef.current = pdf
        setPages(pdf.numPages)
        setState('ready')
      } catch (e) {
        if (!dead) { setState('error'); setMsg(e instanceof Error ? e.message : 'The PDF could not be opened.') }
      }
    })()
    return () => { dead = true; pdfRef.current?.destroy(); pdfRef.current = null }
  }, [path])

  // draw pages as they scroll into view, at the width of the viewer times the zoom
  useEffect(() => {
    const pdf = pdfRef.current, el = host.current
    if (state !== 'ready' || !pdf || !el) return
    let dead = false
    const width = Math.max(240, el.clientWidth - 26) * zoom
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const slots = [...el.querySelectorAll<HTMLCanvasElement>('canvas')]
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
    const io = new IntersectionObserver((ee) => { ee.forEach((x) => { if (x.isIntersecting) void draw(x.target as HTMLCanvasElement) }) }, { rootMargin: '600px 0px' })
    slots.forEach((c) => io.observe(c))
    return () => { dead = true; io.disconnect() }
  }, [state, zoom, pages])

  if (state === 'error') return <p className="notice notice--err" role="alert">{msg}</p>
  return (
    <>
      {state === 'ready' && (
        <div className="viewer__zoom" role="group" aria-label="Zoom">
          <button type="button" className="btn btn--sm" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn btn--sm" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">+</button>
          <span className="viewer__pages">{pages} {pages === 1 ? 'page' : 'pages'}</span>
        </div>
      )}
      {state === 'loading' && <p className="muted">Opening the document…</p>}
      <div className="viewer__pdf" ref={host}>
        {Array.from({ length: pages }, (_, i) => <canvas key={i} data-page={i + 1} aria-label={`Page ${i + 1} of ${pages}`} />)}
      </div>
    </>
  )
}
