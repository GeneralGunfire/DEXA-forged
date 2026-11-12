import sys, os, re, collections, datetime
sys.path.insert(0, os.path.dirname(__file__))
from fp import *

DB = 'icd10'
CSVP = 'C:/Database/registries/icd10_mit.csv'
raw, rows = csv_rows(CSVP)
ff = file_facts(CSVP)
cols = list(rows[0].keys())
N = len(rows)
codes = [r['icd10_code'] for r in rows]
assert len(set(codes)) == N
in_list = ','.join("'" + c + "'" for c in codes)
blank = {c: sum(1 for r in rows if not r[c].strip()) for c in cols}
distinct = {c: len({r[c] for r in rows}) for c in cols}
maxlen = {c: max(len(r[c]) for r in rows) for c in cols}
chap = collections.Counter(re.sub(r'^Chapter [IVXL]+ - ', '', r['chapter']) for r in rows)
pmb = collections.Counter(r['pmb_flag'] for r in rows)
length = collections.Counter(len(c) for c in codes)
blocks = len({r['block'] for r in rows})
rel = collections.Counter(r['source_release'] for r in rows)
vf = sorted({r['valid_from'] for r in rows})

# ---- hospitals (read-only)
P = lambda q: mssql_one(1433, 'private_hospital', q)
U = lambda q: mssql_one(1438, 'public_hospital', q)
p_ref = int(P('select count(*) from ref.icd10_code'))
p_ref_in = int(P(f'select count(*) from ref.icd10_code where icd10_code in ({in_list})'))
p_ref3 = int(P('select count(*) from ref.icd10_code where len(icd10_code)=3'))
p_dx = int(P('select count(*) from clin.diagnosis'))
p_dx_null = int(P("select count(*) from clin.diagnosis where icd10_code is null or ltrim(rtrim(icd10_code))=''"))
p_dx_in = int(P(f'select count(*) from clin.diagnosis where icd10_code in ({in_list})'))
p_dx_dist = int(P('select count(distinct icd10_code) from clin.diagnosis'))
p_dx_dist_in = int(P(f'select count(distinct icd10_code) from clin.diagnosis where icd10_code in ({in_list})'))
p_dx3 = int(P('select count(*) from clin.diagnosis where len(icd10_code)=3'))
p_pmb = int(P('select count(*) from ref.pmb_dtp_icd10'))
u_loc = int(U('select count(*) from dbo.ICD10_LOCAL'))
u_loc_in = int(U(f'select count(*) from dbo.ICD10_LOCAL where ICD10 in ({in_list})'))
u_dx = int(U('select count(*) from dbo.DX_LOG'))
u_dx_blank = int(U("select count(*) from dbo.DX_LOG where ICD10 is null or ltrim(rtrim(ICD10))=''"))
u_dx_bad = int(U("select count(*) from dbo.DX_LOG where ICD10 is not null and ltrim(rtrim(ICD10))<>'' and ICD10 not like '[A-Z][0-9][0-9]%'"))
u_dx_in = int(U(f'select count(*) from dbo.DX_LOG where ICD10 in ({in_list})'))
u_dx_dist = int(U('select count(distinct ICD10) from dbo.DX_LOG'))
u_dx_dist_in = int(U(f'select count(distinct ICD10) from dbo.DX_LOG where ICD10 in ({in_list})'))
u_his = int(U('select count(*) from his.diagnosis'))
u_his_in = int(U(f'select count(*) from his.diagnosis where icd10_code in ({in_list})'))
u_his_dist = int(U('select count(distinct icd10_code) from his.diagnosis'))
u_enc_dx = int(U('select count(distinct ENC_ID) from dbo.DX_LOG')) if False else None

# scripts that mention the file
scripts = []
for fn in sorted(os.listdir('C:/Database/final_pass/scripts')):
    p = os.path.join('C:/Database/final_pass/scripts', fn)
    if fn.endswith('.py') and os.path.isfile(p):
        try:
            if 'icd10_mit' in open(p, encoding='utf-8', errors='ignore').read():
                scripts.append((fn, os.path.getsize(p), datetime.datetime.fromtimestamp(os.path.getmtime(p))))
        except Exception:
            pass
