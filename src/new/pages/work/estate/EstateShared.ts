// Types, value lists and the counting, filtering and link-safety logic for Work > Estate.
// Pure functions only (no database or React), so they can be tested. Counts and plain descriptions only: never patient data.

export const TOPICS = [
  { value: 'requirements', label: 'Requirements' },
  { value: 'popia_law', label: 'POPIA and law' },
  { value: 'security', label: 'Security' },
  { value: 'identity', label: 'Identity' },
  { value: 'facility_codes', label: 'Facility codes' },
  { value: 'transport_formats', label: 'Transport and formats' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'consent_audit', label: 'Consent and audit' },
  { value: 'deployment', label: 'Deployment' },
  { value: 'operations', label: 'Operations' },
  { value: 'standards_licensing', label: 'Standards and licensing' },
  { value: 'stakeholders', label: 'Stakeholders' },
  { value: 'risks', label: 'Risks' },
  { value: 'other', label: 'Other' },
] as const
export type Topic = (typeof TOPICS)[number]['value']
export const topicLabel = (t: string) => TOPICS.find((x) => x.value === t)?.label ?? t

/** Weakest first, so "the weakest present" is the first one found. */
export const CONFIDENCE = ['not_established', 'partly', 'confirmed'] as const
export type EstateConfidence = (typeof CONFIDENCE)[number]
export const CONFIDENCE_LABEL: Record<EstateConfidence, string> = { not_established: 'Not established', partly: 'Partly established', confirmed: 'Confirmed' }

export const REQ_KINDS = ['requirement', 'risk', 'question'] as const
export type ReqKind = (typeof REQ_KINDS)[number]
export const KIND_LABEL: Record<ReqKind, string> = { requirement: 'Requirement', risk: 'Risk', question: 'Question' }
export const PRIORITIES = ['must', 'should', 'could'] as const
export type Priority = (typeof PRIORITIES)[number]
export const PRIORITY_LABEL: Record<Priority, string> = { must: 'Must', should: 'Should', could: 'Could' }
export const REQ_STATUSES = ['proposed', 'agreed', 'done', 'dropped'] as const
export type ReqStatus = (typeof REQ_STATUSES)[number]
export const STATUS_LABEL: Record<ReqStatus, string> = { proposed: 'Proposed', agreed: 'Agreed', done: 'Done', dropped: 'Dropped' }

export type EstateSection = {
  id: string; topic: Topic; title: string; body: string; confidence: EstateConfidence; sources: string
  position: number; created_at: string; updated_at: string
}
export type Requirement = {
  id: string; area: Topic; title: string; detail: string; kind: ReqKind; priority: Priority; status: ReqStatus
  source_note: string; database_id: string | null; created_at: string; updated_at: string
}

/* ---------------- counting ---------------- */

export function sectionCounts(sections: Pick<EstateSection, 'confidence'>[]): Record<EstateConfidence, number> {
  const out: Record<EstateConfidence, number> = { confirmed: 0, partly: 0, not_established: 0 }
  for (const s of sections) if (s.confidence in out) out[s.confidence]++
  return out
}

/** The weakest confidence present (not established, then partly, then confirmed), or null for no sections. */
export function weakest(sections: Pick<EstateSection, 'confidence'>[]): EstateConfidence | null {
  return CONFIDENCE.find((c) => sections.some((s) => s.confidence === c)) ?? null
}

/** Per topic: how many sections, and the weakest confidence among them. Topics with no sections are left out. */
export function topicStats(sections: Pick<EstateSection, 'topic' | 'confidence'>[]): Record<string, { count: number; weakest: EstateConfidence }> {
  const out: Record<string, { count: number; weakest: EstateConfidence }> = {}
  for (const t of new Set(sections.map((s) => s.topic))) {
    const mine = sections.filter((s) => s.topic === t)
    out[t] = { count: mine.length, weakest: weakest(mine)! }
  }
  return out
}

/**
 * Requirement figures for the overview strip.
 * Open question: a question that is neither done nor dropped.
 * Must-have outstanding: priority "must" that is still only proposed (not agreed, done or dropped).
 */
export function requirementStats(reqs: Pick<Requirement, 'kind' | 'priority' | 'status'>[]) {
  const byStatus: Record<ReqStatus, number> = { proposed: 0, agreed: 0, done: 0, dropped: 0 }
  for (const r of reqs) if (r.status in byStatus) byStatus[r.status]++
  return {
    total: reqs.length,
    byStatus,
    openQuestions: reqs.filter((r) => r.kind === 'question' && r.status !== 'done' && r.status !== 'dropped').length,
    mustOutstanding: reqs.filter((r) => r.priority === 'must' && r.status === 'proposed').length,
  }
}

/* ---------------- filtering ---------------- */

const has = (text: string, needle: string) => text.toLowerCase().includes(needle)

/**
 * Sections to show, most recently edited first. With a search, every topic is searched (title and body) and the topic
 * choice is ignored; without one, only the chosen topic ('' means all).
 */
