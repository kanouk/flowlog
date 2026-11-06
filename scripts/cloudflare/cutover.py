#!/usr/bin/env python3
"""Resumable production copy. Source snapshots/backups stay private; no DNS here."""
import concurrent.futures
import copy
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime,timedelta
import urllib.parse
import urllib.request
import staging
import production

ROOT=staging.ROOT
PRIVATE=staging.PRIVATE/'cutover'
TABLES=['profiles','entries','blocks','custom_tags','user_ai_settings','user_ai_api_keys','user_ai_models','user_ai_feature_settings','user_external_tokens','user_image_storage_settings','user_api_tokens','event_api_receipts']
POLICY=['diary_generation_control','diary_generation_protected_dates','diary_generation_new_blocks','diary_generation_new_dates','diary_generation_history','diary_entry_versions','diary_generation_attempts','diary_generation_jobs','diary_generation_outbox']
JSON_FIELDS={'images','url_metadata','score_details','behavior_rules','request','response','allowed_dates'}
BOOL_FIELDS={'is_done','is_all_day','due_all_day','score_enabled','auto_ocr','is_active','enabled'}
save=staging.save

def snapshot_stage(c,filename='staging-latest.json'):
    staging.resource(c)
    result={}
    for table in TABLES+POLICY+['image_manifest']:
        result[table]=[];offset=0
        while True:
            rows=staging.query(c,'SELECT * FROM '+table+' ORDER BY '+('user_id,key' if table=='event_api_receipts' else 'rowid')+' LIMIT 50 OFFSET ?',[offset])[0]['results']
            result[table].extend(rows)
            if len(rows)<50:break
            offset+=len(rows)
        print('Captured staging:',table,len(result[table]),flush=True)
    save(PRIVATE/filename,result)

def freeze_stage(c):
    staging.resource(c)
    path=PRIVATE/'staging-control-before-freeze.json'
    if not path.exists():save(path,staging.query(c,'SELECT * FROM diary_generation_control')[0]['results'])
    statements=['UPDATE diary_generation_control SET enabled=0 WHERE singleton=1;']
    for table in TABLES:
        for op in ['INSERT','UPDATE','DELETE']:
            statements.append("CREATE TRIGGER IF NOT EXISTS migration_readonly_"+table+'_'+op.lower()+' BEFORE '+op+' ON '+table+" BEGIN SELECT RAISE(ABORT,'FlowLog migration: staging is read-only'); END;")
    staging.query(c,'\n'.join(statements))
    assert staging.query(c,"SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'migration_readonly_%'")[0]['results'][0]['n']==len(TABLES)*3
    print('Staging writes and generation stopped; reversible database gates installed.')

def pg_snapshot(database):
    assert database in ['rehearsal','final']
    def pg(sql):
        return subprocess.check_output(['docker','exec','flowlog-restore-20261029','psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-Atc',sql],text=True)
    owner=json.loads((staging.PRIVATE/'source-snapshot.json').read_text())['owner_id']
    owner_email=json.loads(staging.CONFIG.read_text())['vars']['OWNER_EMAIL'].replace("'", "''")
    assert pg("SELECT id FROM auth.users WHERE email='"+owner_email+"'").strip()==owner
    result={'owner_id':owner,'restored_database':database}
    for table in TABLES:
        result[table]=json.loads(pg("SELECT COALESCE(json_agg(t),'[]'::json) FROM (SELECT * FROM public."+table+" WHERE user_id='"+owner+"' ORDER BY "+('key' if table=='event_api_receipts' else 'id')+") t"))
    result['all_account_counts']=json.loads(pg("SELECT json_build_object('auth_users',(SELECT count(*) FROM auth.users),'entries',(SELECT count(*) FROM public.entries),'blocks',(SELECT count(*) FROM public.blocks),'storage_objects',(SELECT count(*) FROM storage.objects))"))
    save(PRIVATE/(database+'-source.json'),result)
    print('Restored owner snapshot saved privately:',{t:len(result[t]) for t in TABLES})

