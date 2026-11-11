import sys, os, re, collections, datetime
sys.path.insert(0, os.path.dirname(__file__))
from fp import *

DB = 'nrpl'
CSVP = 'C:/Database/registries/nrpl_items.csv'
raw, rows = csv_rows(CSVP)
ff = file_facts(CSVP)
cols = list(rows[0].keys())
N = len(rows)
codes = [r['item_code'] for r in rows]
assert len(set(codes)) == N
blank = {c: sum(1 for r in rows if not r[c].strip()) for c in cols}
distinct = {c: len({r[c] for r in rows}) for c in cols}
maxlen = {c: max(len(r[c]) for r in rows) for c in cols}
sched = collections.Counter(r['schedule_code'] for r in rows)
groups = collections.Counter(r['provider_group'] for r in rows)
itype = collections.Counter(r['item_type'] for r in rows)
cat = collections.Counter(r['category'] for r in rows)
prices = [float(r['reference_price_zar']) for r in rows if r['reference_price_zar'].strip()]
rvus = [float(r['rvu']) for r in rows if r['rvu'].strip()]
no_rvu = sum(1 for r in rows if not r['rvu'].strip())
no_price = sum(1 for r in rows if not r['reference_price_zar'].strip())
eff = sorted({r['effective_from'] for r in rows})
in_list = ','.join("'" + c + "'" for c in codes)

P = lambda q: mssql_one(1433, 'private_hospital', q)
U = lambda q: mssql_one(1438, 'public_hospital', q)
p_t = int(P('select count(*) from ref.tariff_item'))
p_in = int(P(f'select count(*) from ref.tariff_item where tariff_code in ({in_list})'))
p_types = mssql_rows(1433, 'private_hospital', 'select tariff_type, count(*) from ref.tariff_item group by tariff_type order by 2 desc')
p_charge = int(P('select count(*) from bill.charge'))
p_charge_in = int(P(f'select count(*) from bill.charge c join ref.tariff_item t on t.tariff_item_id=c.tariff_item_id where t.tariff_code in ({in_list})'))
u_t = int(U('select count(*) from dbo.BILL_TARIFF'))
u_in = int(U(f'select count(*) from dbo.BILL_TARIFF where ITEM_CODE in ({in_list})'))
u_cls = mssql_rows(1438, 'public_hospital', 'select CLASS, count(*) from dbo.BILL_TARIFF group by CLASS order by 2 desc')
u_year = mssql_rows(1438, 'public_hospital', 'select TARIFF_YEAR, count(*) from dbo.BILL_TARIFF group by TARIFF_YEAR')
u_rate_bad = int(U("select count(*) from dbo.BILL_TARIFF where try_cast(RATE as decimal(18,2)) is null"))

scripts = []
for fn in sorted(os.listdir('C:/Database/final_pass/scripts')):
    p = os.path.join('C:/Database/final_pass/scripts', fn)
    if fn.endswith('.py') and os.path.isfile(p) and 'nrpl_items' in open(p, encoding='utf-8', errors='ignore').read():
        scripts.append((fn, os.path.getsize(p), datetime.datetime.fromtimestamp(os.path.getmtime(p))))
scripts.sort(key=lambda x: x[2])
backups = list_files('C:/Database/_backups', ['nrpl'])
extras = list_files('C:/Database/registries', ['nrpl'])

SRC = f'''- **[1] Acts Online, National Health Act regulations, notice R. 681 of 2007, "National Health Reference Price List"** (a legal-publishing site). http://www.acts.co.za/national_health/r681_national_health_reference_price_list (opened, accessed {TODAY}). The page shows the regulation's headings and little else.
- **[2] Provenance note beside the file** (nrpl_items.provenance.txt) and the item-types note (nrpl_items.item_types.txt), both written 10 November 2026 (read directly on {TODAY}).
- **[3] Uploaded final document 3 of 11, "NRPL Tariff Items"**, 10 November 2026.
- **Not opened:** the Government Gazette notices themselves (gov.za) and a web summary of Acts Online commentary; claims that rest on them are marked "Partly" or "Not established".'''

