import sys, os, re, datetime, collections
sys.path.insert(0, os.path.dirname(__file__))
from fp import *
if os.environ.get('NOLOG'):
    log = lambda *a, **k: None

which = sys.argv[1]
PRIV = which == 'private'
DB = 'private_hospital' if PRIV else 'public_hospital'
PORT = 1433 if PRIV else 1438
DBN = 'private_hospital' if PRIV else 'public_hospital'
ENC = 'adt.encounter' if PRIV else 'his.encounter'
PAT = 'pat.patient' if PRIV else 'his.patient'
short = 'the private hospital' if PRIV else 'the public hospital'
H = lambda q: mssql_rows(PORT, DBN, q)
one = lambda q: mssql_one(PORT, DBN, q)
dts = lambda d: d.strftime('%d %B %Y at %H:%M').lstrip('0')

prof = mssql_profile(DB, PORT, DBN, short, [], 20, True)
cnt = prof['cnt']; tabs = prof['tabs']
nT = int(cnt['tables']); nCols = int(cnt['columns']); nRows = int(cnt['rows'] or 0)
schemas = H("select s.name,count(*),cast(coalesce(sum(r.n),0) as bigint) from sys.tables t join sys.schemas s on s.schema_id=t.schema_id outer apply (select sum(p.rows) n from sys.partitions p where p.object_id=t.object_id and p.index_id in (0,1)) r group by s.name order by 3 desc")
npat = int(one(f'select count(*) from {PAT}')); nenc = int(one(f'select count(*) from {ENC}'))
span = H(f"select convert(varchar(10),min(admit_dt),120),convert(varchar(10),max(admit_dt),120) from {ENC}")[0]
monthly = H(f"select convert(char(7),admit_dt,120),count(*) from {ENC} group by convert(char(7),admit_dt,120) order by 1")
flags = H(f"select coalesce(data_quality_flag,'(none)'),count(*) from {ENC} group by data_quality_flag order by 2 desc")
top = tabs[:12]
empty = [t for t in tabs if int(t[1]) == 0]
nonkey = int(cnt['nokey'])
# estate links
hp = {r[0] for r in mssql_rows(1437, 'hpcsa_registry', 'select hpcsa_registration_no from dbo.practitioner')}
sn = {r[0] for r in lite('C:/Database/registries/sanc_registry.db').execute('select sanc_registration_no from nurse').fetchall()}
cm = {r[0] for r in pg_rows(5433, 'cms_schemes', 'select member_number from scheme_member')}
hs = {r[0] for r in mssql_rows(1436, 'hprs_identity', 'select sa_id_number from dbo.patient where sa_id_number is not null')}
if PRIV:
    staff = [r[0] for r in H('select council_reg_no from hr.staff where council_reg_no is not null')]
    nstaff = int(one('select count(*) from hr.staff'))
    mem = [r[0] for r in H('select membership_no from pat.patient_scheme_membership where membership_no is not null')]
    nmem = int(one('select count(*) from pat.patient_scheme_membership'))
    sid = [r[0] for r in H("select id_value from pat.patient_identifier where id_type_code='SA_ID'")]
    fcode = H('select facility_code,count(*) from fac.facility group by facility_code')
else:
    staff = [r[0] for r in H('select HPCSA_SANC_NO from dbo.STAFF_MASTER where HPCSA_SANC_NO is not null')]
    nstaff = int(one('select count(*) from dbo.STAFF_MASTER'))
    mem = [r[0] for r in H('select MEMBER_NO from dbo.PAT_MEDAID where MEMBER_NO is not null')]
    nmem = int(one('select count(*) from dbo.PAT_MEDAID'))
    sid = [r[0] for r in H('select id_number from his.patient where id_number is not null')]
    fcode = H('select facility_code,count(*) from his.encounter group by facility_code')
if PRIV:
    docs = [r[0] for r in H('select reg_no from prac.practitioner_registration where reg_no is not null')]
else:
    docs = [r[0] for r in H('select HPCSA_NO from dbo.DOCTOR_MASTER where HPCSA_NO is not null')]
