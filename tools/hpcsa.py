import sys, os, datetime
sys.path.insert(0, os.path.dirname(__file__))
from fp import *
if os.environ.get('NOLOG'):
    log = lambda *a, **k: None

DB = 'hpcsa'; PORT = 1437; DBN = 'hpcsa_registry'
H = lambda q: mssql_rows(PORT, DBN, q)
prof = mssql_profile(DB, PORT, DBN, 'the practitioner register', ['hpcsa'], 20, True)
cnt = prof['cnt']
bd = H("select b.board_code,b.board_name,count(r.professional_board_id) from dbo.professional_board b left join dbo.practitioner_registration r on r.professional_board_id=b.professional_board_id group by b.board_code,b.board_name order by 3 desc")
st = H('select registration_status,count(*) from dbo.practitioner group by registration_status order by 2 desc')
ann = H('select annual_status,count(*) from dbo.practitioner group by annual_status order by 2 desc')
rst = H('select status,count(*) from dbo.practitioner_registration group by status order by 2 desc')
npr = int(mssql_one(PORT, DBN, 'select count(*) from dbo.practitioner'))
nreg = int(mssql_one(PORT, DBN, 'select count(*) from dbo.practitioner_registration'))
multi = int(mssql_one(PORT, DBN, 'select count(*) from (select practitioner_id from dbo.practitioner_registration group by practitioner_id having count(*)>1) x'))
addr = int(mssql_one(PORT, DBN, 'select count(*) from dbo.practitioner_practice_address'))
addr_h = int(mssql_one(PORT, DBN, 'select count(*) from (select practitioner_id from dbo.practitioner_practice_address group by practitioner_id having count(*)>1) x'))
act = dict((a, int(b)) for a, b in st)
fill = {k: int(mssql_one(PORT, DBN, f"select count(*) from dbo.practitioner where {k} is not null and cast({k} as varchar(100))<>''")) for k in ['sa_id_number', 'id_number', 'date_of_birth']}
fill_a = {k: int(mssql_one(PORT, DBN, f"select count(*) from dbo.practitioner_practice_address where {k} is not null and {k}<>''")) for k in ['telephone', 'email', 'line1']}
nos = {r[0] for r in H('select hpcsa_registration_no from dbo.practitioner')}
susp_nos = {r[0] for r in H("select hpcsa_registration_no from dbo.practitioner where registration_status<>'Active'")}
prv = {r[0] for r in mssql_rows(1433, 'private_hospital', 'select reg_no from prac.practitioner_registration where reg_no is not null')}
prv_n = int(mssql_one(1433, 'private_hospital', 'select count(*) from prac.practitioner_registration'))
pub = {r[0] for r in mssql_rows(1438, 'public_hospital', 'select HPCSA_NO from dbo.DOCTOR_MASTER where HPCSA_NO is not null')}
pub_n = int(mssql_one(1438, 'public_hospital', 'select count(*) from dbo.DOCTOR_MASTER'))
prv_hit = len(prv & nos); pub_hit = len(pub & nos)
prv_off = len(prv & susp_nos); pub_off = len(pub & susp_nos)
# other public tables carrying the same column (counts of rows with a code that is in this register)
pub_cols = [r[0] for r in mssql_rows(1438, 'public_hospital', "select s.name+'.'+t.name from sys.columns c join sys.tables t on t.object_id=c.object_id join sys.schemas s on s.schema_id=t.schema_id where c.name='HPCSA_SANC_NO' order by 1")]
scripts = [x for x in list_files('C:/Database', ['hpcsa', 'b2_practitioners', 'b2b_doctors', 'r_a6789']) if x[0].endswith(('.sql', '.py'))]
bk = list_files('C:/Database/backups', ['hpcsa_registry']) + list_files('C:/Database/_backups', ['hpcsa_registry'])
dts = lambda d: d.strftime('%d %B %Y at %H:%M').lstrip('0')
pct_off = pct(npr - act.get('Active', 0), npr)
real_off = pct(9806, 237981)