put(DB, 'background', 'In plain words', 'What the price list is, in a few sentences.', 'text',
    '''> Every service a doctor or hospital bills for has a code and a reference price, like an item on a menu with a price beside it. Private medical aids use one national list, and public hospitals charge patients by a different, income-based fee list. This record is about our small practice copy of both.

For SAHealth the point is simple: if the gateway cannot match a billing code it cannot check the price or know what was done.''', 10, True)
put(DB, 'background', 'What it is and who runs it', 'What could be confirmed about the real lists.', 'text',
    f'''**Legal basis. Confirmed [1].** The National Health Reference Price List appears under regulations on obtaining information and on determining and publishing reference price lists, notice R. 681 of 2007. The page headings include "Commissioning of costing surveys", "Determination of the Reference Price Lists" and "Publication of the Reference Price List".

**Where the forms and information are. Confirmed [1].** The page says the forms and information regarding the Reference Price List are available in Government Gazette No. 30110 dated 23 July 2007.

**Who publishes it, what it contains and who must use it. Not established.** The regulation page does not name a publisher, define the list, describe its contents or say who it applies to, and I could not open the gazette itself. A web summary says the Director-General publishes the list, that the lists are public documents with no copyright claimed, and that an earlier set of regulations (notice R. 1214 of 2006) had a different publication timetable. I did not open those sources, so these are **Partly**.

**The public-sector fee schedule. Not established today.** The project document says public hospitals charge patients by a Uniform Patient Fee Schedule that sets fees by means-tested category [3]. I could not open a source for this.''', 20)
put(DB, 'background', 'Real-world shortfalls', 'What the evidence supports, and what it does not.', 'text',
    '''I could open only the regulation's index page, so very little about real-world problems can be evidenced.

- **Thin public detail on the page. Confirmed [1].** The page gives no definition, no contents and no list of who must use the price list.
- **Current status of the list. Not established.** I found no opened source saying whether the list is currently in use, withdrawn or replaced, and I did not confirm the dates of any review cycle.
- **How well hospitals and schemes follow it. Not established.** The project document says hospitals keep their own local codes and prices [3]; I found no real-world evidence.''', 30)
put(DB, 'background', 'Why it matters to the gateway', 'The practical reason this list is in the estate.', 'text',
    'A price list gives every procedure or item a code and a price, so a hospital bill and a scheme claim can name the same thing. The gateway needs a reference list to check billing items against, to notice a wrong code and to compare a hospital\'s price with a reference price. The file is kept as a flat file because price lists are exchanged as files [3].', 40)
put(DB, 'background', 'Sources', 'Every source used, with the date it was opened.', 'sources', SRC, 90)

put(DB, 'build', 'Items by list', f'The {N} items split by price list.', 'chart', chart('stacked', [{'label': 'NRPL (private sector)', 'value': sched['NRPL']}, {'label': 'UPFS (public sector fees)', 'value': sched['UPFS']}]), 10, True)
put(DB, 'build', 'Items by provider group', f'{len(groups)} provider groups (measured from the file).', 'chart', bars(groups), 11, True)
put(DB, 'build', 'Items by type', 'S, M, N and R. The meanings are inferred in the item-types note, not confirmed.', 'chart', chart('bar', [{'label': {'S': 'S (service)', 'M': 'M (modifier)', 'N': 'N (note)', 'R': 'R (rule)'}.get(k, k), 'value': v} for k, v in itype.most_common()]), 12)
put(DB, 'build', 'Hospital tariff lists against the file', 'How many of each hospital\'s tariff rows carry an item code that is in the file.', 'chart', chart('bar', [
    {'label': 'Private hospital: tariff rows with a file code', 'value': p_in}, {'label': 'Private hospital: tariff rows with their own code', 'value': p_t - p_in},
    {'label': 'Public hospital: tariff rows with a file code', 'value': u_in}, {'label': 'Public hospital: tariff rows with their own code', 'value': u_t - u_in}]), 13, True)

