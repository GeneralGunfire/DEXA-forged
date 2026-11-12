import sys, os, datetime
sys.path.insert(0, os.path.dirname(__file__))
from fp import *

DB = 'hprs'; PORT = 1436; DBN = 'hprs_identity'
H = lambda q: mssql_rows(PORT, DBN, q)
prof = mssql_profile(DB, PORT, DBN, 'the patient registry', ['hprs'], 20, True)
cnt = prof['cnt']
one = lambda q: mssql_one(PORT, DBN, q)
npat = int(one('select count(*) from dbo.patient'))
no_said = int(one('select count(*) from dbo.patient where sa_id_number is null'))
no_hprn = int(one('select count(*) from dbo.patient where hprn is null'))
dup = int(one('select count(*) from dbo.patient where duplicate_flag=1'))
dob_dis = int(one("select count(*) from dbo.patient where sa_id_number is not null and left(sa_id_number,6)<>convert(char(6),date_of_birth,12)"))
ver = H('select verification_status,count(*) from dbo.patient group by verification_status order by 2 desc')
syn = H('select sync_status,count(*) from dbo.patient group by sync_status order by 2 desc')
xr = H('select identifier_type,count(*) from dbo.patient_identifier_xref group by identifier_type order by 2 desc')
prov = H('select registration_province,count(*) from dbo.patient group by registration_province order by 2 desc')
cit = H('select citizenship_status,count(*) from dbo.patient group by citizenship_status order by 2 desc')
rst = H('select record_status,count(*) from dbo.patient group by record_status order by 2 desc')
fac = int(one('select count(distinct registered_facility_id) from dbo.patient'))
fill = {k: int(one(f"select count(*) from dbo.patient where {k} is not null and cast({k} as varchar(100))<>''")) for k in ['sa_id_number', 'passport_number', 'asylum_permit_no', 'refugee_permit_no', 'hprn', 'mpi_id', 'second_name']}
cfill = H("select contact_type,count(*) from dbo.patient_contact group by contact_type order by 2 desc")
nx = int(one('select count(*) from dbo.patient_identifier_xref'))
ids = {r[0] for r in H('select sa_id_number from dbo.patient where sa_id_number is not null')}
pub_ids = {r[0] for r in mssql_rows(1438, 'public_hospital', 'select id_number from his.patient where id_number is not null')}
pub_n = int(mssql_one(1438, 'public_hospital', 'select count(*) from his.patient'))
prv_types = mssql_rows(1433, 'private_hospital', 'select id_type_code,count(*) from pat.patient_identifier group by id_type_code order by 2 desc')
sa_type = [t for t, _ in prv_types if 'SA' in t.upper()][0]
prv_ids = {r[0] for r in mssql_rows(1433, 'private_hospital', f"select id_value from pat.patient_identifier where id_type_code='{sa_type}'")}
prv_n = int(mssql_one(1433, 'private_hospital', 'select count(*) from pat.patient'))
pub_hit = len(pub_ids & ids); prv_hit = len(prv_ids & ids)
scripts = [x for x in list_files('C:/Database', ['hprs', 'b0_luhn', 'b1_link', 't2_future', 's_align', 'r_a10']) if x[0].endswith(('.sql', '.py'))]
bk = list_files('C:/Database/backups', ['hprs_identity']) + list_files('C:/Database/_backups', ['hprs_identity'])
dts = lambda d: d.strftime('%d %B %Y at %H:%M').lstrip('0')
vd = {a: int(b) for a, b in ver}