ndocs = len(docs)
st_hp = sum(1 for x in docs if x in hp); st_sn = sum(1 for x in staff if x in sn)
mem_hit = sum(1 for x in mem if x in cm); sid_hit = sum(1 for x in sid if x in hs)
# scripts from the build-methods file, dates from the real files
md = open(f'C:/Database/handback/build_methods_{DB}.md', encoding='utf-8').read()
paths = []
for m in re.finditer(r'`([^`|]+\.(?:sql|py|ps1|sh))`', md):
    p = m.group(1)
    if p not in paths:
        paths.append(p)
files = []
for p in paths:
    cand = [f'C:/Database/{p}'.replace('\\', '/'), f'C:/Database/final_pass/{p}'.replace('\\', '/')]
    for c in cand:
        if os.path.exists(c):
            files.append((p, os.path.getsize(c), datetime.datetime.fromtimestamp(os.path.getmtime(c)))); break
files.sort(key=lambda x: x[2])
bk = list_files('C:/Database/backups', [DB]) + list_files('C:/Database/_backups', [DB])
bk.sort(key=lambda x: x[2])
yr_msg = f'{span[0]} to {span[1]}'

if PRIV:
    SRC = f'''- **[1] Health Market Inquiry final report coverage, September 2019** (Competition Commission): the search listing summarises three hospital groups holding about 83% of beds and 90% of admissions. Pages were not opened (the news article redirected), so figures are Partly (accessed {TODAY}).
- **[2] Search listing of a 2025 business report** saying the sector is still largely controlled by three groups (not opened).
- **[3] Blueprint, build methods and facts files held with the database** (read directly on {TODAY}).
- **[4] Uploaded final document 10 of 11**, 10 November 2026.'''
    bg = [
        ('In plain words', 'What a private hospital system holds, in a few sentences.', '''> A private hospital keeps a record of everyone it admits, every test and medicine ordered, and every bill sent to a medical scheme. This record is about our practice version: an invented hospital with 4,000 patients and a year of visits, built to look like a real hospital information system.

For SAHealth the point is simple: it is the most complete source of what happened to a patient and what it cost, so the gateway has to read it correctly.''', 10),
        ('What it is and who runs it', 'What could be confirmed about the real sector.', '''**The sector. Partly [1][2].** Search summaries of the Competition Commission's Health Market Inquiry (final report, September 2019) say three hospital groups account for about 83% of private beds and about 90% of admissions, and a 2025 report says the sector is still largely controlled by three players. I could not open either to confirm the figures.

**Remedies. Partly [1].** The summaries say the final report dropped proposed divestments and recommended an urgent review of hospital licences instead.

**What our copy models. Confirmed [3][4].** One invented private hospital, with its facility code recorded in the facility list and a full hospital information system: admissions, orders, prescriptions, theatre, radiology and billing to medical schemes.

**Real software and design. Not established.** No opened source describes the information systems real private hospital groups use.''', 20),
        ('Real-world shortfalls', 'What the sources evidence about real data quality.', '''- **Concentration. Partly [1].** The groups' dominance is widely reported but I did not open a primary source.
- **Quality of private-sector data. Not established.** No opened source measures the accuracy of private hospital records.
- **Billing codes. Not established.** No opened source covers how well claims codes match the national code lists.''', 30),
        ('Why it matters to the gateway', 'The practical reason this database is in the estate.', 'The private hospital is the richest source: patients, visits, diagnoses, orders, medicines and bills. The gateway must map its codes to the national lists (medicines, diagnoses, tariffs, laboratory), confirm its doctors, nurses, scheme members and patients against the registers, and cope with its planted data-quality problems [3][4].', 40)]
