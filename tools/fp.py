"""Shared helpers for filling Forged records. Read-only on C:\\Database. Writes only through forged-content / forged-log."""
import csv, collections, datetime, hashlib, io, json, os, sqlite3, subprocess, tempfile

# Locations and connection details come from the environment, never from this file.
REPO = os.environ.get('FORGED_REPO', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_HOST = os.environ.get('SAH_DB_HOST', 'localhost')
PG_USER = os.environ.get('SAH_PG_USER', 'postgres')
TMP = tempfile.mkdtemp(prefix='fp_')
TODAY = datetime.date.today().strftime('%d %B %Y').lstrip('0')
pct = lambda a, b: f'{a / b * 100:.1f}%' if b else 'n/a'
fmt = lambda n: f'{int(n):,}'


# ---------- read-only measurement ----------
def mssql_rows(port, db, q, sep='\x1f'):
    r = subprocess.run(['sqlcmd', '-S', f'{DB_HOST},{port}', '-d', db, '-E', '-C', '-W', '-h', '-1', '-s', sep, '-Q', 'set nocount on; ' + q],
                       capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise SystemExit('sql failed: ' + (r.stdout or r.stderr)[:200])
    return [l.split(sep) for l in r.stdout.splitlines() if l.strip() and not l.startswith('Msg ')]


def mssql_one(port, db, q):
    return mssql_rows(port, db, q)[0][0]


def pg_rows(port, db, q):
    env = dict(os.environ, PGCONNECT_TIMEOUT='10')
    r = subprocess.run(['psql', '-h', DB_HOST, '-p', str(port), '-U', PG_USER, '-d', db, '-w', '-t', '-A', '-F', '\x1f', '-c', q],
                       capture_output=True, text=True, timeout=300, env=env)
    if r.returncode != 0:
        raise SystemExit('pg failed: ' + r.stderr[:200])
    return [l.split('\x1f') for l in r.stdout.splitlines() if l.strip()]


def lite(path):
    c = sqlite3.connect('file:' + path.replace('\\', '/') + '?mode=ro', uri=True)
    c.row_factory = sqlite3.Row
    return c


def csv_rows(path):
    raw = open(path, 'rb').read()
    return raw, list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))


def file_facts(path):
    raw = open(path, 'rb').read()
    return dict(bytes=len(raw), sha=hashlib.sha256(raw).hexdigest(), bom=raw[:3] == b'\xef\xbb\xbf',
                mtime=datetime.datetime.fromtimestamp(os.path.getmtime(path)).strftime('%d %B %Y at %H:%M').lstrip('0'))


def list_files(folder, pattern_words, limit=40):
    """Names, sizes and dates only, of files whose name contains any word."""
    out = []
    for dp, _, fns in os.walk(folder):
        for fn in fns:
            if any(w in fn.lower() for w in pattern_words):
                p = os.path.join(dp, fn)
                out.append((os.path.relpath(p, 'C:/Database'), os.path.getsize(p), datetime.datetime.fromtimestamp(os.path.getmtime(p))))
    return sorted(out, key=lambda x: x[2])[:limit]


# ---------- writing to Forged ----------
def put(db, area, title, summary, kind, body, position, opened=False):
    f = os.path.join(TMP, f'{abs(hash((db, area, title)))}.txt')
    open(f, 'w', encoding='utf-8').write(body)
    cmd = ['node', 'scripts/forged-content', '--db', db, '--area', area, '--title', title, '--summary', summary, '--kind', kind, '--body-file', f, '--position', str(position)]
    if opened:
        cmd.append('--open')
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=180)
    ok = r.returncode == 0 and len(r.stdout.strip()) == 36
    print(('OK  ' if ok else 'FAIL'), db, area, position, title, '' if ok else (r.stderr or r.stdout).strip()[:220])
    return ok


