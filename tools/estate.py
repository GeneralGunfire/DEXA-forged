import sys, os, csv, io, datetime
sys.path.insert(0, os.path.dirname(__file__))
from fp import *
if os.environ.get('NOLOG'):
    log = lambda *a, **k: None

DB = None
def put_e(title, summary, kind, body, pos, opened=False):
    f = os.path.join(TMP, f'estate_{pos}.txt')
    open(f, 'w', encoding='utf-8').write(body)
    cmd = ['node', 'scripts/forged-content', '--area', 'estate', '--title', title, '--summary', summary, '--kind', kind, '--body-file', f, '--position', str(pos)]
    if opened:
        cmd.append('--open')
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=180)
    ok = r.returncode == 0 and len(r.stdout.strip()) == 36
    print(('OK  ' if ok else 'FAIL'), 'estate', pos, title, '' if ok else (r.stderr or r.stdout).strip()[:220])

# ---- sources and sizes ----
ms = lambda port, db, q: mssql_one(port, db, q)
inst = [('Private hospital', 1433, 'private_hospital', 'default (MSSQLSERVER)'), ('Public hospital', 1438, 'public_hospital', 'PUBHOSPITAL'),
        ('HPRS patient registry', 1436, 'hprs_identity', 'HPRS'), ('HPCSA practitioner register', 1437, 'hpcsa_registry', 'HPCSA')]
rows_inst = []
sizes = []
for name, port, db, ins in inst:
    v = ms(port, db, "select cast(serverproperty('ProductVersion') as varchar(30))")
    mb = float(ms(port, db, 'select cast(sum(size)*8.0/1024 as decimal(12,1)) from sys.database_files'))
    nt = int(ms(port, db, 'select count(*) from sys.tables'))
    rows_inst.append([name, f'SQL Server {v}', port, ins, db, f'{nt}', f'{mb:,.1f} MB'])
    sizes.append((name, mb))
for name, port, db, ins in [('MFL and DHIS2', 5432, 'mfl_dhis2', 'postgresql-x64-16'), ('CMS medical schemes', 5433, 'cms_schemes', 'postgresql-cms')]:
    v = pg_rows(port, db, 'show server_version')[0][0]
    b = int(pg_rows(port, db, f"select pg_database_size('{db}')")[0][0])
    nt = int(pg_rows(port, db, "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")[0][0])
    rows_inst.append([name, f'PostgreSQL {v}', port, ins, db, f'{nt}', f'{b / 1048576:,.1f} MB'])
    sizes.append((name, b / 1048576))
files = [('NAPPI medicine codes', 'C:/Database/registries/nappi_codes.csv', 'CSV'), ('ICD-10 diagnosis codes', 'C:/Database/registries/icd10_mit.csv', 'CSV'),
         ('NRPL tariff items', 'C:/Database/registries/nrpl_items.csv', 'CSV'), ('NHLS laboratory codes', 'C:/Database/registries/nhls_lab_codes.db', 'SQLite'),
         ('SANC nursing register', 'C:/Database/registries/sanc_registry.db', 'SQLite')]
for name, p, kind in files:
    s = os.path.getsize(p)
    rows_inst.append([name, kind + (' file' if kind == 'CSV' else ' file (3.50)'), 'none', 'none (file)', os.path.basename(p), '1' if kind == 'CSV' else '4' if 'nhls' in p else '3', f'{s / 1048576:,.2f} MB'])
    sizes.append((name, s / 1048576))

# ---- relationships, measured live ----
hp = {r[0] for r in mssql_rows(1437, 'hpcsa_registry', 'select hpcsa_registration_no from dbo.practitioner')}
sn = {r[0] for r in lite('C:/Database/registries/sanc_registry.db').execute('select sanc_registration_no from nurse').fetchall()}
cm = {r[0] for r in pg_rows(5433, 'cms_schemes', 'select member_number from scheme_member')}
hs = {r[0] for r in mssql_rows(1436, 'hprs_identity', 'select sa_id_number from dbo.patient where sa_id_number is not null')}
mfl = {r[0] for r in pg_rows(5432, 'mfl_dhis2', "select alternative_code from mfl_facility where alternative_code is not null")}
nappi = {r['nappi_code'] for r in csv.DictReader(io.StringIO(open('C:/Database/registries/nappi_codes.csv', encoding='utf-8-sig').read()))}
icd = {r['icd10_code'] for r in csv.DictReader(io.StringIO(open('C:/Database/registries/icd10_mit.csv', encoding='utf-8-sig').read()))}
nrpl = {r['item_code'] for r in csv.DictReader(io.StringIO(open('C:/Database/registries/nrpl_items.csv', encoding='utf-8-sig').read()))}
nh = lite('C:/Database/registries/nhls_lab_codes.db')
nhc = {r[0] for r in nh.execute('select nhls_test_code from lab_test').fetchall()}
nhl = {r[0] for r in nh.execute("select loinc_code from lab_test where loinc_code is not null and loinc_code<>''").fetchall()}

