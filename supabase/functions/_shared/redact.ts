/**
 * Redaction check. Forged holds no patient data and must never be able to.
 * The SAME file is used by the web forms, by edits and by the log-ingest
 * Edge Function, so every route into the timeline is checked identically.
 *
 * It never returns or echoes the matched value: only the kind of problem
 * and the name of the field it was found in.
 */

export type RedactKind =
  | 'a South African ID number'
  | 'an email address'
  | 'a phone number'
  | 'a connection string'
  | 'a password or secret'
  | 'a private key'
  | 'an access token or key'
  | 'a long encoded string'

export type RedactResult = { ok: true } | { ok: false; kind: RedactKind; field: string; message: string }

/** Luhn check, as used by South African ID numbers. */
export function luhnValid(digits: string): boolean {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (n < 0 || n > 9) return false
    if (alt) { n *= 2; if (n > 9) n -= 9 }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

function hasSaId(text: string): boolean {
  for (const m of text.matchAll(/(?<!\d)\d{13}(?!\d)/g)) if (luhnValid(m[0])) return true
  return false
}

function hasLongBase64(text: string): boolean {
  for (const m of text.matchAll(/[A-Za-z0-9+/]{41,}={0,2}/g)) {
    const s = m[0]
    const classes = [/[A-Z]/, /[a-z]/, /[0-9]/].filter((r) => r.test(s)).length
    if (classes >= 2) return true
  }
  return false
}

// Order matters: the most specific kind is reported first.
const RULES: { kind: RedactKind; test: (t: string) => boolean }[] = [
  { kind: 'a private key', test: (t) => /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i.test(t) },
  { kind: 'a South African ID number', test: hasSaId },
  { kind: 'an email address', test: (t) => /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/.test(t) },
  {
    kind: 'a phone number',
    test: (t) => /(?<![\d.])(?:\+27|0027|0)[\s-]?\(?[1-9]\d\)?[\s-]?\d{3}[\s-]?\d{4}(?!\d)/.test(t),
  },
  {
    kind: 'a connection string',
    test: (t) =>
      /\b(?:postgres(?:ql)?|mysql|mssql|sqlserver|mongodb(?:\+srv)?|redis|amqps?):\/\/\S+/i.test(t) ||
      t.split(/\r?\n/).some((line) => {
        const pairs = line.match(/(?:^|;)\s*[A-Za-z _]+=/g) ?? []
        return (
          pairs.length >= 2 &&
          /(?:^|;)\s*(?:server|data source|host|initial catalog|database|uid|user id|integrated security|trusted_connection)\s*=/i.test(line)
        )
      }),
  },
  {
    kind: 'a password or secret',
    test: (t) => /\b(?:password|pwd)\s*=/i.test(t) || /secret/i.test(t),
  },
  {
    kind: 'an access token or key',
    test: (t) =>
      /\btoken\s*=/i.test(t) || /api[-_ ]?key/i.test(t) ||
      /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/.test(t) || /\beyJ[A-Za-z0-9_-]{10,}\./.test(t),
  },
  { kind: 'a long encoded string', test: hasLongBase64 },
]

const LABEL: Record<string, string> = { title: 'The title', summary: 'The summary', detail: 'The detail' }

/** Checks title, summary and detail (or any named text fields). */
export function checkRedaction(fields: Record<string, string | null | undefined>): RedactResult {
  for (const [field, value] of Object.entries(fields)) {
    if (!value) continue
    for (const rule of RULES) {
      if (rule.test(value)) {
        const label = LABEL[field] ?? `The ${field}`
        return {
          ok: false, kind: rule.kind, field,
          message: `${label} looks like it contains ${rule.kind}. Remove it and try again. Entries must hold counts, errors and descriptions only.`,
        }
      }
    }
  }
  return { ok: true }
}