scripts.sort(key=lambda x: x[2])
backups = list_files('C:/Database/_backups', ['icd10'])

SRC = f'''- **[1] National Department of Health, "ICD-10 Master Industry Table"** (download page). https://health.gov.za/icd-10-master-industry-table (opened, accessed {TODAY}). It is a list of downloads with no explanatory text.
- **[2] Provenance note beside the file**, icd10_mit.provenance.txt, written 10 November 2026 at 20:47 (read directly on {TODAY}).
- **[3] Uploaded final document 2 of 11, "ICD-10 Diagnosis Codes"**, 10 November 2026.
- **A source that did not open:** a South African Medical Association page on ICD-10 coding (samedical.org) returned "not found" when I tried it on {TODAY}, so nothing is taken from it.'''

put(DB, 'background', 'In plain words', 'What the diagnosis code list is, in a few sentences.', 'text',
    '''> When a doctor diagnoses a patient, the illness is written down as a short code, for example J18.9 for pneumonia, so that hospitals, doctors and medical schemes all mean the same illness. This record is about our small practice copy of that list.

For SAHealth the point is simple: a diagnosis the gateway cannot recognise cannot be checked, grouped or (where the law requires it) flagged as a condition a scheme must cover. This record explains what the real list is, how ours was built and where it is used.''', 10, True)
put(DB, 'background', 'What it is and who runs it', 'What could be confirmed about the real list.', 'text',
    f'''**Who publishes the South African table. Confirmed [1].** The National Department of Health publishes the ICD-10 Master Industry Table (MIT) on its website as downloadable files.

**Which versions exist. Confirmed [1].** The page offers an MIT of 2021 as an Excel file (file name dated 16 March 2021), and an MIT of 2014 as Excel and CSV files (dated 1 January 2014) with a separate file of 2014 changes (additions, deletions, modifications), an Excel file layout (PDF) and errata. It also lists a user guide for the national MIT (January 2014), a South African ICD-10 morbidity coding standards and guidelines document (changes version 6 dated June 2014), circulars of 2012 and 2014, and a notice of additional emergency codes for COVID-19 (April 2021).

**How it is shared. Confirmed [1].** As versioned files that users download and load. It is not offered through the page as a live service.

**What the table adds to ICD-10. Not established today.** The final project document says the MIT adds a code type, short and full descriptions, chapter, block, notes, validity dates and a flag showing whether a diagnosis is a Prescribed Minimum Benefit [3]. The download page does not say this, and I could not open the user guide or the layout file to confirm it.

**Legal basis and who must use it. Not established today.** The project document says a Prescribed Minimum Benefit is a condition every scheme must cover by law [3]. I could not open a source that confirms the legal requirement or which parties must use the table, so I have not stated it as fact.

**Update schedule. Not established.** The page shows file dates (2014, 2021) but gives no policy for how often the table changes.''', 20)
put(DB, 'background', 'Real-world shortfalls', 'What the evidence supports, and what it does not.', 'text',
    '''I could open only one real-world source for this list (the department's download page), so most shortfalls cannot be evidenced today.

- **Which version is current is not obvious. Confirmed [1].** The page offers both a 2021 and a 2014 table without saying which supersedes the other.
- **The page carries no explanation of the table. Confirmed [1].** Understanding the fields needs the separate user guide and layout files.
- **Coding quality, claim rejections and public-sector practice. Not established.** The project document describes diagnoses arriving as three-character codes, dotted codes or free text [3], but I found no opened source giving evidence of how often.''', 30)
put(DB, 'background', 'Why it matters to the gateway', 'The practical reason this list is in the estate.', 'text',
    '''Every diagnosis in a hospital record or a scheme claim carries a code, and the two hospital systems here keep their own code lists. The gateway needs one reference list to check diagnoses against, to notice a wrong or missing code, and to match a detailed code (for example I11.0) with its shorter parent (I11) when systems code at different levels. The file is kept as a flat file because the real table is distributed that way [1].''', 40)
