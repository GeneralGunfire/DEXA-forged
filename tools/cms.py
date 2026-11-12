import sys, os, datetime
sys.path.insert(0, os.path.dirname(__file__))
from fp import *

DB = 'cms'; PORT = 5433; DBN = 'cms_schemes'
Q = lambda q: pg_rows(PORT, DBN, q)
one = lambda q: Q(q)[0][0]
ver = one('select version()').split(',')[0]
size = int(one(f"select pg_database_size('{DBN}')"))
enc = one("select pg_encoding_to_char(encoding) from pg_database where datname=current_database()")
tabs = Q("select table_name,(xpath('/row/c/text()',query_to_xml('select count(*) as c from public.'||table_name,false,true,'')))[1]::text,(select count(*) from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name) from information_schema.tables t where table_schema='public' and table_type='BASE TABLE' order by 1")
cols = Q("select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position")
pks = {(r[0], r[1]) for r in Q("select tc.table_name,kcu.column_name from information_schema.table_constraints tc join information_schema.key_column_usage kcu using (constraint_name,table_schema) where tc.constraint_type='PRIMARY KEY' and tc.table_schema='public'")}
fks = Q("select conrelid::regclass::text, a.attname, confrelid::regclass::text, af.attname, case when convalidated then 'enforced' else 'not validated' end from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] join pg_attribute af on af.attrelid=c.confrelid and af.attnum=c.confkey[1] where c.contype='f' and c.connamespace='public'::regnamespace order by 1,2")
rows = {t[0]: int(t[1]) for t in tabs}
nT = len(tabs); nC = len(cols); nR = sum(rows.values())
schemes = Q('select scheme_code,scheme_name,scheme_type,registrar_status,registration_date from medical_scheme order by scheme_name')
stype = Q('select scheme_type,count(*) from medical_scheme group by 1 order by 2 desc')
mst = Q('select membership_status,count(*) from scheme_member group by 1 order by 2 desc')
rel = Q('select relationship,count(*) from scheme_member group by 1 order by 2 desc')
per = Q('select s.scheme_name,count(*) from scheme_member m join medical_scheme s using (scheme_id) group by 1 order by 2 desc')
opts = Q('select s.scheme_name,count(*) from scheme_option o join medical_scheme s using (scheme_id) group by 1 order by 2 desc')
nm = rows['scheme_member']; ns = rows['medical_scheme']; no = rows['scheme_option']
filled = {k: int(one(f"select count(*) from scheme_member where {k} is not null and cast({k} as text)<>''")) for k in ['sa_id_number', 'date_of_birth', 'principal_member_id']}
sfill = {k: int(one(f"select count(*) from medical_scheme where {k} is not null and {k}<>''")) for k in ['registration_number', 'contact_telephone', 'contact_email', 'website', 'head_office_address', 'administrator_name']}
mems = {r[0] for r in Q('select member_number from scheme_member')}
prv = {r[0] for r in mssql_rows(1433, 'private_hospital', 'select membership_no from pat.patient_scheme_membership where membership_no is not null')}
prv_n = int(mssql_one(1433, 'private_hospital', 'select count(*) from pat.patient_scheme_membership'))
pub = {r[0] for r in mssql_rows(1438, 'public_hospital', 'select MEMBER_NO from dbo.PAT_MEDAID where MEMBER_NO is not null')}
pub_n = int(mssql_one(1438, 'public_hospital', 'select count(*) from dbo.PAT_MEDAID'))
prv_hit = len(prv & mems); pub_hit = len(pub & mems)
prv_sch = int(mssql_one(1433, 'private_hospital', 'select count(*) from ref.medical_scheme'))
scripts = [x for x in list_files('C:/Database', ['cms', 'b1_link', 'r_f1', 'r_a6789']) if x[0].endswith(('.sql', '.py'))]
bk = list_files('C:/Database/backups', ['cms_schemes']) + list_files('C:/Database/_backups', ['cms_schemes'])
dts = lambda d: d.strftime('%d %B %Y at %H:%M').lstrip('0')
sd = {a: int(b) for a, b in mst}; rel = [(a, int(b)) for a, b in rel]

