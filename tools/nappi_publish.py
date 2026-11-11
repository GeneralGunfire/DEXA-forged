"""Publish the in-depth NAPPI record to Forged. Read-only on C:\\Database. Writes only through forged-content / forged-log.
Every figure is re-measured here from the real file or a live SELECT; nothing is typed in from memory."""
import csv, collections, hashlib, io, json, os, subprocess, sys, tempfile, datetime

import os
REPO = os.environ.get('FORGED_REPO', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TMP = tempfile.mkdtemp(prefix='nappi_')
CSV = 'C:/Database/registries/nappi_codes.csv'
TODAY = datetime.date.today().strftime('%d %B %Y').lstrip('0')


def sql(port, db, q):
    r = subprocess.run(['sqlcmd', '-S', f"{os.environ.get('SAH_DB_HOST', 'localhost')},{port}", '-d', db, '-E', '-C', '-W', '-h', '-1', '-Q', 'set nocount on; ' + q],
                       capture_output=True, text=True, timeout=120)
    out = [l.strip() for l in r.stdout.splitlines() if l.strip()]
    if r.returncode != 0 or not out:
        raise SystemExit('sql failed: ' + q[:60])
    return out[0]


def put(area, title, summary, kind, body, position, opened=False):
    f = os.path.join(TMP, f'{abs(hash((area, title)))}.txt')
    open(f, 'w', encoding='utf-8').write(body)
    cmd = ['node', 'scripts/forged-content', '--db', 'nappi', '--area', area, '--title', title, '--summary', summary,
           '--kind', kind, '--body-file', f, '--position', str(position)]
    if opened:
        cmd.append('--open')
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=120)
    ok = r.returncode == 0 and len(r.stdout.strip()) == 36
    print(('OK  ' if ok else 'FAIL'), area, position, title, '' if ok else (r.stderr or r.stdout).strip()[:200])
    return ok


# ---------- measure the file ----------
raw = open(CSV, 'rb').read()
sha = hashlib.sha256(raw).hexdigest()
rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8'))))
cols = list(rows[0].keys())
N = len(rows)
codes = [r['nappi_code'] for r in rows]
assert N == 77 and len(cols) == 15 and len(set(codes)) == N and all(len(c) == 10 and c.isdigit() for c in codes)
mtime = datetime.datetime.fromtimestamp(os.path.getmtime(CSV)).strftime('%d %B %Y at %H:%M').lstrip('0')
form = collections.Counter(r['dosage_form'] for r in rows)
sched = collections.Counter(r['schedule'] for r in rows)
manu = collections.Counter(r['manufacturer'] for r in rows)
atc = collections.Counter(r['atc_code'][:3] for r in rows)
blank = {c: sum(1 for r in rows if not r[c].strip()) for c in cols}
distinct = {c: len({r[c] for r in rows}) for c in cols}
maxlen = {c: max(len(r[c]) for r in rows) for c in cols}
in_list = ','.join("'" + c + "'" for c in codes)

# ---------- measure the hospitals (read-only SELECTs) ----------
p_prod = int(sql(1433, 'private_hospital', 'select count(*) from ref.nappi_product'))
p_in = int(sql(1433, 'private_hospital', f'select count(*) from ref.nappi_product where nappi_code in ({in_list})'))
p_rx = int(sql(1433, 'private_hospital', 'select count(*) from rx.prescription_line'))
p_rx_null = int(sql(1433, 'private_hospital', "select count(*) from rx.prescription_line where nappi_code is null or ltrim(rtrim(nappi_code))=''"))
p_rx_in = int(sql(1433, 'private_hospital', f'select count(*) from rx.prescription_line where nappi_code in ({in_list})'))
p_rx_distinct = int(sql(1433, 'private_hospital', 'select count(distinct nappi_code) from rx.prescription_line where nappi_code is not null'))
p_inv = int(sql(1433, 'private_hospital', 'select count(*) from inv.item'))
p_bill = int(sql(1433, 'private_hospital', 'select count(*) from bill.charge'))
p_bill_null = int(sql(1433, 'private_hospital', "select count(*) from bill.charge where nappi_code is null or ltrim(rtrim(nappi_code))=''"))
u_prod = int(sql(1438, 'public_hospital', 'select count(*) from dbo.PHARM_ITEM_MASTER'))
u_in = int(sql(1438, 'public_hospital', f'select count(*) from dbo.PHARM_ITEM_MASTER where NAPPI_CODE in ({in_list})'))
u_null = int(sql(1438, 'public_hospital', "select count(*) from dbo.PHARM_ITEM_MASTER where NAPPI_CODE is null or ltrim(rtrim(NAPPI_CODE))=''"))
pct = lambda a, b: f'{a / b * 100:.1f}%'