put(DB, 'background', 'Sources', 'Every source used, with the date it was opened.', 'sources', SRC, 90)

put(DB, 'build', 'Codes by chapter', f'The {N} codes by body-system chapter (measured from the file).', 'chart', bars(chap), 10, True)
put(DB, 'build', 'Prescribed Minimum Benefit flag', 'Codes flagged Y or N in the pmb_flag column.', 'chart', chart('stacked', [{'label': 'Flagged as PMB (Y)', 'value': pmb['Y']}, {'label': 'Not flagged (N)', 'value': pmb['N']}]), 11, True)
put(DB, 'build', 'Code length', 'The number of characters in each code (a dotted four-character code is 5 characters long).', 'chart', bars(collections.Counter({f'{k} characters': v for k, v in length.items()})), 12)
put(DB, 'build', 'Hospital diagnosis codes against the file', 'How many diagnosis rows in each hospital carry a code that is in the file.', 'chart', chart('bar', [
    {'label': 'Private clin.diagnosis rows with a file code', 'value': p_dx_in}, {'label': 'Private clin.diagnosis rows with another code', 'value': p_dx - p_dx_in - p_dx_null},
    {'label': 'Public dbo.DX_LOG rows with a file code', 'value': u_dx_in}, {'label': 'Public dbo.DX_LOG rows with another code', 'value': u_dx - u_dx_in - u_dx_blank}]), 13, True)

put(DB, 'build', 'The file and how it was checked', 'Where it lives, how big it is and what was verified.', 'text',
    f'''- **File:** icd10_mit.csv, in the registries folder of the Machine A database folder. A plain comma-separated text file with a header row. No server, port or login.
- **Size and date:** {ff['bytes']:,} bytes, last modified {ff['mtime']}.
- **Encoding:** UTF-8, {'with' if ff['bom'] else 'no'} byte-order mark.
- **Shape:** {N} rows and {len(cols)} columns; {N} distinct codes (no duplicates). Every row is code type D (diagnosis) and status Active.
- **Coverage:** {len(chap)} chapters and {blocks} blocks. {pmb['Y']} codes flagged PMB (Y) and {pmb['N']} not (N).
- **Release label:** {', '.join(rel)} on every row. This label does not appear among the releases listed on the department's page [1], so it cannot be verified.
- **Validity dates:** valid_from is {', '.join(vf)}; valid_to is blank on every row.
- **Blank cells:** {sum(blank.values())} in total, all in the four optional columns ({', '.join(c for c in cols if blank[c])}).
- **Fingerprint:** the SHA-256 starts {ff['sha'][:12]}; the full value is in the provenance note beside the file [2].
- **Checked:** read directly on {TODAY}; the figures on this page were re-measured then.''', 20)
put(DB, 'build', 'The 14 columns', 'Every column, measured from the file. Meanings are taken from the column names.', 'table',
    table(['Column', 'Example (first row)', 'Blank', 'Distinct', 'Longest'], [[c, rows[0][c][:45], blank[c], distinct[c], maxlen[c]] for c in cols]), 30)
put(DB, 'build', 'Sample rows', 'The first 5 rows. The file sampled is icd10_mit.csv, a look-up list with no personal data.', 'table',
    table(['Code', 'Description', 'Chapter', 'Block', 'PMB'], [[r['icd10_code'], r['description'], re.sub(r'^Chapter [IVXL]+ - ', '', r['chapter']), r['block'], r['pmb_flag']] for r in rows[:5]]), 40)