def crypto_file(operation,src,dst,key):
    subprocess.run(['node',str(ROOT/'scripts/cloudflare/cutover-crypto.mjs'),operation,str(src),str(dst),str(key)],check=True)

def normalize_row(row,reverse):
    row=copy.deepcopy(row)
    for k,v in list(row.items()):
        if k in JSON_FIELDS and isinstance(v,str):
            try:row[k]=json.loads(v)
            except ValueError:pass
        if k in BOOL_FIELDS and v is not None:row[k]=bool(v)
        if k in ['formatted_content','images']:
            def replace(x):
                if isinstance(x,list):return [replace(y) for y in x]
                if isinstance(x,str):
                    for old,new in reverse.items():x=x.replace(old,new)
                return x
            row[k]=replace(row[k])
    return row

def equal(a,b):
    return json.dumps(a,sort_keys=True,ensure_ascii=False,separators=(',',':'))==json.dumps(b,sort_keys=True,ensure_ascii=False,separators=(',',':'))

def merge_rows(base,source,stage,key='id'):
    """Field-level three-way merge; conflicting user data always stops the copy."""
    b={r[key]:r for r in base};s={r[key]:r for r in source};t={r[key]:r for r in stage};out=[];conflicts=[]
    for id in sorted(set(b)|set(s)|set(t)):
        before=b.get(id);left=s.get(id);right=t.get(id)
        if before is None:
            if left and right and not equal(left,right):conflicts.append((id,'new-record-collision'));continue
            out.append(copy.deepcopy(left or right));continue
        if left is None or right is None:
            kept=left or right
            if kept and not equal(kept,before):conflicts.append((id,'delete-edit'));continue
            continue
        merged={}
        for field in set(before)|set(left)|set(right):
            bv=before.get(field);sv=left.get(field);tv=right.get(field)
            if equal(sv,tv) or equal(tv,bv):merged[field]=sv
            elif equal(sv,bv):merged[field]=tv
            elif field in ['updated_at','last_used_at']:merged[field]=max(str(sv or ''),str(tv or '')) or None
            else:conflicts.append((id,field))
        out.append(merged)
    return out,conflicts

def prepare():
    base=json.loads((staging.PRIVATE/'source-snapshot.json').read_text())
    source=json.loads((PRIVATE/'final-source.json').read_text())
    assert source['owner_id']==base['owner_id'] and source['restored_database']=='final'
    crypto_file('unseal',PRIVATE/'staging-latest.json',PRIVATE/'staging-logical.json',staging.PRIVATE/'encryption-key')
    stage=json.loads((PRIVATE/'staging-logical.json').read_text())
    secret_copy=json.loads((staging.PRIVATE/'staging-secret-copy.json').read_text())
    secret_base={'user_ai_api_keys':secret_copy['keys'],'user_external_tokens':secret_copy['external'],'user_image_storage_settings':[secret_copy['image']],'user_ai_settings':[secret_copy['settings']]}
    save(PRIVATE/'baseline-secret-encrypted.json',secret_base)
    crypto_file('unseal',PRIVATE/'baseline-secret-encrypted.json',PRIVATE/'baseline-secret-logical.json',staging.PRIVATE/'encryption-key')
    secret_base=json.loads((PRIVATE/'baseline-secret-logical.json').read_text())
    for table,rows in secret_base.items():base[table]=rows
    # The baseline is the copied source, before validated staging model repairs.
    # Those changes and the new score assignment are retained by the merge.
    stage_origin=json.loads(staging.MANIFEST.read_text())['origin']
    manifest=json.loads((staging.PRIVATE/'image-manifest.json').read_text())
    reverse={stage_origin+'/media/block-images/'+r['object_key']:r['old_url'] for r in manifest}
    result={};report={};conflicts={}
    for table in TABLES:
        b=[normalize_row(r,{}) for r in base.get(table,[])]
        s=[normalize_row(r,{}) for r in source[table]]
        t=[normalize_row(r,reverse) for r in stage[table]]
        if table in ['user_api_tokens','event_api_receipts']:
            # Original machine tokens/receipts were intentionally never copied
            # into staging. Their absence there is not a deletion.
            b=[]
        result[table],problems=merge_rows(b,s,t,'key' if table=='event_api_receipts' else 'id')
        if problems:conflicts[table]=problems
        report[table]={'baseline':len(b),'source':len(s),'staging':len(t),'merged':len(result[table])}
    if conflicts:
        save(PRIVATE/'merge-conflicts.json',conflicts)
        raise RuntimeError('Merge conflicts saved privately; no production data was imported')
    for table,rows in result.items():assert all(r['user_id']==base['owner_id'] for r in rows),table
    dates=[r['date'] for r in result['entries']]
    assert len(dates)==len(set(dates)),'Conflicting entry IDs for the same day; review privately'
    entryids={r['id'] for r in result['entries']};assert all(r['entry_id'] in entryids for r in result['blocks'])
    result['policy']={t:stage[t] for t in POLICY}
    result['owner_id']=base['owner_id'];result['images']=manifest
    save(PRIVATE/'merged-logical.json',result)
    crypto_file('seal',PRIVATE/'merged-logical.json',PRIVATE/'production-copy.json',production.PRIVATE/'encryption-key')
    save(PRIVATE/'merge-report.json',report)
    print('No merge conflicts:',report)