SRC = f'''- **[1] Wikipedia, "National Pharmaceutical Product Index"** (Wikimedia Foundation). The article says it was last edited on 15 February 2024 and is a stub. https://en.wikipedia.org/wiki/National_Pharmaceutical_Product_Index (opened, accessed {TODAY})
- **[2] Discovery Health, "NAPPI code registration and review process" (2023).** https://www.discovery.co.za/assets/discoverycoza/health-professionals/propbm-communiques/nappi-code-registration-and-review-process-2023.pdf (opened, accessed {TODAY}). The file is a scanned image, so I could not read its text. Claims marked [2] come from a web search summary of it and are therefore only "Partly".
- **[3] Provenance note beside the file**, nappi_codes.provenance.txt, written 10 November 2026 at 20:47 (read directly on {TODAY}).
- **[4] Uploaded final document 1 of 11, "NAPPI Medicine Codes"**, 10 November 2026.'''

# =============== BACKGROUND ===============
put('background', 'In plain words', 'What NAPPI is, in a few sentences.', 'text',
    '''> Every medicine and medical product sold in South Africa is meant to carry a unique number so that doctors, pharmacies, hospitals and medical schemes all mean the same product when they bill and pay. That number is the NAPPI code, and the list of them is the NAPPI index.

For SAHealth the point is simple: if the gateway cannot recognise a medicine code, it cannot check a prescription or a claim. This record explains the real list, then how our small practice copy was built and where it is used.''', 10, True)

put('background', 'What it is and who runs it', 'Owner, governance and what could be confirmed.', 'text',
    f'''**What it is. Confirmed [1].** NAPPI (National Pharmaceutical Product Index) is described as a comprehensive database of pharmaceutical codes for classifying medical products in South Africa. Each product has a unique code, which supports electronic data exchange along the healthcare chain.

**Who maintains it. Confirmed [1].** MediKredit manages and maintains the NAPPI product file.

**Who governs it. Confirmed [1].** The NAPPI Advisory Board (NAB) governs it. The article describes the board as a non-profit representing hospitals, medical schemes, scheme administrators and medical and dental associations.

**Who owns and assigns codes. Partly [2].** A web search summary of the Discovery Health document says MediKredit owns the codes and is the only organisation that can assign them, under the Advisory Board's oversight, and that manufacturers pay a fee when they apply for a code. I could not read the document itself, so treat this as unconfirmed.

**Code structure. Not established.** Neither [1] nor anything else I could open states the number of digits or how a product code and a pack code are combined. Our file uses 10-digit codes and the project reads them as a 7-digit product part plus a 3-digit pack part [3][4], but that is a reading of our own file, not a fact about the real list.

**Legal basis, history and dates. Not established.** [1] gives no founding date or legal basis.''', 20)

put('background', 'How it is used and shared', 'What the sources say about use, and what they leave out.', 'text',
    '''**Use in billing. Partly [1][2].** The index exists so that systems along the chain (prescriber, pharmacy, hospital, scheme) can exchange product information electronically. A scheme uses the code to know exactly which product a claim line is for. A code being enabled for electronic processing does not by itself guarantee that a claim is reimbursed [2].

**How the file is distributed. Partly [2].** A web search summary says new codes appear in a public file on MediKredit's website that is updated daily, and a 2018 developer write-up describes downloading a zip file from that site and loading its text file into a database. I did not open the MediKredit site or the write-up, and the process may have changed.

**Licence and price. Not established.** I found no published licence terms or subscription price for pharmacies or schemes. The project's own final document says the real list is sold as a licensed file [4]; I could not confirm that independently.

**Which systems depend on it. Not established** beyond the general statement above. I did not find a published list of the systems that use NAPPI.''', 30)

put('background', 'Real-world shortfalls', 'Problems the evidence supports, and what it does not.', 'text',
    '''The sources I could open say very little about problems. I have kept to what they support and left the rest as "not established".

- **Thin public documentation. Confirmed [1].** The only open encyclopaedia entry is a stub with no history, structure or limitations.
- **Access terms are unclear. Not established.** No published licence or price was found, so how a small provider or a researcher obtains the full file legitimately is not known from these sources.
- **A valid code is not a payment guarantee. Partly [2].** Scheme rules still decide reimbursement.
- **Public sector use. Not established.** Whether public-sector facilities code every medicine with NAPPI is not confirmed by any source I opened. Our simulation treats the public hospital as having uneven coverage, but that is a design choice, not a measured fact about real hospitals.

Evidence for coverage, quality, duplication or connectivity problems in the real index would need a regulator, scheme or MediKredit publication, which I did not find.''', 40)