else:
    SRC = f'''- **[1] "Unsupervised, unstructured, non-standardised, unsafe and altogether substandard", Bhekisisa, republished by TimesLIVE, 15 August 2025.** https://www.timeslive.co.za/sunday-times-daily/news/2025-08-15-unsafe-and-substandard-is-that-what-public-health-care-in-sa-looks-like/ (opened, accessed {TODAY}).
- **[2] Search listing of the District Health Barometer, SA Health Review and a parliamentary reply** giving other facility counts (3,477 facilities and 394 hospitals in 2021/22; 3,702 primary and 403 hospitals in 2020). Not opened; Partly (accessed {TODAY}).
- **[3] Blueprint ("messy archetype"), build methods and facts files held with the database** (read directly on {TODAY}).
- **[4] Uploaded final document 11 of 11**, 10 November 2026.'''
    bg = [
        ('In plain words', 'What a public hospital system holds, in a few sentences.', '''> A public hospital keeps its records in a mix of old and new systems: an old system with loose, free-text fields, and a tidier newer layer on top. This record is about our practice version: an invented public hospital with about 6,700 patients and a year of visits, built to be deliberately messy like a real one.

For SAHealth the point is simple: this is where the gateway meets real-world mess, and has to match patients, codes and doctors anyway.''', 10),
        ('What it is and who runs it', 'What could be confirmed about the real sector.', '''**The sector. Confirmed [1].** South Africa has 3,741 public health facilities: about 90% clinics and community health centres and about 10% hospitals. Roughly 85% of South Africans use government facilities. Other counts differ by year (3,477 facilities and 394 hospitals in 2021/22; about 403 hospitals in 2020) [2], which is expected as sources count differently.

**Quality inspections. Confirmed [1].** Between 2019 and 2023 the Office of Health Standards Compliance inspected 3,093 facilities, about 83% of the total, with the latest published results for 2022/23. In 2022 only about four in ten public facilities passed inspection and no province earned more than three stars.

**What our copy models. Confirmed [3][4].** One invented tertiary public hospital in the facility list (code JCH), with a legacy layer (dbo) of loosely typed tables and a normalised layer (his) of clean ones.

**Record keeping and digital systems. Not established.** The opened article does not address them.''', 20),
        ('Real-world shortfalls', 'What the opened source evidences.', '''- **Care can be unsafe. Confirmed [1].** The Health Ombud's report in July 2025 described care at two Northern Cape hospitals as "unsupervised, unstructured, non-standardised, unsafe and altogether substandard", with no emergency power supply and resuscitation equipment that did not work; two of four patients later died.
- **Most facilities fail inspection. Confirmed [1].** Only about four in ten passed in 2022, though the article argues the scorecards may set requirements too high.
- **Life-saving basics are patchy. Confirmed [1].** Only Gauteng and the Western Cape had minimum life-saving measures in at least seven in ten clinics and community health centres in 2022.
- **Hospital audits are heavy. Confirmed [1].** A regional hospital needs 38 inspection tools (about 500 pages) and up to five days, against four tools and one day for a clinic.
- **Record quality. Not established.** No opened source measures data quality in public hospital records.''', 30),
        ('Why it matters to the gateway', 'The practical reason this database is in the estate.', 'The public hospital is where most patients are seen, and its data is the messiest: legacy text fields, missing keys, mistyped codes. The gateway has to turn it into clean, matched records without losing the original [3][4].', 40)]
for t, s, b, p in bg:
    put(DB, 'background', t, s, 'text', b, p, p == 10)
put(DB, 'background', 'Sources', 'Every source used, with the date it was opened.', 'sources', SRC, 90)

put(DB, 'build', 'Largest tables by rows', f'The 12 largest of {nT} tables (measured).', 'chart', chart('bar', [{'label': t[0], 'value': int(t[1])} for t in top]), 10, True)
put(DB, 'build', 'Rows by schema', f'Where the {nRows:,} rows sit.', 'chart', chart('bar', [{'label': a, 'value': int(c)} for a, b, c in schemas]), 11, True)
put(DB, 'build', 'Visits by month', f'The {nenc:,} encounters by month of admission ({yr_msg}).', 'chart', chart('bar', [{'label': a, 'value': int(b)} for a, b in monthly]), 12)
put(DB, 'build', 'Visits by data-quality flag', 'Encounters flagged by the build as inconsistent, against those not flagged.', 'chart', chart('bar', [{'label': a, 'value': int(b)} for a, b in flags]), 13)
put(DB, 'build', 'Tables by schema', f'The {len(schemas)} schemas with their table counts and rows.', 'table', table(['Schema', 'Tables', 'Rows'], [[a, b, f'{int(c):,}'] for a, b, c in schemas]), 24)