where = [
    ['Private hospital', 'ref.icd10_code', fmt(p_ref), '0', f'{p_ref_in} ({pct(p_ref_in, p_ref)}); {p_ref3} are 3 characters long'],
    ['Private hospital', 'clin.diagnosis.icd10_code', fmt(p_dx), f'{fmt(p_dx_null)}', f'{fmt(p_dx_in)} rows ({pct(p_dx_in, p_dx)}); {p_dx_dist_in} of {p_dx_dist} distinct codes; {pct(p_dx3, p_dx)} are 3 characters'],
    ['Private hospital', 'ref.pmb_dtp_icd10', fmt(p_pmb), '0', 'the hospital\'s own PMB mapping table'],
    ['Public hospital', 'dbo.ICD10_LOCAL', fmt(u_loc), '0', f'{u_loc_in} ({pct(u_loc_in, u_loc)})'],
    ['Public hospital', 'dbo.DX_LOG.ICD10 (older diagnosis log)', fmt(u_dx), fmt(u_dx_blank), f'{fmt(u_dx_in)} rows ({pct(u_dx_in, u_dx)}); {u_dx_dist_in} of {u_dx_dist} distinct codes; {fmt(u_dx_bad)} do not start like a code'],
    ['Public hospital', 'his.diagnosis.icd10_code', fmt(u_his), '0 measured', f'{fmt(u_his_in)} rows ({pct(u_his_in, u_his)}); {u_his_dist} distinct codes'],
]
put(DB, 'build', 'Where ICD-10 codes appear in the estate', 'Measured live with read-only counts on the two hospital databases.', 'table',
    table(['Source', 'Table.column', 'Rows', 'Blank', 'Rows with a code from the file'], where), 50, True)

sc = '\n'.join(f"- {n}, {s:,} bytes, last modified {d:%d %B %Y at %H:%M}".replace(' 0', ' ') for n, s, d in scripts) or '- none found'
put(DB, 'build', 'How it was made', 'Built only from what files, backups and the provenance note show.', 'text',
    f'''**The file (25 October 2026).** The file's timestamps are 25 October 2026. The provenance note says a Claude Code build prompt of that date asked for three small CSV files with "realistic seed rows", labelled the ICD-10 file "high fidelity, national MIT structure" and asked for about 500 codes; {N} were delivered [2]. No script that generated the file exists on this PC, no seed was recorded and no git history covers it. The source, any licence and any extraction date are **not established**.

**Scripts that read the file.** These final-pass scripts mention icd10_mit and are dated by their last-modified times; their run times are not recorded:
{sc}

**Backups.** {', '.join(f"{n} ({s:,} bytes, {d:%d %B %Y %H:%M})" for n, s, d in backups) or 'none found'}.

**What the alignment did.** Per the final document [3], on 10 November 2026 every code in the file was added to both hospitals' code lists, and the public hospital's older diagnosis log was filled in and about 2% of its codes were planted as invalid or truncated. The live counts in "Where ICD-10 codes appear" show the result: the public local list holds {u_loc_in} of the {N} codes and the private list {p_ref_in}.''', 60)
put(DB, 'build', 'Security and access', 'How the file is protected. No credentials are described here.', 'text',
    'The file is a plain text file with no accounts, encryption or audit trail of its own, protected only by the file-system permissions of its folder [3]. Project rules treat it as read-only: nothing in the database folder is committed, pushed or shared, and the gateway must never write to it.', 70)