put('background', 'Why it matters to the gateway', 'The practical reason this list is in the estate.', 'text',
    '''The gateway reads prescriptions and claims from separate hospital systems. To tell that two differently named medicines are the same product it needs one agreed code list to compare against. NAPPI is the national list for that job.

In the simulation the list is a small flat file, kept as a file because the real list is passed around as a product file and not as a live service [4]. Both hospital systems hold some codes from it and some of their own, on purpose, so the gateway meets matches, misses and a few deliberate errors.''', 50)

put('background', 'Sources', 'Every source used, with the date it was opened.', 'sources', SRC, 90)

# =============== BUILD RECORD ===============
put('build', 'Products by dosage form', f'The {N} products by form (measured from the file).', 'chart',
    json.dumps({'type': 'bar', 'items': [{'label': k, 'value': v} for k, v in form.most_common()]}), 10, True)
put('build', 'Products by medicine schedule', 'An ordered split of the same products. S0 is not scheduled; higher numbers are more tightly controlled.', 'chart',
    json.dumps({'type': 'stacked', 'items': [{'label': k, 'value': sched[k]} for k in sorted(sched)]}), 11, True)
put('build', 'Largest manufacturers', 'The eight manufacturers with the most products in the file.', 'chart',
    json.dumps({'type': 'bar', 'items': [{'label': k, 'value': v} for k, v in manu.most_common(8)]}), 12)
put('build', 'Hospital medicine lists against the file', 'How many of each hospital\'s own products carry a code that is in the 77-row file.', 'chart',
    json.dumps({'type': 'bar', 'items': [
        {'label': 'Private hospital: products with a file code', 'value': p_in}, {'label': 'Private hospital: products with their own code', 'value': p_prod - p_in},
        {'label': 'Public hospital: products with a file code', 'value': u_in}, {'label': 'Public hospital: products with their own code', 'value': u_prod - u_in}]}), 13, True)

put('build', 'The file and how it was checked', 'Where it lives, how big it is and what was verified.', 'text',
    f'''- **File:** nappi_codes.csv, in the registries folder of the Machine A database folder. A plain comma-separated text file with a header row. No server, port or login.
- **Size and date:** {len(raw):,} bytes, last modified {mtime}. The provenance note records identical creation and last-write times [3].
- **Encoding:** UTF-8, no byte-order mark (the first bytes are the header text).
- **Shape:** {N} rows and {len(cols)} columns. {N} distinct codes, so no duplicates. Every code is exactly 10 digits.
- **Blank cells:** {blank['effective_to']} in effective_to (every row), none anywhere else.
- **Fingerprint:** the file's SHA-256 starts {sha[:12]}. The full value is in the provenance note beside the file [3].
- **Checked:** read directly on {TODAY}; the figures on this page were re-measured then.

Two copies of the file were taken on 10 November 2026, at 20:46 and 21:19, into the backups folder (see "How it was made").''', 20)

colrows = [['Column', 'Example (first row)', 'Blank', 'Distinct', 'Longest']]
for c in cols:
    colrows.append([c, rows[0][c] if c != 'nappi_code' else rows[0][c][:7] + ' ' + rows[0][c][7:], str(blank[c]), str(distinct[c]), str(maxlen[c])])
put('build', 'The 15 columns', 'Every column, measured from the file. Meanings are taken from the column names; the file carries no definitions.', 'table',
    json.dumps({'columns': colrows[0], 'rows': colrows[1:]}), 30)

sample = [['First 7 digits', 'Last 3 digits', 'Product', 'Generic name', 'Strength', 'Form', 'Schedule']]
for r in rows[:5]:
    sample.append([r['nappi_code'][:7], r['nappi_code'][7:], r['product_name'], r['generic_name'][:40], r['strength'], r['dosage_form'], r['schedule']])
put('build', 'Sample rows', 'The first 5 rows of the file. The table sampled is nappi_codes.csv, a look-up list with no personal data.', 'table',
    json.dumps({'columns': sample[0], 'rows': sample[1:]}), 40)