put(DB, 'build', 'Content summary', 'Headline figures measured live.', 'text',
    f'''- **Patients:** {npat:,}. **Encounters:** {nenc:,}, admitted {yr_msg}.
- **Tables:** {nT} in {len(schemas)} schemas; {len(empty)} are empty; {nonkey} have no primary key.
- **Rows:** about {nRows:,} in total; {nCols:,} columns.
- **Visit flags:** ''' + '; '.join(f'{a} {int(b):,}' for a, b in flags) + f'''.
- **Measured:** {TODAY}, read-only. Patients, staff and accounts are invented; no rows are published here.''', 25)
put(DB, 'build', 'Sample rows', 'No sample rows are shown.', 'text', 'This database holds patient, staff and billing rows, even though every value is invented. By the standing rule, no row from it is published here; counts and structure are shown instead. Reference tables such as the code lists are shown in their own records.', 40)
put(DB, 'build', 'Where this hospital connects to the rest of the estate', 'Measured live with read-only counts; the values are not published.', 'table', table(['Link', 'Column', 'Rows', 'Found in the other register'], [
    ['Doctors to HPCSA register', 'council registration number', f'{ndocs} doctors', f'{st_hp} ({pct(st_hp, ndocs)})'],
    ['Staff to SANC register', 'council registration number', f'{nstaff} staff', f'{st_sn} ({pct(st_sn, nstaff)})'],
    ['Scheme member to CMS register', 'member number', f'{nmem} rows', f'{mem_hit} ({pct(mem_hit, nmem)})'],
    ['Patient to HPRS', 'SA ID', f'{len(sid):,} with an SA ID', f'{sid_hit:,} ({pct(sid_hit, len(sid))})'],
    ['Facility code', 'facility code', f'{sum(int(b) for a, b in fcode):,}', ', '.join(f'{a} ({int(b):,})' for a, b in fcode)]]), 50, True)
sc = '\n'.join(f"- {n}, {s:,} bytes, last modified {dts(d)}" for n, s, d in files)
bkt = '\n'.join(f"- {n}, {s:,} bytes, {dts(d)}" for n, s, d in bk)
if PRIV:
    how = f'''**Schema.** Built from a blueprint by numbered T-SQL scripts that `apply.ps1` runs in order and stops on the first error: schemas, 197 tables, 375 foreign keys, indexes, then database roles, dynamic data masking and sensitivity classification (no logins) [3].

**Population.** `backlog_population.sql` loads reference data, patients, encounters and billing for 24 October 2025 to 23 October 2026 (target about 4,200 patients), using `CHECKSUM(NEWID())` with no seed recorded, so that load is not reproducible. A supplementary script, generated from templates by `build.py`, fills 56 extra tables. `private_correction.sql` is a targeted correction pass with a recorded seed [3].

**Planted defects.** Duplicate registrations (3% of patients), missing primary diagnosis (2% of encounters), placeholder contact numbers (2%), about 2% Luhn-failing check digits, about 1% with no SA ID, bill header mismatches, 5 encounters before birth, and about 3% mistyped codes [3].

**Scripts that still exist** (dates from the files on this PC):
{sc}

**Backups** (SQL Server .bak files):
{bkt}'''
else:
    how = f'''**Schema.** From a blueprint called the "messy archetype": 108 tables, 7 foreign keys (all in the clean `his` layer), 7 indexes. The header states the mess is deliberate (types, missing keys, heaps) [3].

**Population.** Parts p00 to p99 are concatenated into one script that generates data set-based in a temporary schema, loads it in 500-row transactions and drops the schema at the end. It uses `CHECKSUM`, `NEWID` and `RAND` with no seed recorded, so the load is not reproducible. `dbo` is the legacy layer (text dates, string money, free text) and `his` is the normalised layer [3].

**Planted defects.** 231 defect items across 80 tables, with magnitudes borrowed from a Western Cape study; later passes added SA ID mismatches (1.5% of patients), about 2% invalid or truncated diagnosis codes, about 3% mistyped aligned codes, a 5% diagnosis-log gap and a 10% gap in filled lab results [3].

**Scripts that still exist** (dates from the files on this PC):
{sc}

**Backups** (SQL Server .bak files):
{bkt}'''
put(DB, 'build', 'How it was made', 'Built from blueprints, scripts and backups on this PC.', 'text', how, 60)
put(DB, 'build', 'Security and access', 'How the database is protected. No credentials are described here.', 'text',
    'Windows authentication is used for these measurements; no gateway login exists yet [3]. ' + ('The build adds database roles, dynamic data masking and sensitivity labels, with no logins. ' if PRIV else 'There are no foreign keys outside the clean layer and no masking is recorded. ') + 'The data is invented but shaped like real patient data, so it is treated as personal: read-only, never copied or committed.', 70)
