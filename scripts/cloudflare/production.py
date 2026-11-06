#!/usr/bin/env python3
"""Explicit FlowLog production operations; never reuses staging resources."""
import hashlib
import json
import os
import secrets
import subprocess
import sys
import time
from pathlib import Path
import staging

ROOT = staging.ROOT
PRIVATE = staging.PRIVATE / 'production'
MANIFEST = PRIVATE / 'resources.json'
CONFIG = PRIVATE / 'wrangler.json'
NAME = 'flowlog-production'
QUEUE = NAME + '-diary'
CANONICAL = 'https://flowlog.jp'
save = staging.save

def resource(c):
    m = json.loads(MANIFEST.read_text())
    conf = json.loads(CONFIG.read_text())
    assert m['account_id'] == c['account_id'] and m['worker'] == NAME and m['bucket'] == NAME
    assert conf['name'] == NAME and conf['main'] == '../../worker/index.ts'
    assert conf['vars']['ENVIRONMENT'] == 'production' and conf['vars']['APP_ORIGIN'] in [m['preview_origin'], CANONICAL]
    assert conf['d1_databases'][0]['database_id'] == m['database_id']
    assert conf['r2_buckets'] == [{'binding': 'IMAGES', 'bucket_name': NAME}]
    assert not conf.get('routes') or conf['routes'] == [{'pattern': 'flowlog.jp', 'custom_domain': True}]
    assert conf.get('queues', {}).get('producers', []) == [{'binding': 'DIARY_QUEUE', 'queue': QUEUE}]
    assert conf['preview_urls'] is False
    return m

def query(c, sql, params=None):
    m = resource(c)
    return staging.api(c, 'd1/database/' + m['database_id'] + '/query', 'POST', {'sql': sql, 'params': params or []})

def provision(c):
    if MANIFEST.exists():
        m = json.loads(MANIFEST.read_text())
        assert m['account_id'] == c['account_id'] and m['worker'] == NAME
    else:
        workers = staging.api(c, 'workers/scripts')
        assert not any(w['id'] == NAME for w in workers), 'Production name exists without a task manifest'
        m = {'account_id': c['account_id'], 'worker': NAME}
        save(MANIFEST, m)
    if 'database_id' not in m:
        existing = staging.api(c, 'd1/database')
        assert not any(d['name'] == NAME for d in existing), 'Unknown production D1 already exists'
        m['database_id'] = staging.api(c, 'd1/database', 'POST', {'name': NAME})['uuid']; save(MANIFEST, m)
    if 'bucket' not in m:
        buckets = staging.api(c, 'r2/buckets').get('buckets', [])
        assert not any(b['name'] == NAME for b in buckets), 'Unknown production bucket already exists'
        staging.api(c, 'r2/buckets', 'POST', {'name': NAME}); m['bucket'] = NAME; save(MANIFEST, m)
    if 'queue_id' not in m:
        queues = staging.api(c, 'queues')
        assert not any(q['queue_name'] == QUEUE for q in queues), 'Unknown production queue already exists'
        q = staging.api(c, 'queues', 'POST', {'queue_name': QUEUE})
        m['queue_id'] = q['queue_id']; save(MANIFEST, m)
    m['preview_origin'] = 'https://' + NAME + '.' + staging.api(c, 'workers/subdomain')['subdomain'] + '.workers.dev'
    m['canonical_origin'] = CANONICAL; save(MANIFEST, m)
    if not CONFIG.exists():
        owner = json.loads((staging.PRIVATE / 'source-snapshot.json').read_text())['owner_id']
        save(CONFIG, {'name': NAME, 'main': '../../worker/index.ts', 'compatibility_date': '2026-10-29', 'compatibility_flags': ['nodejs_compat'],
          'workers_dev': True, 'preview_urls': False,
          'assets': {'directory': '../../dist-production', 'binding': 'ASSETS', 'not_found_handling': 'single-page-application', 'run_worker_first': True},
          'd1_databases': [{'binding': 'DB', 'database_name': NAME, 'database_id': m['database_id'], 'migrations_dir': '../../worker/migrations'}],
          'r2_buckets': [{'binding': 'IMAGES', 'bucket_name': NAME}],
          'queues': {'producers': [{'binding': 'DIARY_QUEUE', 'queue': QUEUE}], 'consumers': [{'queue': QUEUE, 'max_batch_size': 1, 'max_batch_timeout': 1, 'max_retries': 3, 'retry_delay': 30}]},
          'triggers': {'crons': ['* * * * *']},
          'vars': {'ENVIRONMENT': 'production', 'OWNER_ID': owner, 'OWNER_EMAIL': os.environ['FLOWLOG_OWNER_EMAIL'], 'APP_ORIGIN': m['preview_origin'], 'EXTERNAL_WRITES_ENABLED': 'false'},
          'observability': {'enabled': False}})
    resource(c)
    print('Dedicated production D1, private R2 and Queue ready; DNS untouched.')

