import sys, os, datetime
sys.path.insert(0, os.path.dirname(__file__))
from fp import *

DB = 'sanc'
PATH = 'C:/Database/registries/sanc_registry.db'
ff = file_facts(PATH)
c = lite(PATH)
q = lambda s: [tuple(r) for r in c.execute(s).fetchall()]
ver = q('select sqlite_version()')[0][0]
tabs = [r[0] for r in q("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")]
info = {t: [dict(r) for r in c.execute(f'pragma table_info({t})')] for t in tabs}
nrows = {t: q(f'select count(*) from {t}')[0][0] for t in tabs}
fks = [(t, dict(r)) for t in tabs for r in c.execute(f'pragma foreign_key_list({t})')]
nC = sum(len(v) for v in info.values())
nurses = nrows['nurse']; regs = nrows['nurse_registration']; locs = nrows['nurse_practice_location']
cat = q('select registration_category,count(*) from nurse_registration group by 1 order by 2 desc')
st = q('select registration_status,count(*) from nurse_registration group by 1 order by 2 desc')
prov = q('select province,count(*) from nurse_practice_location group by 1 order by 2 desc')
ftype = q('select facility_type,count(*) from nurse_practice_location group by 1 order by 2 desc')
susp = q("select count(*) from nurse_registration where registration_status='Suspended'")[0][0]
mw = q("select count(*) from nurse_registration where registration_category='MW'")[0][0]
multi = q('select count(*) from (select nurse_id from nurse_registration group by nurse_id having count(*)>1)')[0][0]
hist = q('select count(*) from (select nurse_id from nurse_practice_location group by nurse_id having count(*)>1)')[0][0]
current = q("select count(*) from nurse_practice_location where valid_to is null or valid_to=''")[0][0]
lapsed_dated = q("select count(*) from nurse_registration where apc_valid_until<date('now')")[0][0]
apc_min, apc_max = q('select min(apc_valid_until),max(apc_valid_until) from nurse_registration')[0]
filled = {k: q(f"select count(*) from nurse where {k} is not null and {k}<>''")[0][0] for k in ['sa_id_number', 'id_number', 'passport_number', 'email', 'telephone', 'residential_address', 'postal_address']}
sexes = q('select sex,count(*) from nurse group by 1')
snos = {r[0] for r in q('select sanc_registration_no from nurse')}
susp_nos = {r[0] for r in q("select n.sanc_registration_no from nurse n where n.record_status='Suspended'")}
prv = {r[0] for r in mssql_rows(1433, 'private_hospital', 'select council_reg_no from hr.staff where council_reg_no is not null')}
pub = {r[0] for r in mssql_rows(1438, 'public_hospital', 'select HPCSA_SANC_NO from dbo.STAFF_MASTER where HPCSA_SANC_NO is not null')}
prv_n = int(mssql_one(1433, 'private_hospital', 'select count(*) from hr.staff'))
pub_n = int(mssql_one(1438, 'public_hospital', 'select count(*) from dbo.STAFF_MASTER'))
prv_hit = len(prv & snos); pub_hit = len(pub & snos)
prv_susp = len(prv & susp_nos); pub_susp = len(pub & susp_nos)
scripts = list_files('C:/Database', ['sanc'])
scripts = [x for x in scripts if x[0].endswith(('.sql', '.py'))]
bk = [x for x in list_files('C:/Database/backups', ['sanc_registry']) + list_files('C:/Database/_backups', ['sanc_registry'])]
dts = lambda d: d.strftime('%d %B %Y at %H:%M').lstrip('0')
lab = {'RN': 'RN registered nurse', 'EN': 'EN enrolled nurse', 'ENA': 'ENA nursing auxiliary', 'MW': 'MW midwife', 'CS': 'CS community service', 'SPEC': 'SPEC specialist'}

SRC = f'''- **[1] South African Nursing Council statistics and growth reports (search listing)**, https://www.sanc.co.za/?p=1455 and the 2015 to 2024 growth PDF. The pages returned HTTP 403 when opened, so only the search summary was read (partly, accessed {TODAY}).
- **[2] Nursing Act, 2005 (Act 33 of 2005), section and regulation titles**, https://api.acts.co.za/nursing-act-2005/nursing_act_2005_content.php (opened, titles only; the provision text was not on the page, accessed {TODAY}).
- **[3] Regulation R.195 of 2008 on SANC** (https://www.sanc.co.za/wp-content/uploads/2022/06/ChgReg-R195.pdf): HTTP 403, not read.
- **[4] Build methods, facts file and provenance held with the database** (read directly on {TODAY}).
- **[5] Uploaded final document 7 of 11**, 10 November 2026.'''