put(DB, 'build', 'The file and how it was checked', 'Where it lives, how big it is and what was verified.', 'text',
    f'''- **File:** nrpl_items.csv, in the registries folder of the Machine A database folder, with two notes beside it (provenance and item types). A plain comma-separated text file with a header row. No server, port or login.
- **Size and date:** {ff['bytes']:,} bytes, last modified {ff['mtime']}. Encoding UTF-8, {'with' if ff['bom'] else 'no'} byte-order mark.
- **Shape:** {N} rows and {len(cols)} columns; {N} distinct item codes. {sched['NRPL']} NRPL rows and {sched['UPFS']} UPFS rows; {len(groups)} provider groups; {len(cat)} categories.
- **Prices:** {len(prices)} rows carry a reference price, from R{min(prices):,.2f} to R{max(prices):,.2f}; {no_price} rows have none. {len(rvus)} rows carry a relative value unit (RVU) from {min(rvus):.2f} to {max(rvus):.2f}; {no_rvu} have none.
- **Dates:** effective_from {', '.join(eff)}; effective_to is blank on every row.
- **Blank cells:** {sum(blank.values())} in total ({', '.join(f'{c} {blank[c]}' for c in cols if blank[c])}).
- **Fingerprint:** the SHA-256 starts {ff['sha'][:12]}; the full value is in the provenance note [2].
- **Checked:** read directly on {TODAY}; the figures on this page were re-measured then.''', 20)
put(DB, 'build', 'The 11 columns', 'Every column, measured from the file. Meanings are taken from the column names.', 'table',
    table(['Column', 'Example (first row)', 'Blank', 'Distinct', 'Longest'], [[c, rows[0][c][:45], blank[c], distinct[c], maxlen[c]] for c in cols]), 30)
put(DB, 'build', 'Sample rows', 'The first 5 rows. The file sampled is nrpl_items.csv, a look-up price list with no personal data.', 'table',
    table(['List', 'Provider group', 'Item code', 'Type', 'Description', 'RVU', 'Price (R)'], [[r['schedule_code'], r['provider_group'], r['item_code'], r['item_type'], r['description'], r['rvu'], r['reference_price_zar']] for r in rows[:5]]), 40)
where = [
    ['Private hospital', 'ref.tariff_item.tariff_code', fmt(p_t), '0', f'{p_in} ({pct(p_in, p_t)}). Types: ' + ', '.join(f'{a} {b}' for a, b in p_types)],
    ['Private hospital', 'bill.charge (by tariff_item_id)', fmt(p_charge), 'n/a', f'{fmt(p_charge_in)} charges ({pct(p_charge_in, p_charge)}) point at a tariff row whose code is in the file'],
    ['Public hospital', 'dbo.BILL_TARIFF.ITEM_CODE', fmt(u_t), '0', f'{u_in} ({pct(u_in, u_t)}). Tariff year: ' + ', '.join(f'{a} ({b})' for a, b in u_year) + f'. {u_rate_bad} rates are not a plain number'],
]
put(DB, 'build', 'Where tariff codes appear in the estate', 'Measured live with read-only counts on the two hospital databases.', 'table',
    table(['Source', 'Table.column', 'Rows', 'Blank', 'Rows with a code from the file'], where), 50, True)
sc = '\n'.join(f"- {n}, {s:,} bytes, last modified {d:%d %B %Y at %H:%M}".replace(' 0', ' ') for n, s, d in scripts) or '- none found'
put(DB, 'build', 'How it was made', 'Built only from what files, backups and the notes show.', 'text',
    f'''**The file (25 October 2026).** The file's timestamps are 25 October 2026. The provenance note says a Claude Code build prompt of that date asked for three small CSV files with "realistic seed rows"; {N} rows were delivered [2]. No generating script, seed or git history exists. The source, licence and extraction date are **not established**.

**The item-types note.** A note beside the file records, from a live count on 10 November 2026 at 20:50, that the meanings of item types M, N and R are inferred from the descriptions and from which columns are filled, because no code book for the file was found [2].

**Scripts that read the file** (dated by last-modified time; run times are not recorded):
{sc}

**Backups.** {', '.join(f"{n} ({s:,} bytes, {d:%d %B %Y %H:%M})" for n, s, d in backups) or 'none found'}.

**What the alignment did.** Per the final document [3], on 10 November 2026 hospital tariff items were matched to the file by description and the file's item code copied into each hospital's tariff table, with about 3% of matched public codes mistyped on purpose. The live counts in "Where tariff codes appear" show the result.''', 60)
put(DB, 'build', 'Security and access', 'How the file is protected. No credentials are described here.', 'text',
    'A plain text file with no accounts, encryption or audit trail of its own, protected only by file-system permissions [3]. Project rules treat it as read-only: nothing in the database folder is committed, pushed or shared, and the gateway must never write to it.', 70)