def migrate(c):
    resource(c)
    query(c, 'CREATE TABLE IF NOT EXISTS flowlog_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL)')
    for path in sorted((ROOT / 'worker/migrations').glob('*.sql')):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        prior = query(c, 'SELECT sha256 FROM flowlog_migrations WHERE name=?', [path.name])[0]['results']
        if prior:
            assert prior[0]['sha256'] == digest, 'Applied production migration changed'
        else:
            query(c, path.read_text())
            query(c, 'INSERT INTO flowlog_migrations(name,sha256)VALUES(?,?)', [path.name, digest])
            print('Production schema:', path.name)

def deploy(c, env):
    resource(c)
    for filename, size in [('auth-secret', 48), ('encryption-key', 32)]:
        p = PRIVATE / filename
        if not p.exists():
            if filename == 'encryption-key':
                import base64
                value = base64.b64encode(secrets.token_bytes(size)).decode()
            else: value = secrets.token_urlsafe(size)
            p.write_text(value); p.chmod(0o600)
    r = subprocess.run([str(ROOT / 'node_modules/.bin/wrangler'), 'deploy', '--config', str(CONFIG)], cwd=ROOT, env=env, capture_output=True, text=True)
    if r.returncode:
        save(PRIVATE / 'deploy-failure.json', {'stdout': r.stdout, 'stderr': r.stderr})
        raise RuntimeError('Production deployment failed; private diagnostics saved')
    values = {'AUTH_SECRET': (PRIVATE / 'auth-secret').read_text(), 'ENCRYPTION_KEY': (PRIVATE / 'encryption-key').read_text()}
    for name, path in [('FIRECRAWL_API_KEY', staging.PRIVATE / 'firecrawl-key'), ('GOOGLE_CLIENT_ID', PRIVATE / 'google-client-id'), ('GOOGLE_CLIENT_SECRET', PRIVATE / 'google-client-secret')]:
        if path.exists(): values[name] = path.read_text().strip()
    r = subprocess.run([str(ROOT / 'node_modules/.bin/wrangler'), 'secret', 'bulk', '--config', str(CONFIG)], input=json.dumps(values), cwd=ROOT, env=env, capture_output=True, text=True)
    if r.returncode: raise RuntimeError('Production secret upload failed')
    print('Production Worker deployed with dedicated secrets; no DNS action was requested by this command.')

def bind_domain(c):
    resource(c)
    config=json.loads(CONFIG.read_text())
    assert config['vars']['APP_ORIGIN']==CANONICAL
    for evidence in ['production-row-verification.json','production-image-verification.json','production-generation-policy.json','production-api-read-verification.json']:
        assert (staging.PRIVATE/'cutover'/evidence).exists(),evidence
    url='https://api.cloudflare.com/client/v4/zones?name=flowlog.jp&account.id='+c['account_id']
    import urllib.request
    with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+c['api_token']}),timeout=30) as response:zones=json.load(response)['result']
    assert len(zones)==1 and zones[0]['status']=='active' and zones[0]['account']['id']==c['account_id']
    existing=staging.api(c,'workers/domains')
    target=[r for r in existing if r['hostname']=='flowlog.jp']
    assert not target or all(r['service']==NAME for r in target),'Domain belongs to a different Worker'
    result=staging.api(c,'workers/domains','PUT',{'hostname':'flowlog.jp','service':NAME,'zone_id':zones[0]['id'],'enabled':True,'previews_enabled':False})
    assert result['hostname']=='flowlog.jp' and result['service']==NAME and result['enabled']
    save(PRIVATE/'custom-domain.json',result)
    print('flowlog.jp now routes to the dedicated production Worker. TLS and public readback must still be verified.')

if __name__ == '__main__':
    c, env = staging.credentials()
    action = sys.argv[1]
    if action == 'provision': provision(c)
    elif action == 'migrate': migrate(c)
    elif action == 'deploy': deploy(c, env)
    elif action == 'bind-domain': bind_domain(c)
    else: raise RuntimeError('Choose provision, migrate or deploy')