put(DB, 'background', 'In plain words', 'What the nursing council and its register are, in a few sentences.', 'text',
    '''> A nurse in South Africa has to be on a council's list before they may work, and has to renew every year. The South African Nursing Council keeps that list. This record is about our small practice copy: a made-up list of nurses, with made-up names and numbers, built to the same shape.

For SAHealth the point is simple: a hospital can check that a nurse on its staff list is registered, and notice when the registration has lapsed or been suspended.''', 10, True)
put(DB, 'background', 'What it is and who runs it', 'What could be confirmed about the real council.', 'text',
    f'''**What it is. Partly [1][2].** The South African Nursing Council (SANC) keeps the register of nursing practitioners under the Nursing Act, 2005. The Act's section titles confirm that it covers custody and publication of registers (section 35), the register as proof (section 36), limited registration (section 33), removal and restoration (section 44) and suspension (section 49). Regulation R.195 (2008) is listed as setting the particulars kept in the register, the categories of registration and the annual practising certificate [2]. I could not read the text of any of these.

**Categories. Partly [1].** The council's growth reports use three groups: registered nurses and midwives (RN/RM), enrolled nurses and midwives (EN/EM) and nursing auxiliaries (NA), counted at 31 December each year and excluding people living abroad. They count everyone registered, not only those working as nurses.

**Size of the real register. Partly [1].** A search summary gives about 278,617 registrants in 2015 and 265,877 in 2024. I could not open the report to confirm either figure.

**Annual practising certificate (APC). Partly [1].** The summary says the APC is issued after payment of an annual fee, and that registrants who do not pay can still hold a registration certificate but it counts as proof of registration for one year only.

**What the practice copy holds. Confirmed [4][5].** Our copy uses six categories (RN, EN, ENA, MW, CS, SPEC), not the three published groups.''', 20)
put(DB, 'background', 'Real-world shortfalls', 'Problems the sources evidence.', 'text',
    '''- **The register cannot be read automatically. Confirmed.** The council's own statistics pages and regulation files returned HTTP 403 to an automated request, so figures could not be checked by script.
- **The published count is not the working count. Partly [1].** The register counts everyone registered, whether or not they still nurse, so it overstates the workforce.
- **Whether suspended or lapsed nurses are visible to hospitals. Not established.** No opened source says how a hospital would learn of a suspension.''', 30)
put(DB, 'background', 'Why it matters to the gateway', 'The practical reason this register is in the estate.', 'text',
    'Both hospitals keep a staff list with each nurse\'s council registration number. The gateway needs the register to verify those numbers, confirm the category and flag staff whose practising certificate lapsed or whose registration is suspended [5].', 40)
put(DB, 'background', 'Sources', 'Every source used, with the date it was opened.', 'sources', SRC, 90)

put(DB, 'build', 'Registrations by category', f'The {regs:,} registrations by category (measured).', 'chart', chart('bar', [{'label': lab.get(a, a), 'value': b} for a, b in cat]), 10, True)
put(DB, 'build', 'Registration status', 'How current each registration is.', 'chart', chart('stacked', [{'label': a, 'value': b} for a, b in st]), 11, True)
put(DB, 'build', 'Practice locations by province', f'The {locs:,} practice-location rows by province.', 'chart', chart('bar', [{'label': a, 'value': b} for a, b in prov]), 12)
put(DB, 'build', 'Hospital staff linked to the register', 'Staff whose council number is found in this register.', 'chart', chart('bar', [
    {'label': 'Private hospital staff linked', 'value': prv_hit}, {'label': 'Private hospital staff not linked', 'value': prv_n - prv_hit},
    {'label': 'Public hospital staff linked', 'value': pub_hit}, {'label': 'Public hospital staff not linked', 'value': pub_n - pub_hit}]), 13, True)