def sqlite_value(value):
    if isinstance(value,(dict,list)):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
    if isinstance(value,bool):return int(value)
    return value

def import_rows(c,origin=None):
    m=production.resource(c);data=json.loads((PRIVATE/'production-copy.json').read_text())
    conf=json.loads(production.CONFIG.read_text());origin=origin or conf['vars']['APP_ORIGIN']
    assert origin in [m['preview_origin'],production.CANONICAL]
    assert not production.query(c,'SELECT enabled FROM diary_generation_control')[0]['results'][0]['enabled']
    urls={r['old_url']:origin+'/media/block-images/'+r['object_key'] for r in data['images']}
    def convert(table,row):
        r=copy.deepcopy(row)
        if table=='blocks':r['images']=[urls.get(u,u) for u in (r.get('images') or [])]
        if table=='entries' and r.get('formatted_content'):
            for old,new in urls.items():r['formatted_content']=r['formatted_content'].replace(old,new)
        if table=='event_api_receipts':
            r['request']=json.dumps(dict(sorted(r['request'].items())),ensure_ascii=False,separators=(',',':'))
        return {k:sqlite_value(v) for k,v in r.items()}
    def rows_for(table,rows):
        fields=[r['name'] for r in production.query(c,'PRAGMA table_info('+table+')')[0]['results']]
        assert all(set(r)<=set(fields) for r in rows),table+' has unmapped source fields'
        for row in rows:
            assert all(not isinstance(v,str) or not v.startswith('enc:v1:') or len(v.split(':'))==4 for v in row.values())
        step=max(1,90//len(fields))
        def insert_chunk(start):
            chunk=rows[start:start+step];cols=list(chunk[0]);params=[r[k] for r in chunk for k in cols]
            # A rerun succeeds only for byte-for-byte existing rows, never
            # overwrites data that has received writes after opening service.
            existing=production.query(c,'SELECT * FROM '+table+' WHERE '+('key' if table=='event_api_receipts' else 'id')+' IN ('+','.join('?' for _ in chunk)+')',[r['key' if table=='event_api_receipts' else 'id'] for r in chunk])[0]['results']
            idx={r['key' if table=='event_api_receipts' else 'id']:r for r in existing}
            insert=[]
            for row in chunk:
                prior=idx.get(row['key' if table=='event_api_receipts' else 'id'])
                if prior:
                    assert all(equal(prior.get(k),v) for k,v in row.items()),'Existing production copy differs: '+table
                else:insert.append(row)
            if insert:production.query(c,'INSERT INTO '+table+'('+','.join(cols)+') VALUES '+','.join('('+','.join('?' for _ in cols)+')' for _ in insert),[r[k] for r in insert for k in cols])
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            list(pool.map(insert_chunk,range(0,len(rows),step)))
        print('Production copy:',table,len(rows),flush=True)
    for table in TABLES:rows_for(table,[convert(table,row) for row in data[table]])
    now=int(time.time()*1000)
    production.query(c,'INSERT OR IGNORE INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt)VALUES(?,?,?,1,?,?)',[data['owner_id'],'FlowLog owner',json.loads(production.CONFIG.read_text())['vars']['OWNER_EMAIL'],now,now])
    save(PRIVATE/'import-origin.json',{'origin':origin,'tables':{t:len(data[t]) for t in TABLES}})
    print('Owner ID preserved. Old passwords and sessions were not imported; generation remains stopped.')

def images(c):
    m=production.resource(c)
    data=json.loads((PRIVATE/'production-copy.json').read_text())
    manifest=data['images']
    # Only immutable content-addressed copies in this newly-created bucket.
    def transfer(row):
        assert row['object_key'].startswith(data['owner_id']+'/')
        raw=(staging.PRIVATE/'images'/row['file']).read_bytes()
        assert len(raw)==row['size'] and hashlib.sha256(raw).hexdigest()==row['sha256']
        url='https://api.cloudflare.com/client/v4/accounts/'+c['account_id']+'/r2/buckets/'+m['bucket']+'/objects/'+urllib.parse.quote(row['object_key'],safe='/')
        headers={'Authorization':'Bearer '+c['api_token']}
        # Do not overwrite an unexpected object; a resumed transfer reads and
        # compares existing bytes first.
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=120) as response:
                actual=response.read();mime=response.headers.get_content_type()
        except urllib.error.HTTPError as e:
            if e.code!=404:raise
            with urllib.request.urlopen(urllib.request.Request(url,method='PUT',data=raw,headers={**headers,'Content-Type':row['mime']}),timeout=120) as response:assert response.status in [200,201]
            with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=120) as response:
                actual=response.read();mime=response.headers.get_content_type()
        assert len(actual)==row['size'] and hashlib.sha256(actual).hexdigest()==row['sha256'] and mime==row['mime']
        return {'object_key':row['object_key'],'sha256':row['sha256'],'size':len(actual),'mime':mime}
    proof=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        for row in pool.map(transfer,manifest):
            proof.append(row)
            if len(proof)%25==0:print('Production images SHA256/MIME/size matched:',len(proof),flush=True)
    for start in range(0,len(manifest),15):
        part=manifest[start:start+15]
        production.query(c,'INSERT OR IGNORE INTO image_manifest(old_url,object_key,sha256,mime,size)VALUES '+','.join('(?,?,?,?,?)' for _ in part),[r[k] for r in part for k in ['old_url','object_key','sha256','mime','size']])
    save(PRIVATE/'production-image-verification.json',{'count':len(proof),'bytes':sum(r['size'] for r in proof),'objects':proof})
    print('All production image bytes, hashes and MIME types matched:',len(proof))

