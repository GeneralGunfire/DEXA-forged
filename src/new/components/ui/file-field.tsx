import { useRef, useState } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import { fmtBytes } from '../../../lib/data'
import { cn } from '@/lib/utils'

/** A file chooser: a drop area you can click or drop onto, with the chosen file shown and removable. */
export function FileField({ file, onChange, accept, hint, id, disabled }: {
  file: File | null; onChange: (f: File | null) => void; accept: string; hint?: string; id?: string; disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div>
      <input ref={input} id={id} type="file" accept={accept} className="sr-only" tabIndex={-1} disabled={disabled}
        onChange={(e) => { onChange(e.target.files?.[0] ?? null); e.target.value = '' }} />
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 px-3 py-2.5">
          <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{file.name}</span><span className="block text-xs text-muted-foreground">{fmtBytes(file.size)}</span></span>
          <button type="button" aria-label="Remove the chosen file" onClick={() => onChange(null)} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-4" aria-hidden="true" /></button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onChange(f) }}
          className={cn('flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50', over && 'border-primary bg-primary/5 text-foreground')}
        >
          <Upload aria-hidden="true" className="size-5" />
          <span>Drop a file here, or click to choose</span>
          {hint ? <span className="text-xs">{hint}</span> : null}
        </button>
      )}
    </div>
  )
}