sch0 = schemas[0][0]
put(DB, 'build', 'How to query it', 'Read-only examples (SQL Server) that return counts only.', 'queries',
    f'''-- 1. Rows per table (largest first)
SELECT s.name + '.' + t.name AS table_name, SUM(p.rows) AS row_count FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1) GROUP BY s.name, t.name ORDER BY 2 DESC;

-- 2. Encounters by month
SELECT CONVERT(char(7), admit_dt, 120) AS month, COUNT(*) FROM {ENC} GROUP BY CONVERT(char(7), admit_dt, 120) ORDER BY 1;

-- 3. Encounters by data-quality flag
SELECT data_quality_flag, COUNT(*) FROM {ENC} GROUP BY data_quality_flag;

-- 4. Patients and encounters
SELECT (SELECT COUNT(*) FROM {PAT}) AS patients, (SELECT COUNT(*) FROM {ENC}) AS encounters;

-- 5. Tables with no primary key
SELECT s.name + '.' + t.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE NOT EXISTS (SELECT 1 FROM sys.indexes i WHERE i.object_id = t.object_id AND i.is_primary_key = 1);''', 80)
put(DB, 'build', 'Reproduce these figures', 'The exact check behind each headline number on this page.', 'queries',
    f'''Tables ({nT}), rows ({nRows:,}):  query 1
Patients ({npat:,}), encounters ({nenc:,}):  query 4
Visits by month and flag:  queries 2 and 3
Tables without a primary key ({nonkey}):  query 5
Estate links (staff, scheme members, SA IDs):  compare the column values with the registers (done outside the databases; values not printed)
Measured on {TODAY}.''', 90)
fx = []
if PRIV:
    fx = [f'{nonkey} of {nT} tables have no primary key; {len(empty)} tables are empty.', f'Doctors linked to HPCSA {st_hp} of {ndocs}; staff linked to SANC {st_sn} of {nstaff}.', f'{len(flags) and sum(int(b) for a, b in flags if a != "(none)"):,} encounters carry a data-quality flag.']
else:
    fx = [f'{nonkey} of {nT} tables have no primary key (by design: the legacy layer is deliberately messy).', f'Doctors linked to HPCSA {st_hp} of {ndocs}; staff linked to SANC {st_sn} of {nstaff}.', f'Only 7 foreign keys exist in {nT} tables.']
put(DB, 'build', 'Decisions, gaps and open items', 'What was decided, what is missing (with sizes), and where each item stands.', 'text',
    f'''**Decisions (recorded in the blueprint and build methods)**
- **{'Model a modern, well-keyed private hospital system' if PRIV else 'Model a deliberately messy public hospital with a legacy layer and a clean layer'}** [3].
- **Plant defects on purpose** so the gateway has real problems to find, and record them in a defects log [3].
- **Use one hospital per source**, with a facility code in the facility list [3].

**Gaps (measured)**
''' + '\n'.join('- ' + x for x in fx) + f'''
- Random choices in the main population scripts have no recorded seed, so the first load cannot be reproduced; later passes record seeds.
- This is one hospital with {npat:,} patients; real systems hold far more and span many facilities.

**Open items**
| Item | Status |
| --- | --- |
| Population seeds for the first load | Not established (not recorded) |
| Real-world data-quality benchmarks | Not established (no opened source) |
| Add gateway logins and read-only role | Phase 2 |
| Second facility per source | Open. No decision has been made |''', 95)

n = 0
for p, s, d in files:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Wrote {p.replace(chr(92), "/").split("/")[-1]}', 'A build or population script was written at this time.', f'{p}, {s:,} bytes, last modified {dts(d)}.')
for p, s, d in bk:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Backed up the hospital database: {p.replace(chr(92), "/").split("/")[-1]}', 'A database backup was kept.', f'{p}, {s:,} bytes, dated {dts(d)}.')
log(DB, datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', f'{"Private" if PRIV else "Public"} hospital record filled in depth', 'Background and Build record were written from the live database, estate links and opened sources. Several real-world points are marked not established.',
    f'Written from measurements on {TODAY}. Not established: real-sector data-quality benchmarks and the seeds of the first population loads.')