def install_policy(c):
    production.resource(c)
    data=json.loads((PRIVATE/'production-copy.json').read_text())
    source=json.loads((PRIVATE/'final-source.json').read_text())
    control=data['policy']['diary_generation_control'][0]
    assert control['new_records_only']==1 and control['new_records_started_at'] and json.loads(control['allowed_dates'])==[]
    assert not production.query(c,'SELECT enabled FROM diary_generation_control')[0]['results'][0]['enabled']
    owner=data['owner_id'];hour=data['user_ai_settings'][0]['day_boundary_hour']
    def date_of(block):
        timestamp=block['occurred_at'].replace('Z','+00:00')
        # Python 3.9 accepts only 3 or 6 fractional digits; PostgreSQL emits
        # variable precision. This parsing never rewrites stored timestamps.
        timestamp=re.sub(r'\.(\d+)(?=[+-])',lambda m:'.'+m[1].ljust(6,'0'),timestamp)
        return (datetime.fromisoformat(timestamp)+timedelta(hours=9-hour)).date().isoformat()
    protected={r['date'] for r in data['policy']['diary_generation_protected_dates']}
    protected.update(r['date'] for r in source['entries']);protected.update(date_of(r) for r in source['blocks'])
    oldids={r['id'] for r in source['blocks']};ids={r['id'] for r in data['blocks']}
    admitted={r['block_id'] for r in data['policy']['diary_generation_new_blocks']}
    assert admitted<=ids and not admitted&oldids
    newdates={date_of(r) for r in data['blocks'] if r['id'] in admitted and r['category']=='event'}-protected
    # Set the prior boundary first: enabling the policy must not reclassify
    # the real new records already accepted on staging as historical copies.
    production.query(c,'UPDATE diary_generation_control SET new_records_started_at=?,max_calls_per_day=?,allowed_dates=? WHERE singleton=1',[control['new_records_started_at'],control['max_calls_per_day'],'[]'])
    production.query(c,'UPDATE diary_generation_control SET new_records_only=1 WHERE singleton=1')
    for table,rows,fields in [
        ('diary_generation_protected_dates',[[owner,d] for d in sorted(protected)],['user_id','date']),
        ('diary_generation_new_blocks',[[owner,id] for id in sorted(admitted)],['user_id','block_id']),
        ('diary_generation_new_dates',[[owner,d] for d in sorted(newdates)],['user_id','date'])]:
        for start in range(0,len(rows),40):
            chunk=rows[start:start+40]
            production.query(c,'INSERT OR IGNORE INTO '+table+'('+','.join(fields)+')VALUES'+','.join('(?,?)' for _ in chunk),[v for r in chunk for v in r])
    for table in ['diary_generation_history','diary_entry_versions','diary_generation_attempts','diary_generation_jobs']:
        rows=[r for r in data['policy'][table] if r['date'] in newdates]
        for row in rows:
            assert row['user_id']==owner
            if table=='diary_generation_jobs':assert row['status']=='succeeded' and row['generation']==row['saved_generation'],'Pending staging job needs a separate continuation'
            fields=list(row)
            production.query(c,'INSERT OR REPLACE INTO '+table+'('+','.join(fields)+')VALUES('+','.join('?' for _ in fields)+')',[row[f] for f in fields])
    assert not production.query(c,"SELECT date FROM diary_generation_jobs WHERE status IN ('queued','running','saving')")[0]['results']
    save(PRIVATE/'production-generation-policy.json',{'started_at':control['new_records_started_at'],'protected_dates':len(protected),'admitted_new_blocks':len(admitted),'admitted_new_dates':len(newdates),'enabled':False})
    print('New-record policy preserved; historical days protected:',len(protected),'; existing new records admitted:',len(admitted),'; generation still stopped.')

