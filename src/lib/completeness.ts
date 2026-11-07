/** What a database card needs before it counts as fully documented. Used by the Database board and Reports. */
export type DbFields = {
  machine: string; db_type: string; background: string; shortfalls: string
  port: string; instance_name: string; build_record: string
}

export const CHECKS = [
  { k: 'machine', label: 'Machine it lives on' },
  { k: 'db_type', label: 'Database type' },
  { k: 'background', label: 'Real-world context' },
  { k: 'shortfalls', label: 'Real-world shortfalls' },
  { k: 'port', label: 'Port' },
  { k: 'instance_name', label: 'Instance name' },
  { k: 'build_record', label: 'Build record (tables, population)' },
  { k: 'log', label: 'A development log entry' },
  { k: 'docs', label: 'A document uploaded' },
] as const

export function completeness(db: DbFields, logCount: number, docCount: number) {
  const ok: Record<string, boolean> = {
    machine: !!db.machine.trim(),
    db_type: !!db.db_type.trim(),
    background: !!db.background.trim(),
    shortfalls: !!db.shortfalls.trim(),
    port: !!db.port.trim(),
    instance_name: !!db.instance_name.trim(),
    build_record: !!db.build_record.trim(),
    log: logCount > 0,
    docs: docCount > 0,
  }
  const missing = CHECKS.filter((c) => !ok[c.k])
  const have = CHECKS.length - missing.length
  return { have, total: CHECKS.length, pct: Math.round((have / CHECKS.length) * 100), missing, ok }
}

/** Count rows per database id. */
export function countBy(rows: { database_id: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) if (r.database_id) out[r.database_id] = (out[r.database_id] ?? 0) + 1
  return out
}