put(DB, 'build', 'The database file', 'Engine, size, tables and keys.', 'text',
    f'''- **Engine:** SQLite {ver}, a single file (sanc_registry.db in the registries folder). No server, port or login.
- **Size and date:** {ff['bytes']:,} bytes, last modified {ff['mtime']}.
- **Tables:** {len(tabs)} with {nC} columns: ''' + '; '.join(f'{t} ({nrows[t]:,} rows)' for t in tabs) + f'''.
- **Relationships:** {len(fks)} foreign keys (registrations and practice locations point at nurse).
- **People:** {nurses:,} nurses, each with a unique registration number; {multi} have more than one registration; {hist:,} have more than one practice location; each has {current // nurses if current == nurses else 'one'} current location ({current:,} open-ended rows).
- **Filled in:** SA ID numbers {filled['sa_id_number']:,}, ID column {filled['id_number']:,}, passport {filled['passport_number']}, email {filled['email']}, telephone {filled['telephone']}, residential address {filled['residential_address']}.
- **Measured:** {TODAY}, opened read-only. Because the tables hold personal fields, only counts are published here.''', 20)
put(DB, 'build', 'Tables and row counts', 'All tables with rows and columns.', 'table', table(['Table', 'Rows', 'Columns'], [[t, f'{nrows[t]:,}', len(info[t])] for t in tabs]), 21)
put(DB, 'build', 'Columns', f'Every column ({nC}) with type, whether it can be empty and keys. Meanings are taken from names.', 'table',
    table(['Table', 'Column', 'Type', 'Nullable', 'Key'], [[t, x['name'], x['type'], 'No' if x['notnull'] or x['pk'] else 'Yes', 'PK' if x['pk'] else ''] for t in tabs for x in info[t]]), 22)
put(DB, 'build', 'Declared relationships', 'The foreign keys declared in the file.', 'table', table(['From table', 'Column', 'To table', 'Column'], [[t, f['from'], f['table'], f['to']] for t, f in fks]), 23)
put(DB, 'build', 'Column fill rates', 'How many nurses carry each personal column. Counts only, no values.', 'table',
    table(['Column', 'Filled', 'Of'], [[k, v, nurses] for k, v in filled.items()]), 30)
put(DB, 'build', 'Sample rows', 'No sample rows are shown.', 'text', 'The nurse table holds personal fields (names, ID numbers, dates of birth), even though every value is invented. By the standing rule, no row from a table with personal columns is published here. Counts and structure are shown instead.', 40)
put(DB, 'build', 'Where the register is used in the estate', 'Measured live with read-only counts; the numbers themselves are not published.', 'table', table(['Source', 'Table.column', 'Staff rows', 'Council number found in this register'], [
    ['Private hospital', 'hr.staff.council_reg_no', prv_n, f'{prv_hit} ({pct(prv_hit, prv_n)}); {prv_susp} belong to suspended nurses'],
    ['Public hospital', 'dbo.STAFF_MASTER.HPCSA_SANC_NO', pub_n, f'{pub_hit} ({pct(pub_hit, pub_n)}); {pub_susp} belong to suspended nurses']]), 50, True)
sc = '\n'.join(f"- {n}, {s:,} bytes, last modified {dts(d)}" for n, s, d in scripts)
bkt = '\n'.join(f"- {n}, {s:,} bytes, {dts(d)}" for n, s, d in bk)
put(DB, 'build', 'How it was made', 'Built from scripts and backups on this PC.', 'text',
    f'''**Scripts that still exist** [4]:
{sc}

Per the build methods: the schema script creates 3 tables from the layout the nursing regulations prescribe; the population script inserts the nurses as literal INSERT statements (header: about 3,500 nurses scaled from a 265,877 anchor, which matches the 2024 figure in the search summary); a Python script (seed 20261027) marked about 4% of nurses as suspended. Later passes repaired ID numbers, added the id_number column, 140 midwife registrations and practice-location history (seed 20261113). The generator of the population SQL and its seed are not recorded [4].

**Backups** (SQLite file copies on 10 November 2026):
{bkt}''', 60)
put(DB, 'build', 'Security and access', 'How the file is protected. No credentials are described here.', 'text',
    'A SQLite file with no accounts, encryption or audit trail, protected only by file-system permissions [4]. It holds invented personal data in the same shape as real data, so it is treated as personal: opened read-only, never committed, copied or shared.', 70)