def verify(c):
    m=production.resource(c);origin=json.loads(production.CONFIG.read_text())['vars']['APP_ORIGIN']
    expected=json.loads((PRIVATE/'production-copy.json').read_text());proof={}
    reverse={origin+'/media/block-images/'+r['object_key']:r['old_url'] for r in expected['images']}
    for table in TABLES:
        actual=[];offset=0
        while True:
            page=production.query(c,'SELECT * FROM '+table+' ORDER BY '+('user_id,key' if table=='event_api_receipts' else 'id')+' LIMIT 50 OFFSET ?',[offset])[0]['results'];actual.extend(page)
            if len(page)<50:break
            offset+=len(page)
        normalized=[normalize_row(r,reverse) for r in actual]
        wanted=[normalize_row(r,{}) for r in expected[table]]
        key='key' if table=='event_api_receipts' else 'id';a={r[key]:r for r in normalized};e={r[key]:r for r in wanted}
        assert set(a)==set(e),'Production primary key set mismatch: '+table
        for id,row in e.items():
            assert set(a[id])==set(row),'Unmapped production fields: '+table
            if table=='user_api_tokens' and (PRIVATE/'production-api-read-verification.json').exists():
                # The authenticated readback updates just the original token's
                # operational usage timestamp, after the first full copy check.
                checked=hashlib.sha256((PRIVATE/'existing-api-token').read_text().strip().encode()).hexdigest()
                if row['token_hash']==checked:
                    assert a[id]['last_used_at'] and (not row['last_used_at'] or a[id]['last_used_at']>=row['last_used_at'])
                    row['last_used_at']=a[id]['last_used_at']
            assert equal(a[id],row),'Production field mismatch: '+table
        proof[table]={'count':len(e),'primary_keys_matched':True,'every_field_matched':True,'sha256':hashlib.sha256(json.dumps(normalized,sort_keys=True,ensure_ascii=False).encode()).hexdigest()}
        print('All production fields matched:',table,len(e),flush=True)
    assert not production.query(c,'PRAGMA foreign_key_check')[0]['results']
    assert production.query(c,'SELECT count(*) n FROM auth_user')[0]['results'][0]['n']==1
    assert not production.query(c,"SELECT id FROM auth_account WHERE providerId='credential'")[0]['results']
    save(PRIVATE/'production-row-verification.json',{'origin':origin,'tables':proof,'foreign_keys_valid':True,'legacy_password_imported':False})
    print('All IDs, fields and relations matched; no legacy password imported.')