SRC = f'''- **[1] "Challenges in implementing the Health Patient Registration System in KwaZulu-Natal"**, The Post, June 2025. https://thepost.co.za/news/south-africa/kwazulu-natal/2025-06-11-challenges-in-implementing-the-health-patient-registration-system-in-kwazulu-natal (opened, accessed {TODAY}).
- **[2] Search results for national HPRS figures**: a Government Communication and Information System guide (more than 57 million registered in 3,111 facilities by mid-2022) and a parliamentary reply (63,241,201 registered since inception). Pages were not opened, so these are used only where marked Partly (accessed {TODAY}).
- **[3] National HIE portal listing of HPRS**, https://hie.meraka.csir.co.za/ (search listing only, not opened).
- **[4] Build methods, facts file and provenance held with the database** (read directly on {TODAY}).
- **[5] Uploaded final document 9 of 11**, 10 November 2026.
- **Not opened:** allAfrica report on the Select Committee (HTTP 403) and the parliamentary reply page (HTTP 404 earlier).'''

put(DB, 'background', 'In plain words', 'What the patient registration system is, in a few sentences.', 'text',
    '''> When someone walks into a public clinic, the clinic needs to know who they are and not create a second file for them. The Health Patient Registration System (HPRS) is the national system that registers each person once, at the clinic, and gives them one identity. This record is about our small practice copy: 15,000 invented patients, each with identifiers from the hospitals and the laboratory service.

For SAHealth the point is simple: it is the one place that says which hospital patient number, scheme number and laboratory number all belong to the same person.''', 10, True)
put(DB, 'background', 'What it is and who runs it', 'What could be confirmed about the real system.', 'text',
    '''**Purpose. Confirmed [1].** A 2025 news report describes the HPRS as an initiative to improve healthcare and data management, one of the National Health Insurance imperatives, enabling better patient tracking and shorter registration queues.

**Identifier. Partly [2][3].** Search summaries say every person registered gets a unique Master Patient Index (MPI) number and that the national health information exchange portal lists the HPRS as live for patient identification. I could not confirm how the MPI relates to the HPRN used in our copy.

**National size. Partly [2].** One government guide is summarised as "more than 57 million South Africans in 3,111 facilities by mid-2022"; a parliamentary reply is summarised as 63,241,201 individuals registered since inception, some of whom will have died or left. I could not open either page, so neither is confirmed.

**Provincial size. Confirmed [1].** In KwaZulu-Natal the report says about 15 million patients have been registered, 3.7 million of them at 74 facilities in the eThekwini district; 488 facilities have a working system and 119 do not.

**Who runs it. Partly [3].** The national portal is a CSIR-hosted site; the operator of the HPRS is not established from an opened source.''', 20)
put(DB, 'background', 'Real-world shortfalls', 'Problems the opened source evidences.', 'text',
    '''- **Functionality is limited to registration. Confirmed [1].** The provincial head of department is quoted: "its functionality is currently limited to patient registration".
- **It does not connect to other systems. Confirmed [1].** The report says it "lacks interoperability with existing systems in the DoH", with the eHealth rollout at 42 hospitals hoped to address this.
- **Hospitals are not covered. Confirmed [1].** None of the province's hospitals had implemented it; 10 hospitals were identified for a pilot.
- **Connectivity and equipment. Confirmed [1].** Some rural clinics cannot connect, and some facilities lack working computers and scanners; procurement depends on budget.
- **Full electronic records are not affordable yet. Confirmed [1].** An opposition spokesperson is quoted saying full records are not achievable within the current budget.
- **The report states no exact date. Confirmed [1].** It is marked "published 1 year ago"; the link carries 11 June 2025.''', 30)
put(DB, 'background', 'Why it matters to the gateway', 'The practical reason this database is in the estate.', 'text',
    'Each hospital keeps its own patient numbers. The gateway needs this registry to say that a private-hospital patient, a public-hospital patient, a scheme member and a laboratory patient are the same person, even when the SA ID is missing or wrong [5].', 40)
put(DB, 'background', 'Sources', 'Every source used, with the date it was opened.', 'sources', SRC, 90)

