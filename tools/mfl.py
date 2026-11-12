import sys, os, collections, datetime
sys.path.insert(0, os.path.dirname(__file__))
from fp import *

DB = 'mfl_dhis2'; PORT = 5432; PG = 'mfl_dhis2'
Q = lambda q: pg_rows(PORT, PG, q)
one = lambda q: Q(q)[0][0]

ver = one('select version()').split(',')[0]
size = int(one(f"select pg_database_size('{PG}')"))
enc = one("select pg_encoding_to_char(encoding) from pg_database where datname=current_database()")
tabs = Q("""select table_name,(xpath('/row/c/text()',query_to_xml('select count(*) as c from public.'||table_name,false,true,'')))[1]::text,
 (select count(*) from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name)
 from information_schema.tables t where table_schema='public' and table_type='BASE TABLE' order by 2::int desc,1""".replace('2::int', '(xpath(\'/row/c/text()\',query_to_xml(\'select count(*) as c from public.\'||table_name,false,true,\'\')))[1]::text::int'))
cols = Q("select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position")
pks = {(r[0], r[1]) for r in Q("select tc.table_name,kcu.column_name from information_schema.table_constraints tc join information_schema.key_column_usage kcu using (constraint_name,table_schema) where tc.constraint_type='PRIMARY KEY' and tc.table_schema='public'")}
fks = Q("select conrelid::regclass::text, a.attname, confrelid::regclass::text, af.attname, case when convalidated then 'enforced' else 'not validated' end from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] join pg_attribute af on af.attrelid=c.confrelid and af.attnum=c.confkey[1] where c.contype='f' and c.connamespace='public'::regnamespace order by 1,2")
nT = len(tabs); nC = len(cols); nR = sum(int(t[1]) for t in tabs); nEmpty = sum(1 for t in tabs if int(t[1]) == 0)
rows = {t[0]: int(t[1]) for t in tabs}
lvl = Q("select hierarchylevel,count(*) from organisationunit group by 1 order by 1")
ft = Q("select facility_type,count(*) from mfl_facility group by 1 order by 2 desc")
own = Q("select ownership,count(*) from mfl_facility group by 1 order by 2 desc")
nfac = rows['mfl_facility']
cnt = Q("select count(*) filter (where latitude is not null), count(*) filter (where physical_address is not null), count(*) filter (where telephone is not null), count(*) filter (where email is not null), count(*) filter (where dhis2_org_unit_code is not null), count(*) filter (where alternative_code is not null), count(*) filter (where closing_date is not null), count(*) filter (where operational_status='Operational') from mfl_facility")[0]
lat, addr, tel, mail, dcode, alt, closed, oper = map(int, cnt)
per = Q("select min(iso),max(iso),count(*) from period")[0]
nde = rows['dataelement']; nds = rows['dataset']; ndss = rows['datasetsource']; ndv = rows['datavalue']
samp = Q("select facility_uid,national_facility_id,facility_name,facility_type,ownership,province_code from mfl_facility order by national_facility_id limit 5")
facs = Q("select facility_uid,national_facility_id,dhis2_org_unit_code,facility_name,facility_type,alternative_code from mfl_facility where alternative_code in ('JHBPVT','JCH') order by 2")
pn = int(mssql_one(1433, 'private_hospital', "select count(*) from fac.facility where facility_code='JHBPVT'"))
pe = int(mssql_one(1438, 'public_hospital', 'select count(*) from his.encounter'))
pe_in = int(mssql_one(1438, 'public_hospital', "select count(*) from his.encounter where facility_code='JCH'"))
pe_d = int(mssql_one(1438, 'public_hospital', 'select count(distinct facility_code) from his.encounter'))
ff = [(n, s, d) for n, s, d in list_files('C:/Database', ['mfl', 'b3_mfl', 't3_mfl', 'r_a6789', '03_mfl'])]
scripts = [x for x in ff if x[0].endswith(('.sql', '.py'))]
backups = [x for x in ff if x[0].endswith('.dump')]
dts = lambda d: d.strftime('%d %B %Y at %H:%M').lstrip('0')