SRC = f'''- **[1] Council for Medical Schemes Annual Report 2025/26**, tabled in Parliament. https://static.pmg.org.za/CMS_2025-26_AR.pdf (16 MB, text extracted and read, accessed {TODAY}).
- **[2] Press analysis of the council's 2024 industry data**, https://www.moonstone.co.za/?p=60480 (search summary only, not opened; used only where marked Partly, accessed {TODAY}).
- **[3] Build methods, facts file and provenance held with the database** (read directly on {TODAY}).
- **[4] Uploaded final document 8 of 11**, 10 November 2026.'''

put(DB, 'background', 'In plain words', 'What the medical schemes regulator and its data are, in a few sentences.', 'text',
    '''> A medical scheme is a members' fund that pays for health care. The Council for Medical Schemes is the regulator: it registers the schemes and checks they are sound. This record is about our small practice copy: ten schemes with their options and 8,000 invented members.

For SAHealth the point is simple: when a private hospital bills a scheme, the gateway can check the scheme exists and the member number is real and current.''', 10, True)
put(DB, 'background', 'What it is and who runs it', 'What could be confirmed about the real regulator and schemes.', 'text',
    '''**The regulator. Confirmed [1].** The Council for Medical Schemes (CMS) regulates medical schemes in South Africa under the Medical Schemes Act (131 of 1998) and its Regulations, to protect the interests of scheme beneficiaries.

**Size of the industry. Confirmed [1].** The 2025/26 annual report says the CMS oversees 70 medical schemes, 16 open and 54 restricted, covering about 9.17 million beneficiaries, served by 36 administrators, 42 managed care organisations, 7,793 accredited individual brokers and 2,182 accredited brokerages. By the end of March 2026 the industry comprised 70 registered schemes.

**Trend. Confirmed [1].** Schemes fell from 144 in 2000, but the report says consolidation has largely plateaued. Beneficiaries rose from about 9.13 million in 2023 to 9.17 million in 2024 (about 0.45%), lagging population growth, and average age rose from 34.0 to 34.2 years.

**Financial health. Confirmed [1].** The report gives an industry solvency ratio of 40.87% in 2024 against a statutory minimum of 25%.

**Open and restricted. Confirmed [1].** Open schemes accept anyone; restricted schemes serve a defined group (such as an employer or union). Our copy holds 8 open and 2 restricted.

**All ten practice-copy schemes are real names. Confirmed [1].** Each of Bestmed, Bonitas, Discovery Health, Fedhealth, GEMS, Keyhealth, Medihelp, Medshield, Momentum and SAMWUMED appears in the report's list of registered schemes. Whether each is open or restricted as shown in our copy was not checked against that list.''', 20)
put(DB, 'background', 'Real-world shortfalls', 'Problems the opened sources evidence.', 'text',
    '''- **Membership is not keeping pace with the population. Confirmed [1].** Beneficiary growth of about 0.45% a year lags population growth, and the member base is ageing.
- **Consolidation has left a concentrated industry. Partly [2].** A press summary describes the industry as bigger, older and more concentrated; I did not open it.
- **Rising cost pressure. Partly [1].** The report notes PMB expenditure rising sharply, for example by 9.09%, but I did not read the underlying tables.
- **Member numbers are scheme-specific and not standardised. Not established.** No opened source says so; our copy uses scheme-specific formats because the final document says to [4].''', 30)
put(DB, 'background', 'Why it matters to the gateway', 'The practical reason this database is in the estate.', 'text',
    'The private hospital records each patient\'s scheme and member number; the public hospital records a medical-aid number for some patients. The gateway needs the scheme list and member register to confirm that a claim is for a real, current member of a real scheme [4].', 40)
put(DB, 'background', 'Sources', 'Every source used, with the date it was opened.', 'sources', SRC, 90)

put(DB, 'build', 'Members by scheme', f'The {nm:,} members by scheme (measured).', 'chart', chart('bar', [{'label': a, 'value': int(b)} for a, b in per]), 10, True)
put(DB, 'build', 'Membership status', f'Status of the {nm:,} members.', 'chart', chart('stacked', [{'label': a, 'value': int(b)} for a, b in mst]), 11, True)
put(DB, 'build', 'Relationship to principal member', 'Who the members are.', 'chart', chart('bar', [{'label': a, 'value': int(b)} for a, b in rel]), 12)
put(DB, 'build', 'Practice copy against the real industry', 'Our copy is deliberately small; real figures are from the 2025/26 annual report.', 'chart', chart('bar', [
    {'label': 'Schemes in the practice copy', 'value': ns}, {'label': 'Registered schemes, March 2026', 'value': 70}]), 13)