put(DB, 'build', 'Identifier cross-references', f'The {nx:,} cross-references by identifier type (measured).', 'chart', chart('bar', [{'label': a, 'value': int(b)} for a, b in xr]), 10, True)
put(DB, 'build', 'Verification status', f'How the {npat:,} patients were verified.', 'chart', chart('stacked', [{'label': a, 'value': int(b)} for a, b in ver]), 11, True)
put(DB, 'build', 'Sync status', 'Whether each patient record has reached the central system.', 'chart', chart('stacked', [{'label': a, 'value': int(b)} for a, b in syn]), 12)
put(DB, 'build', 'Planted imperfections', 'Problems built in on purpose so the gateway has something to find.', 'chart', chart('bar', [
    {'label': 'Patients without an SA ID', 'value': no_said}, {'label': 'Patients without an HPRN', 'value': no_hprn}, {'label': 'Flagged as duplicates', 'value': dup}, {'label': 'SA ID date disagrees with date of birth', 'value': dob_dis}]), 13, True)

put(DB, 'build', 'Patients by province and status', 'Counts only. No rows are shown.', 'table', table(['Group', 'Value', 'Patients'], [['Province', a, b] for a, b in prov] + [['Citizenship', a, b] for a, b in cit] + [['Record status', a, b] for a, b in rst] + [['Contact type', a, b] for a, b in cfill]), 24)
put(DB, 'build', 'Column fill rates', 'How many patients carry each personal column. Counts only, no values.', 'table',
    table(['Column', 'Filled', 'Of'], [[k, v, npat] for k, v in fill.items()]), 30)
put(DB, 'build', 'Sample rows', 'No sample rows are shown.', 'text', 'The patient tables hold personal fields (names, SA ID numbers, dates of birth, addresses, contact details), even though every value is invented. By the standing rule, no row from them is published. Counts and structure are shown instead.', 40)
put(DB, 'build', 'Where the registry is used in the estate', 'Measured live with read-only counts; the identifier values are not published.', 'table', table(['Source', 'Table.column', 'Rows', 'SA ID found in this registry'], [
    ['Public hospital', 'his.patient.id_number', pub_n, f'{pub_hit} ({pct(pub_hit, pub_n)})'],
    ['Private hospital', f"pat.patient_identifier.id_value (type {sa_type})", len(prv_ids), f'{prv_hit} ({pct(prv_hit, len(prv_ids))}); {prv_n} private patients in total'],
    ['This database', 'patient_identifier_xref', nx, f"{dict(xr).get('FacilityMRN', 0)} hospital patient numbers, {dict(xr).get('Scheme', 0)} scheme numbers, {dict(xr).get('NHLS', 0)} laboratory numbers"]]), 50, True)
sc = '\n'.join(f"- {n}, {s:,} bytes, last modified {dts(d)}" for n, s, d in scripts)
bkt = '\n'.join(f"- {n}, {s:,} bytes, {dts(d)}" for n, s, d in bk)
put(DB, 'build', 'How it was made', 'Built from scripts and backups on this PC.', 'text',
    f'''**Scripts that still exist** [4][5]:
{sc}

Per the build methods: the schema script creates 4 tables (header "approximated schema"); the population script inserts about 15,000 Gauteng-scoped patients as literal INSERT statements (HPRN identifiers are synthetic and not derived from the SA ID). Close-out passes repaired invalid ID check digits, set future birth dates right, aligned dates of birth to SA IDs, and chose a linked subset of 1,500 patients (seed 20261110) so hospital, scheme and laboratory numbers connect. The generator of the population SQL and its seed are not recorded [4].

**Backups** (SQL Server .bak files, 10 November 2026):
{bkt}''', 60)
put(DB, 'build', 'Security and access', 'How the database is protected. No credentials are described here.', 'text',
    'Windows authentication is used for these measurements. A read-only SQL login also exists; its credential is held only in a connection-strings folder and is not described here [4]. The data is invented but shaped like real health-patient data, so it is treated as personal: read-only, never copied or committed.', 70)