SRC = f'''- **[1] Master Facility List (MFL) User Guide v1.2.4**, "Implementing South Africa's Master Facility List project", National Department of Health Knowledge Hub. https://knowledgehub.health.gov.za/system/files/elibdownloads/2023-04/MFL%20User%20guide%20v%201.2.4_20122021.pdf (opened, text read, accessed {TODAY}).
- **[2] Maina et al., a geocoded inventory of public health facilities in 50 sub-Saharan African countries**, Scientific Data 2019, PMC6658526 (first 100,000 characters read, accessed {TODAY}).
- **[3] Build methods and facts files held with the database** (read directly on {TODAY}).
- **[4] Uploaded final document 1 of 11**, 10 November 2026.
- **Not opened:** the DHIS2 organisation-unit documentation page (HTTP 404) and the Springer or other search results; nothing is claimed from them.'''

put(DB, 'background', 'In plain words', 'What the facility list and DHIS2 are, in a few sentences.', 'text',
    '''> Every clinic and hospital needs one agreed name and one agreed code, otherwise two systems cannot say they are talking about the same place. The Master Facility List is that agreed list. DHIS2 is the reporting system health departments use to collect numbers from those facilities. This record is about our small practice copy of both.

For SAHealth the point is simple: every patient record says where it happened, and the gateway needs the list to turn each hospital's own short code into one national facility.''', 10, True)
put(DB, 'background', 'What it is and who runs it', 'What could be confirmed about the real list.', 'text',
    f'''**What an MFL is. Confirmed [1].** The user guide defines a Master Facility List as "a complete listing of health facilities in a country (both public and private)", made up of administrative information and information that identifies each facility (a unique ID), with a schedule for updating. It says the list is used to monitor health infrastructure and services and to calculate the share of facilities included in routine data collection.

**Who runs it. Confirmed [1].** South Africa's list is a web system (hosted at a CSIR address) built by the "Implementing South Africa's Master Facility List project". It has five user types: a system administrator, a curator, a facility representative, an external systems representative (the guide names the HPRS and MHPL developers as examples) and an approver. Changes go through requests that a curator reviews and an approver approves.

**Size of the real list. Partly [2].** A 2019 study lists South Africa with 4,303 public facilities, 99% geocoded (2017 data), and a separate primary-level total of 3,760 (clinics, community health centres and district hospitals). I could not open a current figure for the live list.

**DHIS2. Partly [2].** The study confirms DHIS2 is used as a health information platform and as a source of facility lists across the continent. I could not open the DHIS2 documentation page, so the definition of its organisation-unit hierarchy is **Not established** from a source; the table layout here follows the DHIS2 style recorded in the final document [4].

**How the list gets its codes. Not established.** No opened source describes the real facility code format or how the list relates to DHIS2 identifiers.''', 20)
put(DB, 'background', 'Real-world shortfalls', 'Problems the opened sources evidence.', 'text',
    '''- **Most inventories lack coordinates. Confirmed [2].** The authors say "most inventories lack coordinates"; every database they used held duplicates that had to be removed.
- **Definitions differ. Confirmed [2].** Facility-type definitions differ by country and ownership was sometimes inferred from facility names.
- **Private facilities are poorly covered. Confirmed [2].** Private facilities were excluded from the study and their completeness "varied wildly" between countries.
- **A list must be kept up to date. Confirmed [1].** The guide stresses an updating schedule and a request-and-approval process, which implies stale entries are a risk.
- **Current South African gaps. Not established.** I found no opened source that measures the live list's accuracy.''', 30)
put(DB, 'background', 'Why it matters to the gateway', 'The practical reason this database is in the estate.', 'text',
    'Both hospitals tag their records with a short facility code of their own. The gateway needs one list that says which national facility each code means, so a patient seen at two places is placed correctly and reports roll up to the right district and province. This database is that list in practice form [4].', 40)
put(DB, 'background', 'Sources', 'Every source used, with the date it was opened.', 'sources', SRC, 90)

put(DB, 'build', 'Organisation units by level', 'The organisation-unit tree: country, province, district, sub-district, facility (measured).', 'chart',
    chart('bar', [{'label': {'1': 'Country', '2': 'Province', '3': 'District', '4': 'Sub-district', '5': 'Facility'}[a], 'value': int(b)} for a, b in lvl]), 10, True)