put(DB, 'build', 'The database', 'Engine, size, tables and keys.', 'text',
    f'''- **Engine:** {ver}. Database {DBN}, localhost port {PORT}, encoding {enc} (an older Windows encoding, accepted [3]). Read-only measurements; no credentials are described here.
- **Size:** {size:,} bytes on disk.
- **Tables:** {nT} with {nC} columns and {nR:,} rows; empty: {', '.join(t[0] for t in tabs if int(t[1]) == 0) or 'none'}.
- **Relationships:** {len(fks)} foreign keys, including members pointing at their principal member.
- **Content:** {ns} schemes, {no} options, {nm:,} members ({sd.get('Active', 0):,} Active). No member carries an SA ID (by design).
- **Measured:** {TODAY}.''', 20)
put(DB, 'build', 'Tables and row counts', 'All tables with rows and columns.', 'table', table(['Table', 'Rows', 'Columns'], [[t[0], f'{int(t[1]):,}', t[2]] for t in tabs]), 21)
put(DB, 'build', 'Columns', f'Every column ({nC}) with type, whether it can be empty and keys. Meanings are taken from names.', 'table',
    table(['Table', 'Column', 'Type', 'Nullable', 'Key'], [[c[0], c[1], c[2], 'Yes' if c[3] == 'YES' else 'No', 'PK' if (c[0], c[1]) in pks else ''] for c in cols]), 22)
put(DB, 'build', 'Declared relationships', f'The {len(fks)} foreign keys the database enforces.', 'table', table(['From table', 'Column', 'To table', 'Column', 'State'], fks), 23)
put(DB, 'build', 'The schemes', 'The ten schemes held. These are organisations, not people.', 'table',
    table(['Code', 'Scheme', 'Type', 'Status', 'Registered'], [list(r) for r in schemes]), 30)
put(DB, 'build', 'Options per scheme', f'The {no} benefit options by scheme.', 'table', table(['Scheme', 'Options'], [[a, b] for a, b in opts]), 31)
put(DB, 'build', 'Column fill rates', 'How many rows carry each column. Counts only, no values.', 'table',
    table(['Table', 'Column', 'Filled', 'Of'], [['scheme_member', k, v, nm] for k, v in filled.items()] + [['medical_scheme', k, v, ns] for k, v in sfill.items()]), 32)
put(DB, 'build', 'Sample rows', 'No member rows are shown.', 'text', 'The member table holds personal fields (names, dates of birth, member numbers), even though every value is invented. By the standing rule, no row from it is published. The scheme list above is shown in full because it holds organisations only.', 40)
put(DB, 'build', 'Where the member numbers are used in the estate', 'Measured live with read-only counts; the numbers themselves are not published.', 'table', table(['Source', 'Table.column', 'Rows', 'Number found in this register'], [
    ['Private hospital', 'pat.patient_scheme_membership.membership_no', prv_n, f'{prv_hit} ({pct(prv_hit, prv_n)})'],
    ['Public hospital', 'dbo.PAT_MEDAID.MEMBER_NO', pub_n, f'{pub_hit} ({pct(pub_hit, pub_n)})'],
    ['Private hospital', 'ref.medical_scheme', prv_sch, f'its own list of schemes (this register holds {ns})']]), 50, True)
sc = '\n'.join(f"- {n}, {s:,} bytes, last modified {dts(d)}" for n, s, d in scripts)
bkt = '\n'.join(f"- {n}, {s:,} bytes, {dts(d)}" for n, s, d in bk)
put(DB, 'build', 'How it was made', 'Built from scripts and backups on this PC.', 'text',
    f'''**Scripts that still exist** [3][4]:
{sc}

Per the build methods: the schema script creates 4 tables and seeds the first schemes; the population script inserts the members as literal INSERT statements (about 8,000 membership records scaled from an 8.9 million beneficiary anchor, 7 schemes seeded). Later passes tied 454 members to linked private-hospital patients, and added three schemes (SAMWUMED, Keyhealth and Medshield Medical Scheme, which replaced an unverified scheme). The generator of the population SQL and its seed are not recorded [3].

**Backups** (pg_dump files on 10 November 2026):
{bkt}''', 60)
put(DB, 'build', 'Security and access', 'How the database is protected. No credentials are described here.', 'text',
    'One PostgreSQL superuser account is used, with a stored password entry that is not described here; there is no read-only role [3]. The data is invented but shaped like real personal data, so it is treated as personal: read-only, never copied or committed.', 70)
