import sys, os, json, random, subprocess, csv, io, sqlite3
sys.path.insert(0, os.path.dirname(__file__))
from fp import *

r = subprocess.run(['supabase', 'db', 'query', '--linked', "select d.slug, c.title, c.kind, c.body from db_content c join databases d on d.id=c.database_id"], cwd=REPO, capture_output=True, text=True)
rows = json.loads(r.stdout[r.stdout.index('{'):])['rows']
C = {(x['slug'], x['title']): x for x in rows}
random.seed(20261111)
res = []
def chk(slug, what, pub, live):
    ok = str(pub).replace(',', '') == str(live).replace(',', '')
    res.append((slug, ok)); print(('PASS' if ok else 'FAIL'), slug, '|', what, '| published', pub, '| live', live)

def table_rows(slug):
    b = json.loads(C[(slug, 'Tables and row counts')]['body'])
    return b['rows']

cfg = {
    'private_hospital': ('mssql', 1433, 'private_hospital'), 'public_hospital': ('mssql', 1438, 'public_hospital'),
    'hprs': ('mssql', 1436, 'hprs_identity'), 'hpcsa': ('mssql', 1437, 'hpcsa_registry'),
    'mfl_dhis2': ('pg', 5432, 'mfl_dhis2'), 'cms': ('pg', 5433, 'cms_schemes'),
}
for slug, (eng, port, dbn) in cfg.items():
    tr = table_rows(slug)
    pick = random.sample(tr, min(10, len(tr)))
    for t in pick:
        name = t[0]; pubv = t[1]
        q = f'select count(*) from {name}' if eng == 'mssql' else f'select count(*) from public.{name}'
        live = mssql_one(port, dbn, q) if eng == 'mssql' else pg_rows(port, dbn, q)[0][0]
        chk(slug, f'rows in {name}', pubv, live)

# SQLite
for slug, path in [('nhls', 'C:/Database/registries/nhls_lab_codes.db'), ('sanc', 'C:/Database/registries/sanc_registry.db')]:
    c = lite(path)
    tr = table_rows(slug)
    for t in tr:
        chk(slug, f'rows in {t[0]}', t[1], c.execute(f'select count(*) from {t[0]}').fetchone()[0])
    ch = json.loads(C[(slug, 'Registrations by category' if slug == 'sanc' else 'Tests by discipline')]['body'])
    tot = sum(i['value'] for i in ch['items'])
    live = c.execute('select count(*) from ' + ('nurse_registration' if slug == 'sanc' else 'lab_test')).fetchone()[0]
    chk(slug, 'chart total', tot, live)
    if slug == 'sanc':
        sus = c.execute("select count(*) from nurse_registration where registration_status='Suspended'").fetchone()[0]
        st = json.loads(C[(slug, 'Registration status')]['body'])['items']
        chk(slug, 'suspended', [i['value'] for i in st if i['label'] == 'Suspended'][0], sus)
        chk(slug, 'valid APC', [i['value'] for i in st if i['label'] == 'Valid APC'][0], c.execute("select count(*) from nurse_registration where registration_status='Valid APC'").fetchone()[0])
    else:
        lo = json.loads(C[(slug, 'Code coverage')]['body'])['items']
        chk(slug, 'LOINC coverage', [i['value'] for i in lo if i['label'] == 'LOINC code'][0], c.execute("select count(*) from lab_test where loinc_code is not null and loinc_code<>''").fetchone()[0])

# CSV files
for slug, path, key in [('nappi', 'C:/Database/registries/nappi_codes.csv', None), ('icd10', 'C:/Database/registries/icd10_mit.csv', None), ('nrpl', 'C:/Database/registries/nrpl_items.csv', None)]:
    raw, rr = csv_rows(path)
    body = C[(slug, 'The file')]['body'] if (slug, 'The file') in C else None
    titles = [t for (s, t) in C if s == slug and t.startswith(('The ', 'File'))]
    got = None
    for t in [t for (s, t) in C if s == slug]:
        b = C[(slug, t)]['body']
        if C[(slug, t)]['kind'] == 'text' and f'{len(raw):,} bytes' in b:
            got = t; break
    chk(slug, f'file size {len(raw):,} bytes appears in "{got}"', 'found' if got else 'missing', 'found')
    for t in [t for (s, t) in C if s == slug]:
        b = C[(slug, t)]['body']
        if C[(slug, t)]['kind'] == 'text' and f'{len(rr)} rows' in b:
            chk(slug, f'row count {len(rr)} appears in "{t}"', 'found', 'found'); break
    else:
        chk(slug, f'row count {len(rr)} appears', 'missing', 'found')

# hospital monthly sums
for slug, port, tbl in [('private_hospital', 1433, 'adt.encounter'), ('public_hospital', 1438, 'his.encounter')]:
    ch = json.loads(C[(slug, 'Visits by month')]['body'])['items']
    chk(slug, 'visits by month total', sum(i['value'] for i in ch), mssql_one(port, slug, f'select count(*) from {tbl}'))
print('SUMMARY', sum(1 for _, ok in res if ok), 'pass', sum(1 for _, ok in res if not ok), 'fail of', len(res))
