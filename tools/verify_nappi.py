import json, re, subprocess, csv, io, collections, random

import os
REPO = os.environ.get('FORGED_REPO', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def dbq(q):
    r = subprocess.run(['supabase', 'db', 'query', '--linked', q], cwd=REPO, capture_output=True, text=True, timeout=120)
    txt = r.stdout
    i = txt.index('{')
    return json.loads(txt[i:txt.rindex('}') + 1])['rows']


secs = dbq("select area, position, title, kind, summary, body from public.db_content where database_id = (select id from public.databases where slug='nappi') order by area, position")
print('sections read back:', len(secs), '| areas:', dict(collections.Counter(s['area'] for s in secs)))
ents = dbq("select title, type, happened_at from public.timeline_entries where database_id = (select id from public.databases where slug='nappi') order by happened_at")
print('timeline entries for nappi:', len(ents))

# ---- pattern check over everything written
def luhn(d):
    s, alt = 0, False
    for ch in reversed(d):
        n = int(ch)
        if alt:
            n *= 2
            n -= 9 if n > 9 else 0
        s += n
        alt = not alt
    return s % 10 == 0

text = '\n'.join(s['title'] + '\n' + s['summary'] + '\n' + s['body'] for s in secs) + '\n' + '\n'.join(e['title'] for e in ents)
hits = {
    'SA ID (13 digits + Luhn)': sum(1 for m in re.findall(r'(?<!\d)\d{13}(?!\d)', text) if luhn(m)),
    'email': len(re.findall(r'[\w.+-]+@[\w-]+\.[\w.]+', text)),
    'password= / pwd= / token= / apikey / secret': len(re.findall(r'(?i)password\s*=|pwd\s*=|token\s*=|api[-_ ]?key|secret', text)),
    'Bearer / private key': len(re.findall(r'Bearer\s+\S{20,}|BEGIN [A-Z ]*PRIVATE KEY', text)),
    'long base64-like (>40)': sum(1 for m in re.findall(r'[A-Za-z0-9+/]{41,}', text) if sum(bool(re.search(p, m)) for p in ('[A-Z]', '[a-z]', '[0-9]')) >= 2),
    'connection string': len(re.findall(r'(?i)(server|data source)\s*=.*;|\w+://\S+@', text)),
}
print('pattern check:', 'CLEAN' if not any(hits.values()) else hits)

# ---- ten random figures re-measured independently
raw = open('C:/Database/registries/nappi_codes.csv', 'rb').read().decode('utf-8')
rows = list(csv.DictReader(io.StringIO(raw)))
codes = ','.join("'" + r['nappi_code'] + "'" for r in rows)


def sql(port, db, q):
    r = subprocess.run(['sqlcmd', '-S', f"{os.environ.get('SAH_DB_HOST', 'localhost')},{port}", '-d', db, '-E', '-C', '-W', '-h', '-1', '-Q', 'set nocount on; ' + q], capture_output=True, text=True, timeout=120)
    return int([l for l in r.stdout.splitlines() if l.strip()][0])

checks = {
    'file rows 77': (len(rows), 77),
    'tablets 58': (sum(1 for r in rows if r['dosage_form'] == 'Tablet'), 58),
    'schedule S3 = 33': (sum(1 for r in rows if r['schedule'] == 'S3'), 33),
    'Adcock Ingram = 18': (sum(1 for r in rows if r['manufacturer'] == 'Adcock Ingram'), 18),
    'private products 92': (sql(1433, 'private_hospital', 'select count(*) from ref.nappi_product'), 92),
    'private in file 27': (sql(1433, 'private_hospital', f'select count(*) from ref.nappi_product where nappi_code in ({codes})'), 27),
    'public products 103': (sql(1438, 'public_hospital', 'select count(*) from dbo.PHARM_ITEM_MASTER'), 103),
    'public in file 33': (sql(1438, 'public_hospital', f'select count(*) from dbo.PHARM_ITEM_MASTER where NAPPI_CODE in ({codes})'), 33),
    'rx lines blank 1,023': (sql(1433, 'private_hospital', "select count(*) from rx.prescription_line where nappi_code is null or ltrim(rtrim(nappi_code))=''"), 1023),
    'billing rows 166,331': (sql(1433, 'private_hospital', 'select count(*) from bill.charge'), 166331),
}
bad = [k for k, (a, b) in checks.items() if a != b]
print('figure re-check:', len(checks) - len(bad), 'of', len(checks), 'match' if not bad else ('MISMATCH ' + str(bad)))
# and that the stored text contains them
stored = text
print('stored text contains 27 of 92:', '27 (29.3%)' in stored, '| 33 (32.0%):', '33 (32.0%)' in stored)