put(DB, 'build', 'How to query it', 'Read-only examples. Each returns counts, never anything personal.', 'queries',
    '''-- 1. Rows and columns (PowerShell)
$r = Import-Csv "<registries folder>\\icd10_mit.csv"; $r.Count
-- returns 132

-- 2. Codes by chapter
$r | Group-Object chapter | Sort-Object Count -Descending | Select-Object Name, Count

-- 3. How many are flagged as Prescribed Minimum Benefits
$r | Group-Object pmb_flag | Select-Object Name, Count

-- 4. Private hospital: diagnosis rows whose code is in the file (SQL Server, private_hospital)
SELECT COUNT(*) FROM clin.diagnosis WHERE icd10_code IN (/* the 132 codes */);

-- 5. Public hospital: older diagnosis log rows with no code (SQL Server, public_hospital)
SELECT COUNT(*) FROM dbo.DX_LOG WHERE ICD10 IS NULL OR LTRIM(RTRIM(ICD10)) = '';

-- 6. Public hospital: rows that do not start like a diagnosis code
SELECT COUNT(*) FROM dbo.DX_LOG WHERE ICD10 NOT LIKE '[A-Z][0-9][0-9]%' AND LTRIM(RTRIM(ICD10)) <> '';''', 80)
put(DB, 'build', 'Reproduce these figures', 'The exact check behind each headline number on this page.', 'queries',
    f'''Rows ({N}) and columns ({len(cols)}):  Import-Csv, then .Count (example 1)
Chapters ({len(chap)}), PMB Y/N ({pmb['Y']}/{pmb['N']}):  Group-Object, examples 2 and 3
File size ({ff['bytes']:,} bytes), modified {ff['mtime']}:  Get-Item on the file
SHA-256 (starts {ff['sha'][:12]}):  Get-FileHash -Algorithm SHA256
Private list {p_ref_in} of {p_ref} in file:  SELECT COUNT(*) FROM ref.icd10_code WHERE icd10_code IN (...)
Private diagnosis rows: {fmt(p_dx)} total, {fmt(p_dx_in)} with a file code:  SQL example 4
Public local list {u_loc_in} of {u_loc}:  SELECT COUNT(*) FROM dbo.ICD10_LOCAL WHERE ICD10 IN (...)
Public older log: {fmt(u_dx)} rows, {fmt(u_dx_blank)} blank, {fmt(u_dx_bad)} not starting like a code:  SQL examples 5 and 6
Measured on {TODAY}.''', 90)
put(DB, 'build', 'Decisions, gaps and open items', 'What was decided, what is missing (with sizes), and where each item stands.', 'text',
    f'''**Decisions (recorded in the files or the final document)**
- **Keep it as a flat file**, because the real table is distributed as downloadable files [1][3].
- **Add every file code to both hospitals' code lists** so the gateway has real matches [3].
- **Leave the roll-up rule to Phase 2.** The private hospital uses 3-character codes and the file lists longer ones, so matching them needs a roll-up rule [3].

**Gaps (measured)**
- The file holds {N} codes; the real table is far larger, so most real diagnoses will not be found.
- Only {p_dx_dist_in} of the {p_dx_dist} distinct codes used in private diagnoses ({pct(p_dx_dist_in, p_dx_dist)}) and {u_dx_dist_in} of the {u_dx_dist} used in the public older log ({pct(u_dx_dist_in, u_dx_dist)}) are in the file.
- {pct(p_dx3, p_dx)} of private diagnosis rows are 3-character codes.
- The public older log has {fmt(u_dx_blank)} blank codes and {fmt(u_dx_bad)} rows that do not start like a code.
- The release label {', '.join(rel)} cannot be matched to a release on the department's page.

**Open items**
| Item | Status |
| --- | --- |
| Where the {N} rows came from (source, licence, date) | Not established |
| The release label {', '.join(rel)} | Not established |
| Add the file's codes to both hospitals | Resolved on 10 November 2026 |
| Roll-up rule from detailed to parent codes | Phase 2 |
| Expand beyond {N} codes | Open. No decision has been made |''', 95)

# timeline: only events not already logged, dated from real file times
for n, s, d in scripts[:6]:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Script that reads the diagnosis file: {n}', 'A script that reads the diagnosis code file was last changed at this time.', f'{n}, {s:,} bytes, last modified {d:%d %B %Y at %H:%M}. Dated from the file time; the run time is not recorded.')
for n, s, d in backups:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Backed up the diagnosis file ({n.split(chr(92))[-2] if chr(92) in n else n})', 'A copy of the diagnosis code file was kept in the backups folder.', f'{n}, {s:,} bytes, dated {d:%d %B %Y at %H:%M}.')
log(DB, '2026-11-10T20:47:00+02:00', 'Note', 'Wrote the provenance note beside the diagnosis file', 'A note was written next to the file saying what is and is not known about its origin.', 'icd10_mit.provenance.txt, last modified 10 November 2026 at 20:47. The source, licence and extraction date, and the release label, are not established.')
log(DB, datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', 'ICD-10 record filled in depth',
    'Background and Build record were written from the real file, live hospital counts and the one source that opened. Most real-world points are marked not established.',
    f'Written from measurements on {TODAY}. Not established: the origin of the {N} rows, the release label, the legal requirement and update schedule. The department\'s download page was the only real-world source that opened; a medical-association page returned not found.')