SRC = f'''- **[1] HPCSA Annual Report FY 2022/2023**, Health Professions Council of South Africa, as tabled in Parliament. https://pmg.org.za/files/HPCSA_AR_2023.pdf (236 pages, text extracted and read, accessed {TODAY}).
- **[2] HPCSA search results listing the 2023/2024 annual report and the iRegister**, https://hpcsa.co.za/Dynamic/Search. The 2023/2024 report returned a web page instead of the PDF, so it was not read (accessed {TODAY}).
- **[3] Build methods, facts file and provenance held with the database** (read directly on {TODAY}).
- **[4] Uploaded final document 7 of 11**, 10 November 2026.'''

put(DB, 'background', 'In plain words', 'What the health professions council and its register are, in a few sentences.', 'text',
    '''> Doctors, dentists, therapists and other health professionals must be on a council's list to practise. The Health Professions Council of South Africa keeps that list, with a separate board for each group of professions. This record is about our small practice copy: an invented list of practitioners built to the same shape.

For SAHealth the point is simple: when a hospital says a doctor treated a patient, the gateway can check the doctor is registered and in good standing.''', 10, True)
put(DB, 'background', 'What it is and who runs it', 'What could be confirmed about the real council.', 'text',
    f'''**What it is. Confirmed [1].** The council works with 12 Professional Boards. The report says they exist to control education, training and registration for practising health professions registered under the Health Professions Act 56 of 1974, to protect the public and to investigate complaints and ensure discipline.

**Size of the register. Confirmed [1].** The report says there were 237,981 active registered practitioners in April 2023, against 235,070 the year before. The Medical and Dental Board has the most registered practitioners, followed by the Emergency Care Board and the Psychology Board.

**New registrations. Confirmed [1].** Newly prescribed registrations rose from 19,937 in 2021/22 to 20,983 in 2022/23, and certificates of good standing (usually for those likely to leave the country) rose from 1,898 to 2,208.

**Suspensions. Confirmed [1].** 9,806 practitioners were suspended in 2022/23, against 9,892 the year before. The report also says people suspended for not paying annual fees during COVID-19 were restored to the registers.

**Public lookup. Partly [2].** A search summary says the public can check a practitioner on the council's iRegister; I did not open it.

**Fresher figures. Not established.** The 2023/2024 report did not download as a PDF, so the newest figures could not be read.''', 20)
put(DB, 'background', 'Real-world shortfalls', 'Problems the opened sources evidence.', 'text',
    f'''- **Many registrations are not in good standing. Confirmed [1].** 9,806 suspended against 237,981 active is about {real_off} of the active count. Fee non-payment during COVID-19 suspended many, who were later restored.
- **Online self-service was only recently added. Confirmed [1].** The report says the online self-service platform for submitting enquiries and CPD evidence became available to all registered practitioners in the period, and random sampling for CPD verification was discontinued.
- **Cyber risk is on the council's own risk register. Confirmed [1].** The report lists cyber-attacks as a risk with bi-annual vulnerability tests and an internal audit as responses.
- **Current figures. Not established.** Nothing newer than April 2023 was read.''', 30)
put(DB, 'background', 'Why it matters to the gateway', 'The practical reason this register is in the estate.', 'text',
    'Both hospitals record the treating doctor by council registration number. The gateway needs the register to confirm that a number belongs to a real practitioner, find their board and see whether the registration is active, suspended or lapsed [4].', 40)
put(DB, 'background', 'Sources', 'Every source used, with the date it was opened.', 'sources', SRC, 90)

