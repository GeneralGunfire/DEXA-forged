import { describe, expect, it } from 'vitest'
import { checkRedaction, luhnValid } from './redact'

const bad = (text: string, kind: string) => {
  const r = checkRedaction({ detail: text })
  expect(r.ok).toBe(false)
  if (!r.ok) {
    expect(r.kind).toBe(kind)
    expect(r.field).toBe('detail')
    // never echoes the matched value
    expect(r.message).not.toContain(text.trim())
  }
}
const good = (text: string) => expect(checkRedaction({ summary: text }).ok).toBe(true)

describe('redaction: rejects', () => {
  it('a South African ID number that passes Luhn', () => {
    expect(luhnValid('8001015009087')).toBe(true)
    bad('Loaded the row for 8001015009087 today', 'a South African ID number')
  })
  it('an email address', () => bad('Contact sipho.m@example.co.za about it', 'an email address'))
  it('South African phone numbers', () => {
    bad('call 082 123 4567', 'a phone number')
    bad('call +27 82 123 4567', 'a phone number')
    bad('call 0821234567', 'a phone number')
    bad('call 011-123-4567', 'a phone number')
  })
  it('connection strings', () => {
    bad('Server=localhost;Database=Hospital;Trusted_Connection=True', 'a connection string')
    bad('postgresql://user@host:5432/db', 'a connection string')
    bad('Data Source=PC\\SQL;Initial Catalog=x', 'a connection string')
  })
  it('passwords and secrets', () => {
    bad('login failed, password=abc', 'a password or secret')
    bad('pwd = hunter2', 'a password or secret')
    bad('the client_secret was wrong', 'a password or secret')
  })
  it('tokens and keys', () => {
    bad('sent token=abc123', 'an access token or key')
    bad('used the apikey in the header', 'an access token or key')
    bad('Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123', 'an access token or key')
  })
  it('a private key block', () => bad('-----BEGIN RSA PRIVATE KEY-----\nMIIE', 'a private key'))
  it('a long base64-looking string', () =>
    bad('blob QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9w', 'a long encoded string'))
  it('checks title, summary and detail and names the field', () => {
    const r = checkRedaction({ title: 'fine', summary: 'mail a@b.co', detail: '' })
    expect(r).toMatchObject({ ok: false, field: 'summary' })
  })
})

describe('redaction: accepts ordinary engineering text', () => {
  it('counts, dates and timings', () => {
    good('Loaded 1,204,331 rows in 42 minutes on 2026-11-02 at 14:05.')
    good('Row count 1234567890123 is a total, not an ID: 1234567890124')
  })
  it('13-digit numbers that fail Luhn', () => {
    expect(luhnValid('1234567890123')).toBe(false)
    good('Batch 1234567890123 finished')
  })
  it('table names, error codes and file paths', () => {
    good('Table dbo.hospital_admission_episode_detail failed with Msg 547, Level 16, State 0')
    good('ERROR 23503: foreign key violation on fk_episode_facility')
    good('Wrote C:\\Backups\\private_hospital_2026-11-02.bak')
  })
  it('key=value pairs that are not connection strings', () => {
    good('rows=4200; errors=0; skipped=3')
  })
  it('a long lowercase identifier and a plain hyphenated sentence', () => {
    good('hospital_discharge_summary_diagnosis_code_mapping_table_staging')
    good('The load was re-run after the foreign-key constraint was re-created.')
  })
  it('empty fields', () => expect(checkRedaction({ title: '', summary: undefined, detail: null }).ok).toBe(true))
})