put(DB, 'build', 'Facilities by type', f'The {nfac} facilities by type.', 'chart', chart('bar', [{'label': a, 'value': int(b)} for a, b in ft]), 11, True)
put(DB, 'build', 'Facility attributes filled in', f'How many of the {nfac} facilities carry each attribute.', 'chart', chart('bar', [
    {'label': 'DHIS2 org-unit code', 'value': dcode}, {'label': 'Operational', 'value': oper}, {'label': 'Alternative code', 'value': alt},
    {'label': 'Coordinates', 'value': lat}, {'label': 'Physical address', 'value': addr}, {'label': 'Telephone', 'value': tel}, {'label': 'Email', 'value': mail}]), 12)
put(DB, 'build', 'Tables holding data', 'Rows per table; tables with 0 are built but unfilled.', 'chart', chart('bar', [{'label': t[0], 'value': int(t[1])} for t in tabs]), 13)

put(DB, 'build', 'The database', 'Engine, size, tables and keys.', 'text',
    f'''- **Engine:** {ver}. Database {PG}, localhost port {PORT}, encoding {enc}. Read-only measurements; no credentials are described here.
- **Size:** {size:,} bytes on disk.
- **Tables:** {nT} with {nC} columns and {nR:,} rows in total; {nEmpty} tables are empty ({', '.join(t[0] for t in tabs if int(t[1]) == 0)}).
- **Relationships:** {len(fks)} foreign keys, all {'enforced' if all(f[4] == 'enforced' for f in fks) else 'not all enforced'}. No schemas beyond public, no views.
- **Hierarchy:** {sum(int(b) for a, b in lvl)} organisation units in five levels; {nfac} facilities, each linked to its unit by uid.
- **Reference data:** {nde} data elements, {nds} dataset assigned to {ndss} facilities, {per[2]} monthly periods ({per[0]} to {per[1]}). Data values: {ndv} rows, left empty on purpose [4].
- **Measured:** {TODAY}.''', 20)
put(DB, 'build', 'Tables and row counts', 'All tables with rows and columns.', 'table', table(['Table', 'Rows', 'Columns'], [[t[0], t[1], t[2]] for t in tabs]), 21)
put(DB, 'build', 'Columns', f'Every column ({nC}) with type, whether it can be empty, and primary keys. Meanings are taken from names.', 'table',
    table(['Table', 'Column', 'Type', 'Nullable', 'Key'], [[c[0], c[1], c[2], 'Yes' if c[3] == 'YES' else 'No', 'PK' if (c[0], c[1]) in pks else ''] for c in cols]), 22)
put(DB, 'build', 'Declared relationships', f'The {len(fks)} foreign keys the database enforces.', 'table', table(['From table', 'Column', 'To table', 'Column', 'State'], fks), 23)
put(DB, 'build', 'Sample rows', 'The first 5 facilities. Facilities are places, not people; no personal data is shown.', 'table',
    table(['Facility uid', 'National id', 'Name', 'Type', 'Ownership', 'Province'], samp), 40)
put(DB, 'build', 'Where the facility codes are used in the estate', 'Measured live with read-only counts.', 'table', table(['Source', 'Table.column', 'Rows', 'Linked to this list'], [
    ['This database', 'mfl_facility.alternative_code', nfac, f'{alt} facilities carry a short code; JHBPVT and JCH are the two the hospitals use'],
    ['Private hospital', 'fac.facility.facility_code', 1, f'{pn} row with code JHBPVT, which matches {len([f for f in facs if f[5] == "JHBPVT"])} facility here'],
    ['Public hospital', 'his.encounter.facility_code', fmt(pe), f'{fmt(pe_in)} ({pct(pe_in, pe)}) carry code JCH; {pe_d} distinct code in the table']]), 50, True)
sc = '\n'.join(f"- {n}, {s:,} bytes, last modified {dts(d)}" for n, s, d in scripts)
bk = '\n'.join(f"- {n}, {s:,} bytes, {dts(d)}" for n, s, d in backups)
put(DB, 'build', 'How it was made', 'Built only from scripts and backups on this PC.', 'text',
    f'''**Scripts that still exist** [3][4]:
{sc}

Per the build methods: the SQL script creates 13 tables and inserts the original 32 organisation units (country, 9 provinces, districts, sub-districts and the first 10 facilities). A later script added 27 facilities, another upper-cased the facility codes, and another added the data elements, periods and the dataset (seed 20261113). Data values stay empty and no indicator table exists; that is a design choice [3].

**Backups** (pg_dump files kept on 10 November 2026):
{bk}

The partner's DHIS2 aggregate reference ("17 and 18") is not on this PC, and the source of the unit and facility values is not recorded beyond the scripts [3].''', 60)
put(DB, 'build', 'Security and access', 'How the database is protected. No credentials are described here.', 'text',
    'One PostgreSQL superuser account is used; there is no read-only role. Access is by a stored password entry, not described here. The database holds only facility and reference data, no patients [3]. Open it read-only.', 70)