put(DB, 'build', 'Registrations by board', f'The {nreg:,} registrations by professional board (measured).', 'chart', chart('bar', [{'label': f'{a} {b}', 'value': int(c)} for a, b, c in bd]), 10, True)
put(DB, 'build', 'Registration status', f'Status of the {npr:,} practitioners.', 'chart', chart('stacked', [{'label': a, 'value': int(b)} for a, b in st]), 11, True)
put(DB, 'build', 'Practitioners in the practice copy against the real register', 'Our copy is deliberately a small slice; the real figure is from the 2022/23 annual report.', 'chart', chart('bar', [
    {'label': 'Practice copy', 'value': npr}, {'label': 'Real active register, April 2023', 'value': 237981}]), 12)
put(DB, 'build', 'Hospital doctors linked to the register', 'Doctors whose council number is found in this register.', 'chart', chart('bar', [
    {'label': 'Private hospital doctors linked', 'value': prv_hit}, {'label': 'Private hospital doctors not linked', 'value': prv_n - prv_hit},
    {'label': 'Public hospital doctors linked', 'value': pub_hit}, {'label': 'Public hospital doctors not linked', 'value': pub_n - pub_hit}]), 13, True)

put(DB, 'build', 'Boards', 'The 11 professional boards held in the practice copy, with registrations. These are reference rows, not people.', 'table',
    table(['Code', 'Board', 'Registrations'], [[a, b, c] for a, b, c in bd]), 24)
put(DB, 'build', 'Column fill rates', 'How many practitioners and addresses carry each personal column. Counts only, no values.', 'table',
    table(['Table', 'Column', 'Filled', 'Of'], [['practitioner', k, v, npr] for k, v in fill.items()] + [['practice_address', k, v, addr] for k, v in fill_a.items()]), 30)
put(DB, 'build', 'Sample rows', 'No sample rows are shown.', 'text', 'The practitioner and address tables hold personal fields (names, ID numbers, dates of birth, addresses), even though every value is invented. By the standing rule, no row from a table with personal columns is published. Counts and structure are shown instead.', 40)
put(DB, 'build', 'Where the register is used in the estate', 'Measured live with read-only counts; the numbers themselves are not published.', 'table', table(['Source', 'Table.column', 'Doctor rows', 'Council number found in this register'], [
    ['Private hospital', 'prac.practitioner_registration.reg_no', prv_n, f'{prv_hit} ({pct(prv_hit, prv_n)}); {prv_off} not in Active status'],
    ['Public hospital', 'dbo.DOCTOR_MASTER.HPCSA_NO', pub_n, f'{pub_hit} ({pct(pub_hit, pub_n)}); {pub_off} not in Active status'],
    ['Public hospital', 'Same column in other tables', len(pub_cols), 'tables carrying the column: ' + ', '.join(pub_cols[:12])]]), 50, True)
sc = '\n'.join(f"- {n}, {s:,} bytes, last modified {dts(d)}" for n, s, d in scripts)
bkt = '\n'.join(f"- {n}, {s:,} bytes, {dts(d)}" for n, s, d in bk)
put(DB, 'build', 'How it was made', 'Built from scripts and backups on this PC.', 'text',
    f'''**Scripts that still exist** [3][4]:
{sc}

Per the build methods: the schema script creates 5 tables (header "approximated schema") and the population script inserts the practitioners as literal INSERT statements (about 2,500 practitioners scaled from a 181,981 registrant anchor). Later passes added the id_number column, 62 second-board registrations, address history and hospital doctors so some staff link to council records. The generator of the population SQL and its seed are not recorded [3].

**Backups** (SQL Server .bak files on 10 November 2026):
{bkt}''', 60)
put(DB, 'build', 'Security and access', 'How the database is protected. No credentials are described here.', 'text',
    'Windows authentication is used for these measurements. The facts file records a read-only SQL login also exists; its credential is not described here [3]. The data is invented but shaped like real personal data, so it is treated as personal: read-only, never copied or committed.', 70)