export function filterSections(sections: EstateSection[], f: { topic: string; q: string }): EstateSection[] {
  const q = f.q.trim().toLowerCase()
  const list = q ? sections.filter((s) => has(s.title, q) || has(s.body, q)) : f.topic ? sections.filter((s) => s.topic === f.topic) : sections
  return [...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export const NO_DB = '__none'
export type ReqFilters = { area: string; kind: string; priority: string; status: string; database: string; q: string }
export const NO_REQ_FILTERS: ReqFilters = { area: '', kind: '', priority: '', status: '', database: '', q: '' }
export const activeReqFilters = (f: ReqFilters) => Object.values(f).filter((v) => v.trim() !== '').length

/** Each filter is "empty = no limit". The database filter can also be NO_DB (requirements with no database). */
export function filterRequirements(reqs: Requirement[], f: ReqFilters): Requirement[] {
  const q = f.q.trim().toLowerCase()
  return reqs.filter((r) =>
    (!f.area || r.area === f.area) && (!f.kind || r.kind === f.kind) && (!f.priority || r.priority === f.priority) && (!f.status || r.status === f.status) &&
    (!f.database || (f.database === NO_DB ? r.database_id === null : r.database_id === f.database)) &&
    (!q || has(r.title, q) || has(r.detail, q) || has(r.source_note, q)))
}

const rank = <T extends string>(order: readonly T[], v: T) => order.indexOf(v)

/** Group by area in the topic order. Inside a group: must first, then by status, then by title. Empty areas are left out. */
export function groupByArea(reqs: Requirement[]): { area: Topic; label: string; rows: Requirement[] }[] {
  return TOPICS.map((t) => ({
    area: t.value, label: t.label,
    rows: reqs.filter((r) => r.area === t.value).sort((a, b) =>
      rank(PRIORITIES, a.priority) - rank(PRIORITIES, b.priority) || rank(REQ_STATUSES, a.status) - rank(REQ_STATUSES, b.status) || a.title.localeCompare(b.title)),
  })).filter((g) => g.rows.length > 0)
}

/* ---------------- sources: plain text, with web addresses made safe to link ---------------- */

export type SourcePart = { text: string; href?: string }

/** The address as a clean string if it is a real http or https address, otherwise null. Nothing else is ever linked. */
export function safeHttpUrl(s: string): string | null {
  try {
    const u = new URL(s)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? u.href : null
  } catch { return null }
}

/**
 * Splits one line into text and links. Only http:// and https:// addresses that pass a URL check become links, and
 * punctuation that ends a sentence is left outside the link. Everything else stays text (the page prints it as text,
 * never as HTML).
 */
export function parseSourceLine(line: string): SourcePart[] {
  const parts: SourcePart[] = []
  let last = 0
  for (const m of line.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    let end = m[0].length
    while (end > 0 && /[.,;:!?)\]}]/.test(m[0][end - 1])) end--
    const url = m[0].slice(0, end)
    const href = safeHttpUrl(url)
    if (!href) continue
    const start = m.index!
    if (start > last) parts.push({ text: line.slice(last, start) })
    parts.push({ text: url, href })
    last = start + end
  }
  if (last < line.length) parts.push({ text: line.slice(last) })
  return parts.length ? parts : [{ text: line }]
}

/** The sources field as a list of lines, each as parts. Blank lines are skipped. */
export function parseSources(text: string): SourcePart[][] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(parseSourceLine)
}

/** Like parseSources, but a trailing note in brackets, such as "(search snippet only)", is split off so it can be shown as a small label. */
export type SourceItem = { parts: SourcePart[]; note: string | null }
export function parseSourceItems(text: string): SourceItem[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = /\s+\(([^()\n]{1,120})\)\s*$/.exec(line)
    if (m && !/https?:/i.test(m[1])) return { parts: parseSourceLine(line.slice(0, m.index).trim()), note: m[1].trim() }
    return { parts: parseSourceLine(line), note: null }
  })
}

/* ---------------- section text: a light format, split into labelled blocks ---------------- */

export type BlockKind = 'lead' | 'facts' | 'dexa' | 'unknown' | 'other' | 'plain'
export type BodyBlock = { label: string | null; kind: BlockKind; text: string }

const LABEL_LINE = /^\s*\*\*([^*\n]+?)\*\*\s*:?\s*$/

function kindOf(label: string): BlockKind {
  const l = label.toLowerCase().replace(/[:.\s]+$/, '').trim()
  if (l === 'in plain words') return 'lead'
  if (l === 'key facts') return 'facts'
  if (l.startsWith('what it means')) return 'dexa'
  if (l === 'not established') return 'unknown'
  return 'other'
}

/**
 * Splits a section body into blocks. A line that is only a bold label (like **Key facts**) starts a block; the lines
 * under it belong to that block. Text before the first label is an unlabelled "plain" block. The in-line formatting
 * (bold, bullets, paragraphs) inside a block is left for the safe Rich renderer; nothing here produces HTML.
 */
export function parseBody(body: string): BodyBlock[] {
  const blocks: BodyBlock[] = []
  let label: string | null = null
  let lines: string[] = []
  const flush = () => {
    const text = lines.join('\n').trim()
    if (label !== null) blocks.push({ label, kind: kindOf(label), text })
    else if (text) blocks.push({ label: null, kind: 'plain', text })
  }
  for (const line of body.replace(/\r/g, '').split('\n')) {
    const m = LABEL_LINE.exec(line)
    if (m) { flush(); label = m[1].trim().replace(/:$/, ''); lines = [] } else lines.push(line)
  }
  flush()
  return blocks
}

/** The same blocks with "In plain words" first (a lead paragraph at the top); everything else keeps its order. */
export const leadFirst = (blocks: BodyBlock[]): BodyBlock[] => [...blocks.filter((b) => b.kind === 'lead'), ...blocks.filter((b) => b.kind !== 'lead')]

/** Text with the light formatting removed (bold, italic, links, bullet dashes), on one line. */
export function plainText(md: string): string {
  return md
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The card preview: the "In plain words" text if there is one, else the first block with text (never the "Not established" one first). */
export function previewText(body: string, max = 240): string {
  const blocks = parseBody(body)
  const pick = blocks.find((b) => b.kind === 'lead' && b.text) ?? blocks.find((b) => b.text && b.kind !== 'unknown') ?? blocks.find((b) => b.text)
  if (!pick) return ''
  const t = plainText(pick.text)
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t
}