def col(port, db, q):
    return [r[0] for r in mssql_rows(port, db, q)]

L = []
def link(label, pairs, universe, note=''):
    n = len(pairs); hit = sum(1 for x in pairs if x in universe)
    L.append([label, f'{n:,}', f'{hit:,}', pct(hit, n), note])

link('Private doctors to HPCSA register', col(1433, 'private_hospital', 'select reg_no from prac.practitioner_registration where reg_no is not null'), hp)
link('Private staff to SANC register', col(1433, 'private_hospital', 'select council_reg_no from hr.staff where council_reg_no is not null'), sn)
link('Public doctors to HPCSA register', col(1438, 'public_hospital', 'select HPCSA_NO from dbo.DOCTOR_MASTER where HPCSA_NO is not null'), hp)
link('Public staff to SANC register', col(1438, 'public_hospital', 'select HPCSA_SANC_NO from dbo.STAFF_MASTER where HPCSA_SANC_NO is not null'), sn)
link('Private scheme members to CMS register', col(1433, 'private_hospital', 'select membership_no from pat.patient_scheme_membership where membership_no is not null'), cm)
link('Public medical-aid numbers to CMS register', col(1438, 'public_hospital', 'select MEMBER_NO from dbo.PAT_MEDAID where MEMBER_NO is not null'), cm)
link('Private patients with SA ID to HPRS', col(1433, 'private_hospital', "select id_value from pat.patient_identifier where id_type_code='SA_ID'"), hs)
link('Public patients with SA ID to HPRS', col(1438, 'public_hospital', 'select id_number from his.patient where id_number is not null'), hs)
link('Private facility code to MFL', col(1433, 'private_hospital', 'select facility_code from fac.facility'), mfl, 'one facility')
link('Public encounters facility code to MFL', col(1438, 'public_hospital', 'select facility_code from his.encounter'), mfl, 'one facility code')
link('Private NAPPI products to NAPPI file', col(1433, 'private_hospital', 'select nappi_code from ref.nappi_product'), nappi)
link('Public pharmacy items to NAPPI file', col(1438, 'public_hospital', 'select NAPPI_CODE from dbo.PHARM_ITEM_MASTER where NAPPI_CODE is not null'), nappi)
link('Private ICD-10 codes to ICD-10 file', col(1433, 'private_hospital', 'select icd10_code from ref.icd10_code'), icd)
link('Public ICD-10 local codes to ICD-10 file', col(1438, 'public_hospital', 'select ICD10 from dbo.ICD10_LOCAL'), icd)
link('Private tariff items to NRPL file', col(1433, 'private_hospital', 'select tariff_code from ref.tariff_item'), nrpl)
link('Public billing tariff rows to NRPL file', col(1438, 'public_hospital', 'select ITEM_CODE from dbo.BILL_TARIFF'), nrpl)
link('Private lab tests to NHLS file (LOINC)', col(1433, 'private_hospital', "select loinc_code from ref.lab_test where loinc_code is not null and loinc_code<>''"), nhl)
link('Public lab result rows to NHLS file', col(1438, 'public_hospital', 'select TEST_CODE from dbo.LAB_RESULT_IMPORT'), nhc)

# folder layout (names and counts only)
base = 'C:/Database'
lay = []
for d in sorted(os.listdir(base)):
    p = os.path.join(base, d)
    if os.path.isdir(p):
        n = sum(len(f) for _, _, f in os.walk(p)); b = sum(os.path.getsize(os.path.join(a, x)) for a, _, f in os.walk(p) for x in f)
        lay.append([d + '/', n, f'{b / 1048576:,.1f} MB'])
    else:
        lay.append([d, 1, f'{os.path.getsize(p) / 1048576:,.2f} MB'])