put(DB, 'build', 'How to query it', 'Read-only examples that return counts only.', 'queries',
    '''-- 1. Practitioners by status
SELECT registration_status, COUNT(*) FROM dbo.practitioner GROUP BY registration_status ORDER BY 2 DESC;

-- 2. Registrations per board
SELECT b.board_code, COUNT(*) FROM dbo.practitioner_registration r JOIN dbo.professional_board b ON b.professional_board_id = r.professional_board_id GROUP BY b.board_code ORDER BY 2 DESC;

-- 3. Practitioners with more than one registration
SELECT COUNT(*) FROM (SELECT practitioner_id FROM dbo.practitioner_registration GROUP BY practitioner_id HAVING COUNT(*) > 1) x;

-- 4. Annual renewal status
SELECT annual_status, COUNT(*) FROM dbo.practitioner GROUP BY annual_status;

-- 5. Row counts
SELECT COUNT(*) FROM dbo.practitioner; SELECT COUNT(*) FROM dbo.practitioner_registration;''', 80)
put(DB, 'build', 'Reproduce these figures', 'The exact check behind each headline number on this page.', 'queries',
    f'''Practitioners ({npr:,}), registrations ({nreg:,}):  query 5
Active ({act.get('Active', 0):,}), suspended ({act.get('Suspended', 0)}):  query 1
Multi-board practitioners ({multi}):  query 3
Hospital links ({prv_hit} private, {pub_hit} public):  compare prac.practitioner_registration.reg_no and dbo.DOCTOR_MASTER.HPCSA_NO with dbo.practitioner.hpcsa_registration_no (done outside the databases; numbers not printed)
Measured on {TODAY}.''', 90)
put(DB, 'build', 'Decisions, gaps and open items', 'What was decided, what is missing (with sizes), and where each item stands.', 'text',
    f'''**Decisions (recorded in the build methods)**
- **Use a SQL Server instance of its own** (HPCSA, port 1437) with Windows authentication [3].
- **Scale to {npr:,} practitioners** from a 181,981 anchor, about 1.4% [3].
- **Leave about 20% of hospital doctors with no council record** (locums, unregistered), by design [3].

**Gaps (measured)**
- {npr:,} practitioners against 237,981 active in the real register in April 2023 [1]; the anchor in the document (181,981) is also lower than that figure.
- Suspended is {act.get('Suspended', 0)} of {npr:,} ({pct(act.get('Suspended', 0), npr)}), while the real report puts it at 9,806 against 237,981 ({real_off}).
- {npr - act.get('Active', 0)} of {npr:,} practitioners ({pct_off}) are not Active; the real equivalent is not established.
- {pub_n - pub_hit} of {pub_n} public doctors and {prv_n - prv_hit} of {prv_n} private doctors have no match here (locums and unregistered, by design, plus a few mistyped numbers).

**Open items**
| Item | Status |
| --- | --- |
| Population generator and seed | Not established (not recorded) |
| Newest real figures (2023/24 report) | Not established (not downloadable) |
| Hospital doctors linked to council records | Resolved on 10 November 2026 |
| Real board list (12 boards; copy holds 11) | Open. No decision has been made |''', 95)

for n, s, d in scripts:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Wrote {n.split(chr(92))[-1]}', 'A script that builds or changes the practitioner register was written at this time.', f'{n}, {s:,} bytes, last modified {dts(d)}.')
for n, s, d in bk:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Backed up the practitioner register: {n.split(chr(92))[-1]}', 'A database backup was kept.', f'{n}, {s:,} bytes, dated {dts(d)}.')
log(DB, datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', 'Document differs from live data: register size anchor', 'The build notes scale the register from a 181,981 anchor, but the annual report read today gives 237,981 active practitioners.',
    'The 2022/23 annual report (April 2023) gives 237,981 active registered practitioners. The anchor in the build notes is 181,981. The document was not edited; the year and source of the anchor are not established.')
log(DB, datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', 'HPCSA record filled in depth', 'Background and Build record were written from the live database, hospital counts and the 2022/23 annual report.',
    f'Written from measurements on {TODAY}. Not established: figures newer than April 2023 and the origin of the 181,981 anchor.')