put(DB, 'build', 'How to query it', 'Read-only examples (PostgreSQL). Each returns counts or places, never patients.', 'queries',
    '''-- 1. Units per level
SELECT hierarchylevel, COUNT(*) FROM organisationunit GROUP BY 1 ORDER BY 1;

-- 2. Facilities by type
SELECT facility_type, COUNT(*) FROM mfl_facility GROUP BY 1 ORDER BY 2 DESC;

-- 3. Which facility does a hospital's short code mean?
SELECT facility_uid, national_facility_id, facility_name FROM mfl_facility WHERE alternative_code = 'JCH';

-- 4. Facility with its district and province
SELECT f.facility_name, d.name AS district, p.name AS province FROM mfl_facility f
 JOIN organisationunit o ON o.uid=f.facility_uid JOIN organisationunit s ON s.organisationunitid=o.parentid
 JOIN organisationunit d ON d.organisationunitid=s.parentid JOIN organisationunit p ON p.organisationunitid=d.parentid;

-- 5. Filled-in attributes
SELECT COUNT(latitude), COUNT(physical_address), COUNT(telephone), COUNT(email) FROM mfl_facility;''', 80)
put(DB, 'build', 'Reproduce these figures', 'The exact check behind each headline number on this page.', 'queries',
    f'''Tables ({nT}), columns ({nC}):  information_schema.tables / .columns
Units ({sum(int(b) for a, b in lvl)}), facilities ({nfac}):  example 1 and  SELECT COUNT(*) FROM mfl_facility
Facility attributes filled ({lat} coordinates, {addr} addresses):  example 5
Hospital links ({pn} private row, {fmt(pe_in)} public encounters):  SELECT COUNT(*) FROM fac.facility WHERE facility_code='JHBPVT' (private_hospital) and SELECT COUNT(*) FROM his.encounter WHERE facility_code='JCH' (public_hospital)
Database size ({size:,} bytes):  pg_database_size
Measured on {TODAY}.''', 90)
put(DB, 'build', 'Decisions, gaps and open items', 'What was decided, what is missing (with sizes), and where each item stands.', 'text',
    f'''**Decisions (recorded in the build methods and final document)**
- **Keep the standard DHIS2 table layout** and add a South African facility table beside it [3][4].
- **Leave data values empty and add no indicator table**, because this database is a facility list, not a statistics store [3].
- **Give each facility a short alternative code** so the two hospitals can point at it [3].

**Gaps (measured)**
- Only {nfac} facilities; the real list is far larger (about 4,300 public facilities in a 2019 study [2]).
- {nfac - lat} of {nfac} facilities have no coordinates, and none carry an address, telephone or email.
- {nEmpty} of {nT} tables are empty (category, combo, group and data-value tables).
- Of {pe_d} distinct facility code in the public encounter table, all rows use JCH; the private hospital has one facility.

**Open items**
| Item | Status |
| --- | --- |
| Source of unit and facility values | Not established (not recorded beyond scripts) |
| Partner DHIS2 aggregate reference ("17 and 18") | Not established (not on this PC) |
| Fill in coordinates and contact details | Open. No decision has been made |
| Load data values and categories | Open. Design choice to leave empty for now |
| Clinic spreadsheets as a source | Open. No decision to build |''', 95)

for n, s, d in scripts:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Wrote {n.split(chr(92))[-1]}', 'A script that builds or extends the facility list was written at this time.', f'{n}, {s:,} bytes, last modified {dts(d)}.')
for n, s, d in backups:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Backed up the facility list: {n.split(chr(92))[-1]}', 'A pg_dump copy of the database was kept.', f'{n}, {s:,} bytes, dated {dts(d)}.')
log(DB, datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', 'MFL and DHIS2 record filled in depth', 'Background and Build record were written from the live database, hospital counts and two opened sources. DHIS2 hierarchy definition and live list size are marked not established.',
    f'Written from measurements on {TODAY}. Not established: DHIS2 organisation-unit documentation, current real list size, the real facility code format.')