put(DB, 'build', 'How to query it', 'Read-only examples (SQL Server) that return counts only.', 'queries',
    '''-- 1. Patients and missing identifiers
SELECT COUNT(*), COUNT(sa_id_number), COUNT(hprn) FROM dbo.patient;

-- 2. Verification and sync
SELECT verification_status, COUNT(*) FROM dbo.patient GROUP BY verification_status;
SELECT sync_status, COUNT(*) FROM dbo.patient GROUP BY sync_status;

-- 3. Cross-references by type
SELECT identifier_type, COUNT(*) FROM dbo.patient_identifier_xref GROUP BY identifier_type ORDER BY 2 DESC;

-- 4. Duplicate flags
SELECT COUNT(*) FROM dbo.patient WHERE duplicate_flag = 1;

-- 5. SA ID date digits that disagree with the date of birth
SELECT COUNT(*) FROM dbo.patient WHERE sa_id_number IS NOT NULL AND LEFT(sa_id_number, 6) <> CONVERT(char(6), date_of_birth, 12);''', 80)
put(DB, 'build', 'Reproduce these figures', 'The exact check behind each headline number on this page.', 'queries',
    f'''Patients ({npat:,}), without SA ID ({no_said:,}), without HPRN ({no_hprn:,}):  query 1
Verification (Unverified {vd.get('Unverified', 0):,}, Manual {vd.get('Manual', 0):,}, Biometric {vd.get('Biometric', 0)}):  query 2
Cross-references ({nx:,}):  query 3
Duplicates ({dup}):  query 4
SA ID date mismatches ({dob_dis}):  query 5
Hospital links ({pub_hit} public, {prv_hit} private):  compare hospital identifier values with dbo.patient.sa_id_number (done outside the databases; values not printed)
Measured on {TODAY}.''', 90)
put(DB, 'build', 'Decisions, gaps and open items', 'What was decided, what is missing (with sizes), and where each item stands.', 'text',
    f'''**Decisions (recorded in the build methods)**
- **Scope to Gauteng-style data** at {npat:,} patients, a slice of the national volume [4].
- **Make HPRN synthetic and independent of the SA ID** [4].
- **Plant imperfections on purpose**: patients without an SA ID or HPRN, duplicates, ID mismatches [4].

**Gaps (measured)**
- {npat:,} patients against tens of millions in the real system (national figures partly confirmed only [2]).
- {no_said:,} patients ({pct(no_said, npat)}) have no SA ID; {no_hprn:,} ({pct(no_hprn, npat)}) have no HPRN; {dup} ({pct(dup, npat)}) are flagged duplicates.
- {dob_dis} patients' SA ID date digits disagree with their date of birth; the facts file recorded the same figure.
- Only {vd.get('Biometric', 0)} of {npat:,} patients are biometrically verified; {vd.get('Unverified', 0):,} are unverified.
- Hospital links: {prv_n - prv_hit} private patients and {pub_n - pub_hit} public patients have no SA ID match here.

**Open items**
| Item | Status |
| --- | --- |
| Population generator and seed | Not established (not recorded) |
| Relationship of HPRN to the real MPI | Not established |
| Real national totals | Not established (pages not opened) |
| Link remaining hospital patients | Open. No decision has been made |''', 95)

for n, s, d in scripts:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Wrote {n.split(chr(92))[-1]}', 'A script that builds or changes the patient registry was written at this time.', f'{n}, {s:,} bytes, last modified {dts(d)}.')
for n, s, d in bk:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Backed up the patient registry: {n.split(chr(92))[-1]}', 'A database backup was kept.', f'{n}, {s:,} bytes, dated {dts(d)}.')
log(DB, datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', 'HPRS record filled in depth', 'Background and Build record were written from the live database, hospital links and one opened news report. National totals are partly confirmed only.',
    f'Written from measurements on {TODAY}. Not established: current national registration total, the relationship between HPRN and the real MPI, and who operates the system.')