def log(db, when, typ, title, summary, detail, status=None, parent=None, resolve=False):
    cmd = ['node', 'scripts/forged-log', '--db', db, '--type', typ, '--phase', '1', '--when', when, '--title', title, '--summary', summary, '--detail', detail, '--session', 'In-depth record run']
    if status:
        cmd += ['--status', status]
    if parent:
        cmd += ['--parent', parent]
    if resolve:
        cmd.append('--resolve')
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=180)
    out = r.stdout.strip()
    ok = r.returncode == 0 and len(out) == 36
    print(('OK  ' if ok else 'FAIL'), 'log', title, '' if ok else (r.stderr or out).strip()[:220])
    return out if ok else None


def table(columns, rows):
    return json.dumps({'columns': columns, 'rows': [[str(c) for c in r] for r in rows]})


def chart(kind, items, unit=''):
    return json.dumps({'type': kind, 'unit': unit, 'items': items})


def bars(counter, n=None):
    return chart('bar', [{'label': str(k), 'value': v} for k, v in counter.most_common(n)])


# ---------- generic schema profile sections (SQL Server) ----------
def mssql_profile(db_slug, port, db, short, folder_words, start_pos=20, columns_in_full=True):
    v = mssql_one(port, db, 'select left(replace(@@version, char(10), " "), 140)'.replace('"', "'"))
    coll = mssql_one(port, db, f"select cast(DATABASEPROPERTYEX('{db}','Collation') as varchar(60))")
    files = mssql_rows(port, db, 'select name, type_desc, cast(size*8.0/1024 as decimal(12,1)), physical_name from sys.database_files')
    cnt = {k: mssql_one(port, db, q) for k, q in dict(
        tables="select count(*) from sys.tables", views="select count(*) from sys.views", procs="select count(*) from sys.procedures",
        triggers="select count(*) from sys.triggers", fks="select count(*) from sys.foreign_keys", indexes="select count(*) from sys.indexes where object_id in (select object_id from sys.tables) and index_id>0",
        schemas="select count(*) from sys.schemas s where exists (select 1 from sys.tables t where t.schema_id=s.schema_id)",
        columns="select count(*) from sys.columns c join sys.tables t on t.object_id=c.object_id",
        rows="select cast(sum(p.rows) as bigint) from sys.partitions p join sys.tables t on t.object_id=p.object_id where p.index_id in (0,1)",
        pks="select count(*) from sys.key_constraints where type='PK'", nokey="select count(*) from sys.tables t where not exists (select 1 from sys.indexes i where i.object_id=t.object_id and i.is_primary_key=1)",
        empty="select count(*) from sys.tables t where (select coalesce(sum(p.rows),0) from sys.partitions p where p.object_id=t.object_id and p.index_id in (0,1))=0",
        unenforced="select count(*) from sys.foreign_keys where is_not_trusted=1").items()}
    tabs = mssql_rows(port, db, """select s.name+'.'+t.name, cast(coalesce(sum(p.rows),0) as bigint),
        (select count(*) from sys.columns c where c.object_id=t.object_id),
        case when exists (select 1 from sys.indexes i where i.object_id=t.object_id and i.is_primary_key=1) then 'Yes' else 'No' end,
        (select count(*) from sys.foreign_keys f where f.parent_object_id=t.object_id)
        from sys.tables t join sys.schemas s on s.schema_id=t.schema_id left join sys.partitions p on p.object_id=t.object_id and p.index_id in (0,1)
        group by s.name, t.name, t.object_id order by 2 desc, 1""")
    put(db_slug, 'build', 'Engine and files', f'The engine, collation, size and files of {short}.', 'text',
        f'''- **Engine:** {v.split("(")[0].strip()}
- **Database:** {db}, on localhost port {port}. Windows authentication was used for these read-only measurements; no credentials are described here.
- **Collation:** {coll}
- **Objects:** {cnt['tables']} tables in {cnt['schemas']} schemas, {cnt['views']} views, {cnt['procs']} stored procedures, {cnt['triggers']} triggers, {cnt['indexes']} indexes.
- **Size:** {fmt(cnt['columns'])} columns and about {fmt(cnt['rows'] or 0)} rows in total. {cnt['empty']} tables are empty.
- **Keys:** {cnt['pks']} primary keys; {cnt['nokey']} tables have no primary key. {cnt['fks']} foreign keys are declared ({cnt['unenforced']} not trusted).
- **Files:** ''' + '; '.join(f"{n} ({t.replace('_', ' ').lower()}, {s} MB)" for n, t, s, _ in files) + f'''.
- **Measured:** {TODAY}, read-only.''', start_pos, True)
    put(db_slug, 'build', 'Tables and row counts', f'All {cnt["tables"]} tables with rows, columns and keys. Search to find one.', 'table',
        table(['Table', 'Rows', 'Columns', 'Primary key', 'Foreign keys out'], [[r[0], fmt(r[1]), r[2], r[3], r[4]] for r in tabs]), start_pos + 1)
    if columns_in_full:
        cols = mssql_rows(port, db, """select s.name+'.'+t.name, c.name, ty.name+case when ty.name in ('varchar','nvarchar','char','nchar') then '('+case when c.max_length=-1 then 'max' else cast(case when ty.name like 'n%' then c.max_length/2 else c.max_length end as varchar) end+')' else '' end,
            case when c.is_nullable=1 then 'Yes' else 'No' end,
            case when exists (select 1 from sys.index_columns ic join sys.indexes i on i.object_id=ic.object_id and i.index_id=ic.index_id where i.is_primary_key=1 and ic.object_id=c.object_id and ic.column_id=c.column_id) then 'PK' else '' end
            from sys.columns c join sys.tables t on t.object_id=c.object_id join sys.schemas s on s.schema_id=t.schema_id join sys.types ty on ty.user_type_id=c.user_type_id order by 1, c.column_id""")
        if len(cols) <= 3000:
            put(db_slug, 'build', 'Columns', f'Every column ({len(cols):,}) with type, whether it can be empty, and primary keys. Meanings are taken from names; the database carries no definitions.', 'table',
                table(['Table', 'Column', 'Type', 'Nullable', 'Key'], cols), start_pos + 2)
    fks = mssql_rows(port, db, """select ps.name+'.'+pt.name, pc.name, rs.name+'.'+rt.name, rc.name, case when f.is_not_trusted=1 then 'not trusted' else 'enforced' end
        from sys.foreign_key_columns fkc join sys.foreign_keys f on f.object_id=fkc.constraint_object_id
        join sys.tables pt on pt.object_id=fkc.parent_object_id join sys.schemas ps on ps.schema_id=pt.schema_id join sys.columns pc on pc.object_id=pt.object_id and pc.column_id=fkc.parent_column_id
        join sys.tables rt on rt.object_id=fkc.referenced_object_id join sys.schemas rs on rs.schema_id=rt.schema_id join sys.columns rc on rc.object_id=rt.object_id and rc.column_id=fkc.referenced_column_id order by 1,2""")
    if fks:
        put(db_slug, 'build', 'Declared relationships', f'The {len(fks):,} foreign-key columns the database enforces or declares.', 'table',
            table(['From table', 'Column', 'To table', 'Column', 'State'], fks[:3000]), start_pos + 3)
    else:
        put(db_slug, 'build', 'Declared relationships', 'None declared.', 'text', f'{db} declares no foreign keys, so every relationship between its tables is implied by column names only.', start_pos + 3)
    sec = mssql_rows(port, db, "select 'users/roles', cast(count(*) as varchar) from sys.database_principals where type in ('S','U','R') and is_fixed_role=0 and name not in ('public','guest','INFORMATION_SCHEMA','sys','dbo')")
    masked = mssql_one(port, db, "select count(*) from sys.masked_columns")
    enc = mssql_one(port, db, f"select cast(is_encrypted as varchar) from sys.databases where name='{db}'")
    return dict(cnt=cnt, tabs=tabs, files=files, security=(sec[0][1], masked, enc))


def standard_closing(db_slug, short, files_words, security, extra_how, extra_how_text):
    pass