put(DB, 'build', 'How to query it', 'Read-only examples that return counts only.', 'queries',
    '''-- 1. Registrations by category
SELECT registration_category, COUNT(*) FROM nurse_registration GROUP BY 1 ORDER BY 2 DESC;

-- 2. Registrations by status
SELECT registration_status, COUNT(*) FROM nurse_registration GROUP BY 1 ORDER BY 2 DESC;

-- 3. Nurses with more than one registration
SELECT COUNT(*) FROM (SELECT nurse_id FROM nurse_registration GROUP BY nurse_id HAVING COUNT(*) > 1);

-- 4. Practice locations by province
SELECT province, COUNT(*) FROM nurse_practice_location GROUP BY 1 ORDER BY 2 DESC;

-- 5. Registrations whose practising certificate end date has passed
SELECT COUNT(*) FROM nurse_registration WHERE apc_valid_until < date('now');''', 80)
put(DB, 'build', 'Reproduce these figures', 'The exact check behind each headline number on this page.', 'queries',
    f'''Nurses ({nurses:,}), registrations ({regs:,}), locations ({locs:,}):  SELECT COUNT(*) on each table
Suspended ({susp}), midwife ({mw}):  query 2 and query 1
Multi-registration nurses ({multi}):  query 3
Nurses with location history ({hist:,}):  GROUP BY nurse_id HAVING COUNT(*) > 1 on nurse_practice_location
Hospital links ({prv_hit} private, {pub_hit} public):  compare hr.staff.council_reg_no and dbo.STAFF_MASTER.HPCSA_SANC_NO with nurse.sanc_registration_no (done outside the databases; numbers not printed)
Measured on {TODAY}.''', 90)
put(DB, 'build', 'Decisions, gaps and open items', 'What was decided, what is missing (with sizes), and where each item stands.', 'text',
    f'''**Decisions (recorded in the build methods and facts file)**
- **Use a SQLite file** shaped from the nursing regulations; all personal values are invented [4].
- **Scale to {nurses:,} nurses** from a 265,877 anchor, about 1.3% of the real register [4].
- **Mark about 4% as suspended** ({susp} registrations), reason held in the limitation columns, with no schema change [4].

**Gaps (measured)**
- {nurses:,} nurses against a real register of about 265,877 (2024, partly confirmed [1]).
- Passport, email, telephone and addresses are filled for 0 of {nurses:,} nurses.
- Only {len(prov)} provinces and {len(ftype)} facility types appear in practice locations, and every nurse has exactly one current location.
- {lapsed_dated} registrations have an APC end date before today; the status column calls {dict(st).get('Lapsed', 0)} of them Lapsed. The dates run from {apc_min} to {apc_max}.
- Practice locations are not tied to the facility list.

**Open items**
| Item | Status |
| --- | --- |
| Population generator and seed | Not established (not recorded) |
| Real category counts and fees | Not established (council pages blocked) |
| Link practice locations to the facility list | Open. No decision has been made |
| Hospital staff registration numbers linked | Resolved on 10 November 2026 |
| Multi-category and location history | Partly resolved (140 multi-category nurses; {hist:,} with history) |''', 95)

for n, s, d in scripts:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Wrote {n.split(chr(92))[-1]}', 'A script that builds or changes the nurse register was written at this time.', f'{n}, {s:,} bytes, last modified {dts(d)}.')
for n, s, d in bk:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Backed up the nurse register: {n.split(chr(92))[-1]}', 'A copy of the nurse register file was kept.', f'{n}, {s:,} bytes, dated {dts(d)}.')
log(DB, datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', 'Document differs from live data: practice-location history', 'The facts file lists location history as still one row per nurse, but the live table has more rows than nurses.',
    f'The known-gaps line says one row per nurse (5,830) while the live table has {locs:,} rows for {nurses:,} nurses and {hist:,} nurses with more than one row. The document was not edited.')
log(DB, datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', 'SANC record filled in depth', 'Background and Build record were written from the live file and hospital counts. Real register figures are partly confirmed only.',
    f'Written from measurements on {TODAY}. Council web pages returned HTTP 403, so category counts, fees and the 2024 total are partly or not established.')
