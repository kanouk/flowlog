#!/usr/bin/env python3
"""Account-guarded operations restricted to FlowLog staging. Never touches DNS.

Credentials and copied records remain in ignored .migration-backups/. No secret
is accepted on the command line or printed. Reuses the existing account guard.
"""
import concurrent.futures
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PRIVATE = ROOT / '.migration-backups'
MANIFEST = PRIVATE / 'staging-resources.json'
CONFIG = PRIVATE / 'wrangler.staging.json'
NAME = 'flowlog-staging'

def credentials():
    branch=subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip()
    if not branch.startswith('codex/flowlog-cloudflare-'):
        raise RuntimeError('Cloudflare staging operations require the isolated codex/flowlog-cloudflare-* branch')
    path = Path(os.environ.get('FLOWLOG_CF_GUARD', str(Path.home() / 'Documents/ChatGPT/kanouk.com/scripts/cloudflare/run_wrangler_kanouk.py')))
    spec = importlib.util.spec_from_file_location('existing_guard', path)
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    credential = guard.load_credential()
    env = guard.child_environment(credential)
    guard.preflight(credential, env)
    return credential, env

def save(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    path.chmod(0o600)

def api(credential, path, method='GET', body=None, raw=None, headers=None):
    request = urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/' + credential['account_id'] + '/' + path,
        method=method, data=raw if raw is not None else json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': 'Bearer ' + credential['api_token'], 'Content-Type': 'application/json', **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        result = json.loads(error.read())
        raise RuntimeError('Cloudflare request failed: ' + str(error.code) + ' ' + json.dumps(result.get('errors', []))) from None
    if not result.get('success'): raise RuntimeError('Cloudflare operation rejected')
    return result['result']

def provision(credential):
    if MANIFEST.exists():
        m = json.loads(MANIFEST.read_text())
        assert m['account_id'] == credential['account_id'] and m['worker'] == NAME
    else:
        workers = api(credential, 'workers/scripts')
        if any(w['id'] == NAME for w in workers): raise RuntimeError('Staging name already exists without this local manifest')
        m = {'account_id': credential['account_id'], 'worker': NAME}
        save(MANIFEST, m)
    if 'database_id' not in m:
        d = api(credential, 'd1/database', 'POST', {'name': NAME})
        m['database_id'] = d['uuid']; save(MANIFEST, m)
    if 'bucket' not in m:
        api(credential, 'r2/buckets', 'POST', {'name': NAME})
        m['bucket'] = NAME; save(MANIFEST, m)
    subdomain = api(credential, 'workers/subdomain')['subdomain']
    m['origin'] = 'https://' + NAME + '.' + subdomain + '.workers.dev'
    save(MANIFEST, m)
    owner = json.loads((PRIVATE / 'source-snapshot.json').read_text())['owner_id']
    config = {'name': NAME, 'main': '../worker/index.ts', 'compatibility_date': '2026-10-29',
        'compatibility_flags': ['nodejs_compat'], 'workers_dev': True, 'preview_urls': False,
        'assets': {'directory': '../dist-staging', 'binding': 'ASSETS', 'not_found_handling': 'single-page-application', 'run_worker_first': True},
        'd1_databases': [{'binding': 'DB', 'database_name': NAME, 'database_id': m['database_id'], 'migrations_dir': '../worker/migrations'}],
        'r2_buckets': [{'binding': 'IMAGES', 'bucket_name': NAME}],
        'vars': {'ENVIRONMENT': 'staging', 'OWNER_ID': owner, 'OWNER_EMAIL': os.environ['FLOWLOG_OWNER_EMAIL'], 'APP_ORIGIN': m['origin']},
        'observability': {'enabled': False}}
    save(CONFIG, config)
    print('Created/verified dedicated staging D1 and private R2. DNS untouched.')

def resource(credential):
    m = json.loads(MANIFEST.read_text())
    assert m['account_id'] == credential['account_id'] and m['worker'] == NAME and m['bucket'] == NAME
    config = json.loads(CONFIG.read_text())
    assert config['vars']['ENVIRONMENT']=='staging' and config['vars']['APP_ORIGIN']==m['origin']
    assert config['vars'].get('PUBLIC_IMAGE_DELIVERY')!='true'
    assert config['name'] == NAME and config['preview_urls'] is False and config['workers_dev'] is True
    assert not config.get('routes')
    assert config.get('triggers',{}).get('crons',[]) in ([],['* * * * *'])
    assert config['main']=='../worker/index.ts'
    for producer in config.get('queues',{}).get('producers',[]):
        assert producer['binding']=='DIARY_QUEUE' and producer['queue']=='flowlog-staging-diary'
    for consumer in config.get('queues',{}).get('consumers',[]):
        assert consumer['queue']=='flowlog-staging-diary'
    assert config['d1_databases'][0]['database_id'] == m['database_id']
    assert config['r2_buckets'][0]['bucket_name'] == NAME
    return m

def query(credential, sql, params=None):
    m = resource(credential)
    return api(credential, 'd1/database/' + m['database_id'] + '/query', 'POST', {'sql': sql, 'params': params or []})

def migrate(credential):
    resource(credential)
    exists = query(credential, "SELECT name FROM sqlite_master WHERE type='table' AND name='auth_user'")[0]['results']
    if exists:
        print('Staging schema already present; left unchanged.'); return
    query(credential, (ROOT / 'worker/migrations/0001_staging.sql').read_text())
    print('Staging schema created.')

def migrate_functions(credential):
    resource(credential)
    query(credential,'CREATE TABLE IF NOT EXISTS flowlog_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL)')
    for path in sorted((ROOT/'worker/migrations').glob('*.sql')):
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        previous=query(credential,'SELECT sha256 FROM flowlog_migrations WHERE name=?',[path.name])[0]['results']
        if previous:
            if previous[0]['sha256']!=digest:raise RuntimeError('Applied staging migration changed: '+path.name)
            continue
        if path.name!='0001_staging.sql':query(credential,path.read_text())
        query(credential,'INSERT INTO flowlog_migrations(name,sha256)VALUES(?,?)',[path.name,digest])
        print('Staging migration recorded:',path.name)

def configure_functions(credential):
    m=resource(credential)
    if not m.get('diary_queue_id'):raise RuntimeError('Dedicated diary queue missing from manifest')
    queues=api(credential,'queues')
    if not any(q.get('queue_id')==m['diary_queue_id'] and q.get('queue_name')=='flowlog-staging-diary' for q in queues):raise RuntimeError('Dedicated queue identity mismatch')
    config=json.loads(CONFIG.read_text())
    config['queues']={'producers':[{'binding':'DIARY_QUEUE','queue':'flowlog-staging-diary'}],'consumers':[{'queue':'flowlog-staging-diary','max_batch_size':1,'max_batch_timeout':1,'max_retries':3,'retry_delay':30}]}
    config['triggers']={'crons':['* * * * *']}
    config['vars']['EXTERNAL_WRITES_ENABLED']='false'
    save(CONFIG,config)
    resource(credential)
    print('Dedicated staging Queue and recovery Cron configured. No DNS or production routes.')

def import_secrets(credential):
    resource(credential)
    data=json.loads((PRIVATE/'staging-secret-copy.json').read_text())
    owner=json.loads(CONFIG.read_text())['vars']['OWNER_ID']
    for table,rows in [('user_ai_api_keys',data['keys']),('user_external_tokens',data['external'])]:
        for row in rows:
            if row['user_id']!=owner:raise RuntimeError('Credential owner mismatch')
            fields=list(row)
            query(credential,'INSERT OR IGNORE INTO '+table+'('+','.join(fields)+')VALUES('+','.join('?' for _ in fields)+')',[int(row[f]) if isinstance(row[f],bool) else row[f] for f in fields])
        print('Encrypted staging rows imported:',table,len(rows))
    for row in data['models']:
        query(credential,'UPDATE user_ai_models SET api_key_id=? WHERE id=? AND user_id=? AND api_key_id IS NULL',[row.get('api_key_id'),row['id'],owner])
    if data.get('settings'):
        row=data['settings'];fields=['openai_api_key','anthropic_api_key','google_api_key','auto_ocr']
        query(credential,'UPDATE user_ai_settings SET '+','.join(f+'=?' for f in fields)+' WHERE user_id=?',[int(row[f]) if isinstance(row.get(f),bool) else row.get(f) for f in fields]+[owner])
    # All migrated images use private R2. Keep the Gyazo token for the optional
    # provider, but do not activate external writes during the rehearsal.
    if data.get('image'):
        row=data['image']
        query(credential,"INSERT OR IGNORE INTO user_image_storage_settings(id,user_id,provider,gyazo_token,created_at,updated_at)VALUES(?,?,'default',?,?,?)",[row['id'],owner,row.get('gyazo_token'),row['created_at'],row['updated_at']])
    print('Restored model/key relations; original API tokens and sessions were not imported.')

def owner_setup(credential):
    m = resource(credential); config = json.loads(CONFIG.read_text())
    owner = config['vars']['OWNER_ID']; now = int(time.time() * 1000)
    query(credential, 'INSERT OR IGNORE INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)', [owner, 'FlowLog owner', config['vars']['OWNER_EMAIL'], now, now])
    token = secrets.token_urlsafe(32)
    query(credential, 'INSERT INTO auth_verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?)', [secrets.token_hex(16), 'reset-password:' + token, owner, now + 24*60*60*1000, now, now])
    setup = {'url': m['origin'] + '/auth#reset=' + token, 'expires_at_ms': now + 24*60*60*1000}
    save(PRIVATE / 'owner-setup.json', setup)
    (PRIVATE / 'owner-setup.html').write_text('<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>FlowLog 検証環境</title><p>本人用・24時間有効。初回パスワードを設定してください。</p><a href="' + setup['url'] + '">FlowLog検証環境のパスワードを設定する</a>')
    (PRIVATE / 'owner-setup.html').chmod(0o600)
    print('One-time owner setup link saved privately. No email sent.')

def download_images():
    snapshot = json.loads((PRIVATE / 'source-snapshot.json').read_text()); owner = snapshot['owner_id']
    urls = sorted({u for b in snapshot['blocks'] for u in (b.get('images') or [])})
    out = PRIVATE / 'images';out.mkdir(mode=0o700, exist_ok=True)
    allowed = {urllib.parse.urlsplit(u).hostname for u in urls if '.supabase.co/' in u or u.startswith('https://i.gyazo.com/')}
    def fetch(url):
        parts = urllib.parse.urlsplit(url)
        if parts.scheme != 'https' or parts.hostname not in allowed: raise RuntimeError('Unapproved image source')
        marker = hashlib.sha256(url.encode()).hexdigest(); f = out / marker
        meta = out / (marker + '.json')
        if f.exists() and meta.exists(): return json.loads(meta.read_text())
        request = urllib.request.Request(url, headers={'User-Agent': 'FlowLog-staging-migration/1.0'})
        with urllib.request.urlopen(request, timeout=90) as response:
            if urllib.parse.urlsplit(response.url).hostname not in allowed: raise RuntimeError('Image redirected outside source hosts')
            mime = response.headers.get_content_type(); data = response.read(25 * 1024 * 1024 + 1)
        if len(data) > 25*1024*1024 or not mime.startswith('image/') or mime == 'image/svg+xml': raise RuntimeError('Unsupported image bytes')
        sha = hashlib.sha256(data).hexdigest();ext = {'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/avif':'avif'}.get(mime,'img')
        row = {'old_url':url,'object_key':owner+'/'+sha+'.'+ext,'sha256':sha,'mime':mime,'size':len(data),'file':marker}
        f.write_bytes(data);f.chmod(0o600);save(meta,row);return row
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: rows = list(pool.map(fetch,urls))
    save(PRIVATE/'image-manifest.json',rows)
    print('Downloaded images:',len(rows),'bytes:',sum(r['size'] for r in rows))

def import_copy(credential):
    m = resource(credential)
    snapshot = json.loads((PRIVATE/'source-snapshot.json').read_text())
    manifest = json.loads((PRIVATE/'image-manifest.json').read_text())
    if not {r['category'] for r in snapshot['blocks']} <= {'event','task','schedule','thought','read_later'}:
        raise RuntimeError('Unrecognized source category; preserve the source and update staging schema before importing')
    urls = {r['old_url']:m['origin']+'/media/block-images/'+r['object_key'] for r in manifest}
    def upload(row):
        raw=(PRIVATE/'images'/row['file']).read_bytes()
        assert hashlib.sha256(raw).hexdigest()==row['sha256']
        path='https://api.cloudflare.com/client/v4/accounts/'+credential['account_id']+'/r2/buckets/'+NAME+'/objects/'+urllib.parse.quote(row['object_key'],safe='/')
        request=urllib.request.Request(path,method='PUT',data=raw,headers={'Authorization':'Bearer '+credential['api_token'],'Content-Type':row['mime']})
        with urllib.request.urlopen(request,timeout=120) as response:
            if response.status not in (200,201):raise RuntimeError('Private staging R2 upload failed')
        return row
    # Uploaded keys are content-addressed. Repeating an import never touches originals.
    copied=query(credential,'SELECT count(*) AS n FROM image_manifest')[0]['results'][0]['n']
    if copied!=len(manifest):
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for i,_ in enumerate(pool.map(upload,manifest),1):
                if i%50==0:print('Staging images copied:',i,flush=True)
    for start in range(0,len(manifest),20):
        chunk=manifest[start:start+20]
        query(credential,'INSERT OR REPLACE INTO image_manifest(old_url,object_key,sha256,mime,size) VALUES '+','.join('(?,?,?,?,?)' for _ in chunk),[row[k] for row in chunk for k in ['old_url','object_key','sha256','mime','size']])
    for table in ['profiles','entries','blocks','custom_tags','user_ai_settings','user_ai_models','user_ai_feature_settings']:
        existing={}
        cursor=''
        while True:
            page=query(credential,'SELECT * FROM '+table+' WHERE id>? ORDER BY id LIMIT 100',[cursor])[0]['results']
            for row in page:existing[row['id']]=row
            if len(page)<100:break
            cursor=page[-1]['id']
        rows=snapshot[table]
        step=max(1,100//len(rows[0])) if rows else 1
        def insert_chunk(start):
            chunk=[]
            for source in rows[start:start+step]:
                row=dict(source)
                if table=='blocks':row['images']=[urls[u] for u in (row.get('images') or [])]
                if table=='entries' and row.get('formatted_content'):
                    for old,new in urls.items():row['formatted_content']=row['formatted_content'].replace(old,new)
                if table=='user_ai_models':row['api_key_id']=None
                if table=='user_ai_settings':row.update(auto_ocr=False)
                if row['id'] in existing:
                    for key,value in row.items():
                        converted=json.dumps(value,ensure_ascii=False,separators=(',',':')) if isinstance(value,(list,dict)) else int(value) if isinstance(value,bool) else value
                        if existing[row['id']].get(key)!=converted:raise RuntimeError('Existing staging copy differs; refusing to overwrite '+table)
                    continue
                chunk.append(row)
            if not chunk:return
            fields=list(chunk[0]);params=[]
            for row in chunk:
                for key in fields:
                    value=row.get(key)
                    params.append(json.dumps(value,ensure_ascii=False,separators=(',',':')) if isinstance(value,(list,dict)) else int(value) if isinstance(value,bool) else value)
            sql='INSERT INTO '+table+' ('+','.join(fields)+') VALUES '+','.join('('+','.join('?' for _ in fields)+')' for _ in chunk)
            query(credential,sql,params)
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            list(pool.map(insert_chunk,range(0,len(rows),step)))
        print('Imported staging',table,len(rows),flush=True)
    print('No production credentials, sessions or API tokens imported.')

def main():
    global credentials_env
    os.umask(0o077)
    credential,credentials_env=credentials()
    action=sys.argv[1] if len(sys.argv)>1 else ''
    if action=='provision':provision(credential)
    elif action=='migrate':migrate(credential)
    elif action=='migrate-functions':migrate_functions(credential)
    elif action=='configure-functions':configure_functions(credential)
    elif action=='import-secrets':import_secrets(credential)
    elif action=='owner-setup':owner_setup(credential)
    elif action=='download-images':download_images()
    elif action=='import-copy':import_copy(credential)
    elif action=='deploy':
        resource(credential)
        secret=PRIVATE/'auth-secret'
        if not secret.exists():secret.write_text(secrets.token_urlsafe(48));secret.chmod(0o600)
        base=[str(ROOT/'node_modules/.bin/wrangler')]
        # Initial empty deployment is gated by auth with no seeded user.
        result=subprocess.run(base+['deploy','--config',str(CONFIG)],env=credentials_env,capture_output=True,text=True)
        if result.returncode:raise RuntimeError('Staging deploy failed; inspect a local dry-run without printing bindings')
        result=subprocess.run(base+['secret','put','AUTH_SECRET','--config',str(CONFIG)],input=secret.read_text(),env=credentials_env,capture_output=True,text=True)
        if result.returncode:raise RuntimeError('Staging auth secret upload failed')
        for name,path in [('ENCRYPTION_KEY',PRIVATE/'encryption-key'),('FIRECRAWL_API_KEY',PRIVATE/'firecrawl-key'),('GOOGLE_CLIENT_ID',PRIVATE/'google-client-id'),('GOOGLE_CLIENT_SECRET',PRIVATE/'google-client-secret')]:
            if path.exists():
                result=subprocess.run(base+['secret','put',name,'--config',str(CONFIG)],input=path.read_text().strip(),env=credentials_env,capture_output=True,text=True)
                if result.returncode:raise RuntimeError('Staging secret upload failed: '+name)
        print('Staging deployment and secrets configured. No route or DNS changes.')
    else:raise RuntimeError('Allowed actions: provision, migrate, deploy, owner-setup, download-images, import-copy')

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('Staging action stopped:',str(error),file=sys.stderr);sys.exit(1)