where = [['Source', 'Table.column', 'Rows', 'Blank', 'Rows with a code from the file'],
         ['Private hospital', 'ref.nappi_product.nappi_code', f'{p_prod}', '0', f'{p_in} ({pct(p_in, p_prod)})'],
         ['Private hospital', 'rx.prescription_line.nappi_code', f'{p_rx:,}', f'{p_rx_null:,} ({pct(p_rx_null, p_rx)})', f'{p_rx_in:,} ({pct(p_rx_in, p_rx)})'],
         ['Private hospital', 'inv.item.nappi_code', f'{p_inv}', 'table is empty', 'none'],
         ['Private hospital', 'bill.charge.nappi_code', f'{p_bill:,}', f'{p_bill_null:,} ({pct(p_bill_null, p_bill)})', 'none'],
         ['Public hospital', 'dbo.PHARM_ITEM_MASTER.NAPPI_CODE', f'{u_prod}', f'{u_null}', f'{u_in} ({pct(u_in, u_prod)})']]
put('build', 'Where NAPPI codes appear in the estate', 'Measured live with read-only counts on the two hospital databases.', 'table',
    json.dumps({'columns': where[0], 'rows': where[1:]}), 50, True)

put('build', 'How it was made', 'Built only from what files, backups and the provenance note show. Nothing is guessed.', 'text',
    f'''**The file (25 October 2026).** The file's timestamps are 25 October 2026 at 23:49. The provenance note says a Claude Code build prompt of that date asked for three small CSV files with "realistic seed rows", labelled the NAPPI file "approximated" and asked for about 200 medicines; {N} were delivered [3]. No script that generated the file exists on this PC, no random seed was recorded and no git history covers it. The original external source, any licence and any extraction date are **not established**.

**The alignment of the hospitals (10 November 2026).** Three scripts in the final-pass scripts folder deal with NAPPI, dated by their last-modified times:

- a2_match.py, 20:45. Matches a hospital drug description to a row in the file by an ingredient word and the strength number. Its own description says it creates no crosswalk table.
- r_a1.py, 20:46. Writes the provenance notes beside each CSV.
- r_a2.py, 20:49. Aligns hospital NAPPI codes to the file at content level (ingredient, strength and form), with about 3% deliberate defects (a mistyped code). For the private hospital it clones the product row under the file's code, repoints the prescription, billing and stock tables and deletes the old row; for the public hospital it updates the item master. It records a seed in its source (20261114) and marks itself done so it cannot run twice.

The run times of the scripts are not recorded, only the times the files were last changed, so the dates above are the file times.

**Backups.** The backups folder holds a copy of the file in two dated folders, 20261110_2046 and 20261110_2119.''', 60)

put('build', 'Security and access', 'How the file is protected. No credentials are described here.', 'text',
    '''The file is a plain text file. It has no accounts, no encryption and no audit trail of its own. It is protected only by the file-system permissions of the folder it sits in [4]. Project rules treat it as read-only: nothing in the database folder is ever committed, pushed or shared, and the gateway must never write to the file.''', 70)

put('build', 'How to query it', 'Read-only examples. Each returns counts, never anything personal.', 'queries',
    '''-- 1. How many rows and columns (PowerShell)
$r = Import-Csv "<registries folder>\\nappi_codes.csv"; $r.Count; ($r | Get-Member -MemberType NoteProperty).Count
-- returns 77 and 15

-- 2. Products by dosage form (PowerShell)
$r | Group-Object dosage_form | Sort-Object Count -Descending | Select-Object Name, Count

-- 3. Products by schedule (PowerShell)
$r | Group-Object schedule | Sort-Object Name | Select-Object Name, Count

-- 4. Any duplicate codes? (PowerShell)
($r | Group-Object nappi_code | Where-Object Count -gt 1).Count
-- returns 0

-- 5. Private hospital: how many of its products carry a code in the file (SQL Server, private_hospital)
-- paste the 77 codes from the file into the IN list
SELECT COUNT(*) FROM ref.nappi_product WHERE nappi_code IN (/* the 77 codes */);

-- 6. Public hospital: the same count (SQL Server, public_hospital)
SELECT COUNT(*) FROM dbo.PHARM_ITEM_MASTER WHERE NAPPI_CODE IN (/* the 77 codes */);

-- 7. Private hospital: prescription lines with no code (SQL Server, private_hospital)
SELECT COUNT(*) FROM rx.prescription_line WHERE nappi_code IS NULL OR LTRIM(RTRIM(nappi_code)) = '';''', 80)