put(DB, 'build', 'How to query it', 'Read-only examples. Each returns counts, never anything personal.', 'queries',
    '''-- 1. Rows by list (PowerShell)
$r = Import-Csv "<registries folder>\\nrpl_items.csv"; $r | Group-Object schedule_code | Select-Object Name, Count

-- 2. Items by provider group
$r | Group-Object provider_group | Sort-Object Count -Descending | Select-Object Name, Count

-- 3. Items with no price
($r | Where-Object { $_.reference_price_zar -eq '' }).Count

-- 4. Private hospital: tariff rows with a code in the file (SQL Server, private_hospital)
SELECT COUNT(*) FROM ref.tariff_item WHERE tariff_code IN (/* the 81 item codes */);

-- 5. Public hospital: tariff rows with a code in the file (SQL Server, public_hospital)
SELECT COUNT(*) FROM dbo.BILL_TARIFF WHERE ITEM_CODE IN (/* the 81 item codes */);

-- 6. Public tariff rows whose rate is not a plain number
SELECT COUNT(*) FROM dbo.BILL_TARIFF WHERE TRY_CAST(RATE AS DECIMAL(18,2)) IS NULL;''', 80)
put(DB, 'build', 'Reproduce these figures', 'The exact check behind each headline number on this page.', 'queries',
    f'''Rows ({N}) and columns ({len(cols)}):  Import-Csv, then .Count
NRPL/UPFS split ({sched['NRPL']}/{sched['UPFS']}), provider groups ({len(groups)}):  example 1 and 2
Items with no price ({no_price}), no RVU ({no_rvu}):  example 3 and the same test on rvu
File size ({ff['bytes']:,} bytes), modified {ff['mtime']}:  Get-Item
SHA-256 (starts {ff['sha'][:12]}):  Get-FileHash -Algorithm SHA256
Private tariff rows {p_in} of {p_t}:  example 4
Public tariff rows {u_in} of {u_t}:  example 5
Private charges {fmt(p_charge)}, {fmt(p_charge_in)} pointing at a file code:  join bill.charge to ref.tariff_item on tariff_item_id
Measured on {TODAY}.''', 90)
put(DB, 'build', 'Decisions, gaps and open items', 'What was decided, what is missing (with sizes), and where each item stands.', 'text',
    f'''**Decisions (recorded in the files or the final document)**
- **Keep it as a flat file**, because price lists are exchanged as files [3].
- **Hold both lists in one file**, told apart by the schedule_code column [3].
- **Match hospitals by description, with no translation table**, and keep about 3% of matched public codes wrong on purpose [3].

**Gaps (measured)**
- The file holds {N} items; real price lists are far larger.
- {p_t - p_in} of the private hospital's {p_t} tariff rows and {u_t - u_in} of the public hospital's {u_t} ({pct(u_t - u_in, u_t)}) keep their own codes.
- {no_price} items have no price and {no_rvu} have no RVU (notes, rules and fee rows).
- The meanings of item types M, N and R are inferred, not confirmed.
- {u_rate_bad} public tariff rates are not a plain number (rates are stored as text).

**Open items**
| Item | Status |
| --- | --- |
| Where the {N} rows came from (source, licence, date) | Not established |
| Meaning of item types M, N and R | Not established |
| Align hospital tariff codes to the file | Resolved on 10 November 2026 |
| Code translation table | Phase 2 |
| Expand beyond {N} items | Open. No decision has been made |''', 95)

for n, s, d in scripts[:6]:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Script that reads the price list file: {n}', 'A script that reads the tariff file was last changed at this time.', f'{n}, {s:,} bytes, last modified {d:%d %B %Y at %H:%M}. Dated from the file time; the run time is not recorded.')
for n, s, d in backups:
    log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Action', f'Backed up the price list file ({n.split(chr(92))[-2] if chr(92) in n else n})', 'A copy of the tariff file was kept in the backups folder.', f'{n}, {s:,} bytes, dated {d:%d %B %Y at %H:%M}.')
for n, s, d in extras:
    if n.endswith('.txt'):
        log(DB, d.strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', f'Wrote {n.split(chr(92))[-1]}', 'A note was written beside the tariff file recording what is and is not known.', f'{n}, {s:,} bytes, last modified {d:%d %B %Y at %H:%M}.')
log(DB, datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:00+02:00'), 'Note', 'NRPL record filled in depth', 'Background and Build record were written from the real file, live hospital counts and the one regulation page that opened. Most real-world points are marked not established.',
    f'Written from measurements on {TODAY}. Not established: the origin of the {N} rows, the meaning of item types M, N and R, who must use the list, and its current status. Government Gazette notices did not open.')