what = {'registries/': 'CSV code lists, SQLite registries, and the SQL scripts that built the registries', 'backups/': 'Named database backups from 10 November 2026', '_backups/': 'Time-stamped backups with manifests', 'final_pass/': 'The close-out Python scripts', 'handback/': 'Facts files, build methods and data dictionaries per source', '_handback/': 'Hand-back zips', 'schema/': 'Numbered T-SQL schema scripts for the two hospitals', 'scripts/': 'Population and helper scripts', 'docs/': 'Older documents and domain maps', 'verification/': 'Verification outputs', 'connection_strings/': 'Connection details (never described or committed)', 'population_inputs/': 'Inputs used to plan the populations', 'reference/': 'Reference copies of the schema scripts', 'tests/': 'SQL smoke tests', 'tools/': 'Helper tools', 'transfer/': 'Transfer files', '_to_delete/': 'Files set aside for deletion', '.git/': 'Version-control history of the folder'}
for r in lay:
    r.append(what.get(r[0], ''))

now = TODAY
nrows = sum(1 for _ in rows_inst)

put_e('The estate in plain words', 'What the whole SAHealth data estate is, in a few sentences.', 'text',
      f'''> SAHealth Phase 1 is a practice copy of the health data a national gateway would have to join up: two hospitals, four registers of professionals, schemes and patients, and four code lists. Everything is invented but shaped like the real thing, so the gateway can be built and tested without touching a real patient.

This page covers the 11 sources on Machine A (Rajen's PC): {len(inst) + 2} databases on two engines (SQL Server and PostgreSQL) and {len(files)} files. Machine B (Huzayfa's laptop) holds 2 more sources and is documented separately, so it is not described here. All figures below were measured on {now}.''', 10, True)
put_e('Sources by size', 'The size of each source on Machine A (measured).', 'chart', chart('bar', [{'label': a, 'value': round(b, 2)} for a, b in sorted(sizes, key=lambda x: -x[1])], 'MB'), 11, True)
put_e('Source registry', 'Engine, port, instance and size of every source on Machine A. No credentials are described.', 'table',
      table(['Source', 'Engine', 'Port', 'Instance', 'Database or file', 'Tables', 'Size'], rows_inst), 20)
put_e('How the sources connect', 'For each link between sources: how many values there are and how many resolve, measured live. Values are not published.', 'table',
      table(['Link', 'Values', 'Resolve', 'Share', 'Note'], L), 30, True)
put_e('Folder layout', 'What each folder under the database root holds. File counts and sizes only.', 'table', table(['Folder', 'Files', 'Size', 'What it holds'], lay), 40)
nm = {r[0]: r for r in L}
put_e('Topology decisions', 'How the estate is laid out and why, from the build records.', 'text',
      '''**Decisions (recorded in the build methods and final documents)**
- **Two SQL Server named instances plus the default.** The private hospital sits on the default instance and the public hospital, HPRS and HPCSA each have a named instance, so each source behaves like a separate system [3].
- **Two PostgreSQL clusters** (ports 5432 and 5433) for the facility list and the medical schemes [3].
- **SQLite and CSV for registries that are lookup lists**, which a gateway consults rather than queries as a service [3].
- **Windows authentication for measurements.** No gateway login exists yet; read-only logins for two sources are held outside the repository [3].
- **Machine B documented separately.** The two sources on Huzayfa's laptop are out of scope here.

**Open items**
| Item | Status |
| --- | --- |
| Clinic Excel and CSV sources | Open. No decision has been made to build them |
| Gateway logins and read-only roles | Phase 2 |
| Second facility per hospital source | Open. No decision has been made |
| Populations of the first loads are not reproducible (no seeds recorded) | Not established |''', 50)
put_e('Research gaps across the estate', 'The real-world points that could not be established, in one place.', 'text',
      '''Every record marks what it could not confirm. The common gaps are:
- **Sources that could not be opened.** The nursing council and several news pages returned HTTP 403, a parliamentary reply and the DHIS2 documentation returned 404, and one tariff PDF was image-only.
- **Real code structures and sizes.** The real NHLS test-code structure, the real NAPPI product count and some real counts for the facility and patient registers are partly confirmed at best.
- **Population seeds.** The generators of the register populations and the first hospital loads are not on this PC, so their seeds are not established.
- **Newest figures.** The HPCSA 2023/24 report did not download, so the newest register size read is from April 2023.

Where a number is given elsewhere on the site it was measured on the day shown on that page; where it could not be, the page says "not established".''', 60)

log_when = datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00')
print('log-estate-note only after all pass')