put(DB, 'build', 'How to query it', 'Read-only examples (PostgreSQL) that return counts only.', 'queries',
    '''-- 1. Members by status
SELECT membership_status, COUNT(*) FROM scheme_member GROUP BY 1 ORDER BY 2 DESC;

-- 2. Members per scheme
SELECT s.scheme_name, COUNT(*) FROM scheme_member m JOIN medical_scheme s USING (scheme_id) GROUP BY 1 ORDER BY 2 DESC;

-- 3. Options per scheme
SELECT s.scheme_name, COUNT(*) FROM scheme_option o JOIN medical_scheme s USING (scheme_id) GROUP BY 1;

-- 4. Principal members
SELECT COUNT(*) FROM scheme_member WHERE relationship = 'Principal';

-- 5. Row counts
SELECT (SELECT COUNT(*) FROM medical_scheme), (SELECT COUNT(*) FROM scheme_option), (SELECT COUNT(*) FROM scheme_member), (SELECT COUNT(*) FROM scheme_code_mapping);''', 80)
put(DB, 'build', 'Reproduce these figures', 'The exact check behind each headline number on this page.', 'queries',
    f'''Schemes ({ns}), options ({no}), members ({nm:,}):  query 5
Active ({sd.get('Active', 0):,}), suspended ({sd.get('Suspended', 0)}), terminated ({sd.get('Terminated', 0)}), pending ({sd.get('Pending', 0)}):  query 1
Principal members ({dict(rel).get('Principal', 0)}):  query 4
Hospital links ({prv_hit} private, {pub_hit} public):  compare pat.patient_scheme_membership.membership_no and dbo.PAT_MEDAID.MEMBER_NO with scheme_member.member_number (done outside the databases; numbers not printed)
Measured on {TODAY}.''', 90)
put(DB, 'build', 'Decisions, gaps and open items', 'What was decided, what is missing (with sizes), and where each item stands.', 'text',
    f'''**Decisions (recorded in the build methods and facts file)**
- **No member carries an SA ID**, by design; matching must use names, dates of birth and member numbers [3].
- **Leave scheme_code_mapping empty and keep the older WIN1252 encoding**, both accepted [3].
- **Replace an unverified scheme with Medshield Medical Scheme** in the final pass [3].

**Gaps (measured)**
- {ns} schemes against 70 registered in March 2026 [1]; {nm:,} members against about 9.17 million beneficiaries.
- scheme_code_mapping has {rows.get('scheme_code_mapping', 0)} rows, so no scheme-specific codes are translated.
- Scheme contact details: telephone {sfill['contact_telephone']}, email {sfill['contact_email']}, website {sfill['website']} filled of {ns}.
- {sd.get('Suspended', 0) + sd.get('Terminated', 0) + sd.get('Pending', 0):,} of {nm:,} members are not Active; the real equivalent is not established.
- Private hospital holds {prv_n} scheme-membership rows, of which {prv_n - prv_hit} do not match a member here (mistyped or stale on purpose).

**Open items**
| Item | Status |
| --- | --- |
| Population generator and seed | Not established (not recorded) |
| Check open or restricted type against the real list | Open. No decision has been made |
| Link members to patients beyond the 454 | Open. No decision has been made |
| Fill scheme_code_mapping | Open. Accepted as empty for now |''', 95)

for n, s, d in scripts:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Wrote {n.split(chr(92))[-1]}', 'A script that builds or changes the medical schemes database was written at this time.', f'{n}, {s:,} bytes, last modified {dts(d)}.')
for n, s, d in bk:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Backed up the schemes database: {n.split(chr(92))[-1]}', 'A pg_dump copy was kept.', f'{n}, {s:,} bytes, dated {dts(d)}.')
log(DB, datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', 'Document differs from live data: scheme and member counts', 'The build methods describe 7 schemes and 37 options seeded; the live database now holds ten schemes and 40 options.',
    f'The population script seeds 7 schemes and 37 options (build methods). The live database holds {ns} schemes and {no} options after later passes added three schemes. The document was not edited.')
log(DB, datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', 'CMS record filled in depth', 'Background and Build record were written from the live database, hospital counts and the 2025/26 annual report.',
    f'Written from measurements on {TODAY}. Not established: open or restricted type of each practice scheme against the real list, and the origin of the 8.9 million anchor.')