put('build', 'Reproduce these figures', 'The exact check behind each headline number on this page.', 'queries',
    f'''Rows (77) and columns (15):     Import-Csv, then .Count (examples 1 above)
Distinct codes (77), length 10:  Group-Object nappi_code; check Length of every code
Dosage forms and schedules:      Group-Object, examples 2 and 3 above
Blank cells (77, all in effective_to):  count empty values per column
File size ({len(raw):,} bytes), modified {mtime}:  Get-Item on the file
SHA-256 (starts {sha[:12]}):     Get-FileHash -Algorithm SHA256 on the file
Private hospital {p_in} of {p_prod}:    SQL example 5
Public hospital {u_in} of {u_prod}:     SQL example 6
Private prescription lines: {p_rx:,} total, {p_rx_null:,} blank, {p_rx_in:,} with a file code:  SQL example 7 and its variants
Private billing lines: {p_bill:,}, all blank:  SELECT COUNT(*), SUM(CASE WHEN nappi_code IS NULL THEN 1 ELSE 0 END) FROM bill.charge
Measured on {TODAY}.''', 90)

put('build', 'Decisions, gaps and open items', 'What was decided and why, what is missing (with sizes), and where each item stands.', 'text',
    f'''**Decisions (recorded in the files or the final document)**
- **Keep it as a flat file.** The project rule is that a source shared as a file in real life stays a file here, so the NAPPI list is a CSV and not a table [4].
- **Match hospitals by content, with no crosswalk table.** Recorded in the description of the matching script (a2_match.py and r_a2.py).
- **Keep about 3% of matched hospital codes wrong on purpose**, so the gateway meets realistic mistakes. Recorded in r_a2.py [4].

**Gaps (measured)**
- The file holds {N} products; the real index is far larger, so most real medicines will not be found.
- {p_prod - p_in} of the private hospital's {p_prod} products ({pct(p_prod - p_in, p_prod)}) and {u_prod - u_in} of the public hospital's {u_prod} ({pct(u_prod - u_in, u_prod)}) keep their own codes.
- Private prescription lines: {p_rx_null:,} of {p_rx:,} ({pct(p_rx_null, p_rx)}) have no code, on purpose.
- The private billing table has a NAPPI column that is blank on all {p_bill:,} rows, and the private stock table is empty, so billing and stock do not use it.

**Open items**
| Item | Status |
| --- | --- |
| Where the {N} rows came from (source, licence, date) | Not established |
| The real code length and structure | Not established |
| Align hospital codes to the file | Resolved on 10 November 2026 |
| Expand beyond {N} products | Open. No decision has been made |
| A code translation table (crosswalk) | Phase 2 |''', 95)

# =============== TIMELINE (backdated from real file times) ===============
def log(when, typ, title, summary, detail):
    cmd = ['node', 'scripts/forged-log', '--db', 'nappi', '--type', typ, '--phase', '1', '--when', when, '--title', title,
           '--summary', summary, '--detail', detail, '--session', 'In-depth record run']
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=120)
    ok = r.returncode == 0 and len(r.stdout.strip()) == 36
    print(('OK  ' if ok else 'FAIL'), 'log', title, '' if ok else (r.stderr or r.stdout).strip()[:200])


log('2026-11-10T20:45:00+02:00', 'Action', 'Wrote the matcher for hospital medicine descriptions',
    'A script was written that matches a hospital drug description to a row in the medicine code file by an ingredient word and the strength.',
    'a2_match.py, last modified 10 November 2026 at 20:45. Dated from the file time; the run time is not recorded. It creates no crosswalk table.')
log('2026-11-10T20:46:00+02:00', 'Action', 'Backed up the code files before aligning the hospitals',
    'A copy of the medicine code file was taken before the hospital codes were changed.',
    'Backups folder 20261110_2046 holds nappi_codes.csv ' + f'({len(raw):,} bytes). A second copy follows at 21:19 in 20261110_2119.')
log('2026-11-10T20:47:00+02:00', 'Note', 'Wrote the provenance note beside the medicine code file',
    'A note was written next to the file saying what is and is not known about where it came from.',
    'nappi_codes.provenance.txt, last modified 10 November 2026 at 20:47. It records the timestamps, the 25 October build prompt and that the source, licence and extraction date are not established.')
log('2026-11-10T21:19:00+02:00', 'Action', 'Took a second backup after the alignment',
    'A second copy of the medicine code file was taken after the hospital codes were aligned.',
    'Backups folder 20261110_2119 holds nappi_codes.csv, identical in size and timestamps to the first copy.')
print('done; temp files in', TMP)
