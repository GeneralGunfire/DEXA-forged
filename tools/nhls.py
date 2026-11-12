import sys, os, re, collections, datetime
sys.path.insert(0, os.path.dirname(__file__))
from fp import *

DB = 'nhls'
PATH = 'C:/Database/registries/nhls_lab_codes.db'
ff = file_facts(PATH)
c = lite(PATH)
ver = c.execute('select sqlite_version()').fetchone()[0]
tabs = [r[0] for r in c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")]
info = {t: [dict(r) for r in c.execute(f'pragma table_info({t})')] for t in tabs}
nrows = {t: c.execute(f'select count(*) from {t}').fetchone()[0] for t in tabs}
fks = [(t, dict(r)) for t in tabs for r in c.execute(f'pragma foreign_key_list({t})')]
idxs = [(t, r[1], r[2]) for t in tabs for r in c.execute(f'pragma index_list({t})')]
lt = [dict(r) for r in c.execute('select * from lab_test')]
N = len(lt)
cols = [x['name'] for x in info['lab_test']]
disc = collections.Counter(r['discipline'] for r in lt)
rtype = collections.Counter(r['result_type'] for r in lt)
spec = collections.Counter(r['specimen_type'] for r in lt)
loinc = sum(1 for r in lt if (r['loinc_code'] or '').strip())
snomed = sum(1 for r in lt if r['snomed_concept_id'] not in (None, '', 0))
active = sum(1 for r in lt if r['active_flag'] == 1)
codes = {r['nhls_test_code'] for r in lt}
loincs = {r['loinc_code'] for r in lt if (r['loinc_code'] or '').strip()}
blank = {k: sum(1 for r in lt if r[k] in (None, '')) for k in cols}
distinct = {k: len({r[k] for r in lt}) for k in cols}
maxlen = {k: max(len(str(r[k])) if r[k] is not None else 0 for r in lt) for k in cols}
tot_cols = sum(len(v) for v in info.values())
sch = c.execute("select sql from sqlite_master where name='lab_test'").fetchone()[0]
fkon = c.execute('pragma foreign_keys').fetchone()[0]

# hospitals (read-only)
P = lambda q: mssql_one(1433, 'private_hospital', q)
U = lambda q: mssql_one(1438, 'public_hospital', q)
lo_in = ','.join("'" + x + "'" for x in loincs)
co_in = ','.join("'" + x + "'" for x in codes)
p_lab = int(P('select count(*) from ref.lab_test'))
p_lab_loinc = int(P("select count(*) from ref.lab_test where loinc_code is not null and loinc_code<>''"))
p_lab_in = int(P(f'select count(*) from ref.lab_test where loinc_code in ({lo_in})'))
u_imp = int(U('select count(*) from dbo.LAB_RESULT_IMPORT'))
u_imp_in = int(U(f'select count(*) from dbo.LAB_RESULT_IMPORT where TEST_CODE in ({co_in})'))
u_imp_dist = int(U('select count(distinct TEST_CODE) from dbo.LAB_RESULT_IMPORT'))
u_imp_dist_in = int(U(f'select count(distinct TEST_CODE) from dbo.LAB_RESULT_IMPORT where TEST_CODE in ({co_in})'))
u_acc = int(U('select count(*) from dbo.LAB_REQ'))

scripts = list_files('C:/Database/registries/scripts', ['nhls'])
backups = list_files('C:/Database/backups', ['nhls_lab_codes']) + list_files('C:/Database/_backups', ['nhls_lab_codes'])
backups.sort(key=lambda x: x[2])

SRC = f'''- **[1] S Cassim and Z C Chapanduka, "Cyberattack on the National Health Laboratory Service of South Africa: implications, response and recommendations"**, South African Medical Journal 2024;114(12):e2549. https://doi.org/10.7196/SAMJ.2024.v114i12.2549 (opened, accessed {TODAY}).
- **[2] Cassim et al., study of CD4 inter-laboratory referral**, PMC 7756670. https://pmc.ncbi.nlm.nih.gov/articles/PMC7756670 (opened, accessed {TODAY}).
- **[3] Provenance and build records** held with the database (read directly on {TODAY}).
- **[4] Uploaded final document 4 of 11, "NHLS Lab Codes"**, 10 November 2026.
- **Not opened:** web search summaries of other NHLS turnaround-time studies; claims resting only on those are not used.'''

put(DB, 'background', 'In plain words', 'What the laboratory service and its test catalogue are, in a few sentences.', 'text',
    '''> Every blood test, urine test or swab has a name and a code, like an entry in a catalogue, which says what sample is needed and how the result is measured. The National Health Laboratory Service runs the public laboratories and tests the samples from public hospitals and clinics. This record is about our small practice copy of a test catalogue.

For SAHealth the point is simple: hospitals call the same test by different names and codes, so the gateway needs one catalogue to tell that two differently named tests are the same.''', 10, True)
put(DB, 'background', 'What it is and who runs it', 'What could be confirmed about the real service.', 'text',
    f'''**What the service is. Confirmed [1].** The National Health Laboratory Service (NHLS) is a public entity with a network of diagnostic laboratories in all nine provinces and more than 8,000 employees. The article describes it as the sole provider of diagnostic pathology services to more than 80% of the South African population, across the whole public sector from academic and district hospitals to primary healthcare facilities. It is also described as the custodian of patients' personal data and test results.

**The laboratory information system. Confirmed [1].** Its functions are test order entry, result upload from laboratory analysers, result entry and viewing. In June 2024 this was TrakCare (InterSystems).

**The central data warehouse. Confirmed [1][2].** The NHLS Central Data Warehouse (CDW) stores historical pathology testing data for laboratory users. Another study describes it as an NHLS entity that houses all laboratory information system data generated by its laboratories [2].

**Network size. Confirmed [2].** One study describes a national network of 255 laboratories (255 source laboratories referring CD4 samples to 43 testing laboratories).

**Facility codes. Confirmed [2].** In the laboratory information system each health facility has a designated location code, captured from the facility details on the request form.

**Test codes and the test catalogue. Not established.** Neither opened source says anything about the structure of test codes or the catalogue. The final project document says the real catalogue is reported at more than 2,400 tests and that the real test codes are proprietary [4]. I could not open a source for either statement.''', 20)
put(DB, 'background', 'Real-world shortfalls', 'Problems the opened sources evidence.', 'text',
    '''- **A ransomware attack stopped the service's computer systems. Confirmed [1].** On Saturday 22 June 2024 at about 03:00 the NHLS IT system was hit by ransomware (named in the article as BlackSuit). The internet, intranet and the TrakCare laboratory information system became inaccessible, including test order entry, result upload, result entry and viewing.
- **Decades of archived results were inaccessible. Confirmed [1].** The central data warehouse was also inaccessible.
- **There was no plan for it. Confirmed [1].** The authors say the downtime procedure had no contingency for a cybersecurity breach and that no ready business continuity plan existed.
- **Turnaround times roughly doubled. Confirmed [1].** For example, full blood counts in hospital, which should take under 2 hours, took 4 hours. Staff moved from automated to manual procedures.
- **Timing data is incomplete. Confirmed [2].** Not every transfer step generates a date and time stamp, and not all samples are stamped at the time blood is drawn. Very few facilities had map coordinates in the system.
- **Recovery after the attack. Not established.** The article was written in 2024 and I found no opened source on the current state.''', 30)
put(DB, 'background', 'Why it matters to the gateway', 'The practical reason this catalogue is in the estate.', 'text',
    'Laboratory results arrive from the national laboratory service under its own test codes, while each hospital keeps its own names, codes and units. The gateway needs a standard vocabulary to map both hospitals\' tests to, so it can recognise that a hospital\'s "HB" and the catalogue\'s "Haemoglobin" are the same test and can compare units. The catalogue is a SQLite file because it is a reference list that is consulted, not a live service [4].', 40)
put(DB, 'background', 'Sources', 'Every source used, with the date it was opened.', 'sources', SRC, 90)

put(DB, 'build', 'Tests by discipline', f'The {N} tests by laboratory area (measured).', 'chart', bars(disc), 10, True)
put(DB, 'build', 'Tests by result type', 'Whether a result is a number, an ordered category or a document.', 'chart', chart('stacked', [{'label': k, 'value': v} for k, v in rtype.most_common()]), 11, True)
put(DB, 'build', 'Code coverage', f'How many of the {N} tests carry each international code.', 'chart', chart('bar', [{'label': 'LOINC code', 'value': loinc}, {'label': 'SNOMED CT concept', 'value': snomed}, {'label': 'Active', 'value': active}, {'label': 'All tests', 'value': N}]), 12)
put(DB, 'build', 'Hospital lab data against the catalogue', 'How many hospital lab rows carry a code the catalogue holds.', 'chart', chart('bar', [
    {'label': 'Private ref.lab_test rows with a catalogue LOINC code', 'value': p_lab_in}, {'label': 'Private ref.lab_test rows without one', 'value': p_lab - p_lab_in},
    {'label': 'Public lab result rows with a catalogue test code', 'value': u_imp_in}, {'label': 'Public lab result rows with another code', 'value': u_imp - u_imp_in}]), 13, True)

put(DB, 'build', 'The database file', 'Engine, size, tables and keys.', 'text',
    f'''- **Engine:** SQLite {ver}, a single file (nhls_lab_codes.db in the registries folder). No server, port or login.
- **Size and date:** {ff['bytes']:,} bytes, last modified {ff['mtime']}.
- **Tables:** {len(tabs)} with {tot_cols} columns in total: ''' + '; '.join(f'{t} ({nrows[t]} rows)' for t in tabs) + f'''. The order and result tables are empty on purpose [4].
- **Relationships:** {len(fks)} foreign keys declared; foreign-key enforcement is {'on' if fkon else 'off'} for a plain connection, as it is by default in SQLite. {len(idxs)} indexes.
- **Catalogue:** {N} tests; {len(disc)} disciplines; {len(spec)} specimen types; {loinc} with a LOINC code and {snomed} with a SNOMED CT concept; {active} active.
- **Measured:** {TODAY}, opened read-only.''', 20)
put(DB, 'build', 'Tables and row counts', 'All tables with rows and columns.', 'table', table(['Table', 'Rows', 'Columns'], [[t, nrows[t], len(info[t])] for t in tabs]), 21)
put(DB, 'build', 'Columns', f'Every column ({tot_cols}) with type, whether it can be empty and keys. Meanings are taken from names.', 'table',
    table(['Table', 'Column', 'Type', 'Nullable', 'Key'], [[t, x['name'], x['type'], 'No' if x['notnull'] or x['pk'] else 'Yes', 'PK' if x['pk'] else ''] for t in tabs for x in info[t]]), 22)
put(DB, 'build', 'Declared relationships', 'The foreign keys declared in the file.', 'table', table(['From table', 'Column', 'To table', 'Column'], [[t, f['from'], f['table'], f['to']] for t, f in fks]) if fks else json.dumps({'columns': ['None'], 'rows': [['No foreign keys are declared']]}), 23)
put(DB, 'build', 'Catalogue column profile', 'Blank and distinct counts for the lab_test table, measured live.', 'table',
    table(['Column', 'Blank', 'Distinct', 'Longest'], [[k, blank[k], distinct[k], maxlen[k]] for k in cols]), 30)
put(DB, 'build', 'Sample rows', 'The first 5 catalogue rows. The table sampled is lab_test, a look-up list with no personal data.', 'table',
    table(['Code', 'Test', 'Discipline', 'Specimen', 'LOINC', 'Result type'], [[r['nhls_test_code'], r['test_name'], r['discipline'], r['specimen_type'], r['loinc_code'], r['result_type']] for r in lt[:5]]), 40)
put(DB, 'build', 'Where the catalogue is used in the estate', 'Measured live with read-only counts on the two hospital databases.', 'table', table(['Source', 'Table.column', 'Rows', 'Rows with a catalogue code'], [
    ['Private hospital', 'ref.lab_test.loinc_code', p_lab, f'{p_lab_in} ({pct(p_lab_in, p_lab)}) by LOINC; {p_lab_loinc} rows have a LOINC code'],
    ['Public hospital', 'dbo.LAB_RESULT_IMPORT.TEST_CODE', fmt(u_imp), f'{fmt(u_imp_in)} ({pct(u_imp_in, u_imp)}); {u_imp_dist_in} of {u_imp_dist} distinct codes'],
    ['Public hospital', 'dbo.LAB_REQ.NHLS_ACC_NO', fmt(u_acc), 'laboratory request rows carrying an NHLS accession number column']]), 50, True)
sc = '\n'.join(f"- {n}, {s:,} bytes, last modified {d:%d %B %Y at %H:%M}".replace(' 0', ' ') for n, s, d in scripts)
bk = '\n'.join(f"- {n}, {s:,} bytes, {d:%d %B %Y at %H:%M}".replace(' 0', ' ') for n, s, d in backups)
put(DB, 'build', 'How it was made', 'Built only from scripts, backups and records on this PC.', 'text',
    f'''**The scripts.** Unlike the three flat files, this database was built from scripts that still exist [3][4]:
{sc}

Per the final document, the first script created the four tables and the first 21 tests on 25 October 2026 and the second expanded the catalogue to {N} tests on 26 October, inserting only codes that do not already exist [4]. The file's last change is {ff['mtime']}, so the catalogue itself was not changed on 10 November.

**Backups.** Copies of the database kept on 10 November 2026:
{bk}

**What the alignment did.** The catalogue was not changed on 10 November. The hospitals were changed instead to carry its codes, with about 3% of matched codes mistyped on purpose, and some missing public lab results were filled in [4].''', 60)
put(DB, 'build', 'Security and access', 'How the file is protected. No credentials are described here.', 'text',
    'A SQLite file with no accounts, encryption or audit trail of its own, protected only by file-system permissions [4]. Open it read-only: the gateway must never write to it, and nothing in the database folder is committed, pushed or shared.', 70)
put(DB, 'build', 'How to query it', 'Read-only examples. Each returns counts, never anything personal.', 'queries',
    '''-- 1. Tests by discipline (SQLite, opened read-only)
SELECT discipline, COUNT(*) FROM lab_test GROUP BY discipline ORDER BY 2 DESC;

-- 2. Tests with and without a LOINC code
SELECT COUNT(*) FILTER (WHERE loinc_code IS NOT NULL AND loinc_code <> '') AS with_loinc, COUNT(*) AS all_tests FROM lab_test;

-- 3. Tests with a SNOMED CT concept
SELECT COUNT(*) FROM lab_test WHERE snomed_concept_id IS NOT NULL;

-- 4. Rows in each table
SELECT 'lab_test', COUNT(*) FROM lab_test UNION ALL SELECT 'lab_order', COUNT(*) FROM lab_order UNION ALL SELECT 'lab_order_test', COUNT(*) FROM lab_order_test UNION ALL SELECT 'lab_result', COUNT(*) FROM lab_result;

-- 5. Public hospital: result rows whose test code is in the catalogue (SQL Server, public_hospital)
SELECT COUNT(*) FROM dbo.LAB_RESULT_IMPORT WHERE TEST_CODE IN (/* the catalogue test codes */);''', 80)
put(DB, 'build', 'Reproduce these figures', 'The exact check behind each headline number on this page.', 'queries',
    f'''Tests ({N}), disciplines ({len(disc)}):  SQLite examples 1 and 4
LOINC ({loinc}), SNOMED CT ({snomed}), active ({active}):  examples 2 and 3
Rows in the order and result tables (0):  example 4
File size ({ff['bytes']:,} bytes), modified {ff['mtime']}:  Get-Item
Private lab rows with a catalogue LOINC code ({p_lab_in} of {p_lab}):  SELECT COUNT(*) FROM ref.lab_test WHERE loinc_code IN (...)
Public result rows with a catalogue code ({fmt(u_imp_in)} of {fmt(u_imp)}):  example 5
Measured on {TODAY}.''', 90)
put(DB, 'build', 'Decisions, gaps and open items', 'What was decided, what is missing (with sizes), and where each item stands.', 'text',
    f'''**Decisions (recorded in the final document)**
- **Use a SQLite file**, because the catalogue is a reference list that is consulted, not a live service [4].
- **Use our own invented test codes**, because the real NHLS codes are proprietary; LOINC and SNOMED CT are mapping fields and never the key [4].
- **Leave the order and result tables empty**; this is a catalogue, not a record of real tests [4].

**Gaps (measured)**
- The catalogue holds {N} tests. The final document puts the real catalogue at more than 2,400 [4]; I could not confirm that.
- Only {snomed} of {N} tests ({pct(snomed, N)}) carry a SNOMED CT concept.
- {p_lab - p_lab_in} of the private hospital's {p_lab} lab tests and {fmt(u_imp - u_imp_in)} of the public hospital's {fmt(u_imp)} imported result rows ({pct(u_imp - u_imp_in, u_imp)}) do not carry a catalogue code.
- Units differ on purpose between sources, so the gateway must convert before comparing.

**Open items**
| Item | Status |
| --- | --- |
| Check the codes against the real NHLS list | Not established (the real codes are proprietary) |
| Align hospital lab codes to the catalogue | Resolved on 10 November 2026 |
| Map hospital tests to the catalogue and LOINC with a translation table | Phase 2 |
| Partial SNOMED CT coverage | Design choice |
| Expand beyond {N} tests | Open. No decision has been made |''', 95)

for n, s, d in scripts:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Wrote {n.split(chr(92))[-1]}', 'A SQL script that builds or expands the laboratory catalogue was written at this time.', f'{n}, {s:,} bytes, last modified {d:%d %B %Y at %H:%M}.')
for n, s, d in backups:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Backed up the catalogue: {n.split(chr(92))[-2] + " / " if "_backups" in n else ""}{n.split(chr(92))[-1]}', 'A copy of the laboratory catalogue database was kept.', f'{n}, {s:,} bytes, dated {d:%d %B %Y at %H:%M}.')
log(DB, datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', 'NHLS record filled in depth', 'Background and Build record were written from the real database, live hospital counts and two opened real-world sources. Test code structure is marked not established.',
    f'Written from measurements on {TODAY}. Real-world facts about the service, its data warehouse and the June 2024 ransomware attack come from an opened journal article. Not established: the real test-code structure and catalogue size.')