def canonicalize(c):
    m=production.resource(c)
    assert (PRIVATE/'production-row-verification.json').exists()
    assert json.loads((PRIVATE/'production-image-verification.json').read_text())['count']==339
    assert json.loads((PRIVATE/'backups/source-storage/manifest.json').read_text())['count']==158
    assert not production.query(c,'SELECT enabled FROM diary_generation_control')[0]['results'][0]['enabled']
    config=json.loads(production.CONFIG.read_text())
    assert config['vars']['APP_ORIGIN']==m['preview_origin'],'Already canonical or unexpected origin; inspect before repeating'
    # Keep revision and updated_at exactly as copied. Temporarily remove only
    # business-table triggers while this private copy has no active writers.
    triggers=production.query(c,"SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name IN ('blocks','entries')")[0]['results']
    save(PRIVATE/'canonicalization-triggers.json',triggers)
    try:
        for row in triggers:
            assert re.fullmatch('[a-z_][a-z0-9_]*',row['name'])
            production.query(c,'DROP TRIGGER '+row['name'])
        old=m['preview_origin']+'/media/block-images/';new=production.CANONICAL+'/media/block-images/'
        production.query(c,'UPDATE blocks SET images=replace(images,?,?) WHERE instr(images,?)>0',[old,new,old])
        production.query(c,'UPDATE entries SET formatted_content=replace(formatted_content,?,?) WHERE instr(formatted_content,?)>0',[old,new,old])
    finally:
        existing={r['name'] for r in production.query(c,"SELECT name FROM sqlite_master WHERE type='trigger'")[0]['results']}
        for row in triggers:
            if row['name'] not in existing:production.query(c,row['sql'])
    current=production.query(c,"SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name IN ('blocks','entries')")[0]['results']
    assert sorted(triggers,key=lambda x:x['name'])==sorted(current,key=lambda x:x['name'])
    config['vars']['APP_ORIGIN']=production.CANONICAL
    config['vars']['EXTERNAL_WRITES_ENABLED']='true'
    save(production.CONFIG,config)
    save(PRIVATE/'canonicalization.json',{'origin':production.CANONICAL,'triggers_restored':True,'diary_generation_enabled':False})
    print('Only the copied image URL origin changed; original revisions/timestamps preserved. DNS not changed by this command.')

if __name__=='__main__':
    os.umask(0o077)
    action=sys.argv[1]
    if action=='prepare':prepare()
    elif action=='pg-snapshot':pg_snapshot(sys.argv[2])
    else:
        c,_=staging.credentials()
        if action=='snapshot-staging':snapshot_stage(c)
        elif action=='freeze-staging':freeze_stage(c)
        elif action=='import':import_rows(c)
        elif action=='images':images(c)
        elif action=='install-policy':install_policy(c)
        elif action=='verify':verify(c)
        elif action=='canonicalize':canonicalize(c)
        else:raise RuntimeError('Unknown cutover operation')
