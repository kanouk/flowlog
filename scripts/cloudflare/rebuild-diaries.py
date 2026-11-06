#!/usr/bin/env python3
"""Approved material-first rebuild. Private plan, stable IDs, exact snapshot CAS."""
import concurrent.futures,hashlib,json,os,re,subprocess,sys
from datetime import datetime,timedelta,timezone
from pathlib import Path
import staging,production
os.umask(0o077)
RUN=staging.PRIVATE/'diary-block-rebuild-20261030'
V=Path('/Users/kanouk/Documents/Private')
c,env=staging.credentials();production.resource(c)
owner=json.loads(production.CONFIG.read_text())['vars']['OWNER_ID']
plan=json.loads((RUN/'plan.json').read_text());before=json.loads((RUN/'before.json').read_text());schema=json.loads((RUN/'schema.json').read_text());dates={p['date'] for p in plan}
assert len(dates)==34 and all(p['date'].startswith('2026-') for p in plan)
def q(sql,params=None):return production.query(c,sql,params)[0]['results']
def save(n,o):staging.save(RUN/n,o)
def allrows(t):return q('SELECT * FROM '+t+' WHERE user_id=? ORDER BY id',[owner])
def projection(cols,a='t'):return 'json_object('+','.join("'"+d['name']+"',"+a+'.'+d['name'] for d in cols)+')'
def state(date):
 hour=before['user_ai_settings'][0]['day_boundary_hour'];lo=(datetime.fromisoformat(date+'T00:00:00+00:00')+timedelta(hours=hour-9)).isoformat();hi=(datetime.fromisoformat(lo)+timedelta(days=1)).isoformat()
 ep='COALESCE((SELECT '+projection(schema['entries'])+' FROM entries t WHERE user_id=? AND date=?),\'null\')'
 where="user_id=? AND ((category IN ('event','thought') AND julianday(occurred_at)>=julianday(?) AND julianday(occurred_at)<julianday(?)) OR (category='schedule' AND starts_at IS NOT NULL AND julianday(starts_at)<julianday(?) AND (julianday(starts_at)>=julianday(?) OR julianday(ends_at)>julianday(?))))"
 bp='(SELECT json_group_array('+projection(schema['blocks'])+') FROM (SELECT * FROM blocks WHERE '+where+' ORDER BY id) t)'
 tables=['user_ai_settings','user_ai_models','user_ai_api_keys','user_ai_feature_settings'];cp='json_object('+','.join("'"+t+"',json((SELECT json_group_array("+projection(schema[t])+") FROM (SELECT * FROM "+t+" WHERE user_id=? ORDER BY id) t))" for t in tables)+')'
 params=[owner,date,owner,lo,hi,hi,lo,lo]+[owner]*4
 row=q('SELECT '+ep+' entry_json,'+bp+' blocks_json,'+cp+' config_json',params)[0]
 return row,(ep,bp,cp),params

def sync(requested):
 if not (RUN/'added-protections.json').exists():
  current={e['date']:e for e in allrows('entries')};original={e['date']:e for e in before['entries']}
  assert all(current[d]==original[d] for d in dates),'Diary changed since backup'
  protections=q('SELECT * FROM diary_generation_protected_dates WHERE user_id=?',[owner]);existing={r['date'] for r in protections};added=sorted(dates-existing)
  save('added-protections.json',added)
  for d in added:q('INSERT INTO diary_generation_protected_dates(user_id,date)VALUES(?,?) ON CONFLICT DO NOTHING',[owner,d])
  print('Protected batch days during import:',len(added),flush=True)
 for p in plan:
  if p['date'] not in requested:continue
  for sf in p['source_files']:assert hashlib.sha256((V/sf['path']).read_bytes()).hexdigest()==sf['sha256'],'Source changed: '+sf['path']
  existing={r['id']:r for r in q('SELECT * FROM blocks WHERE user_id=? AND entry_id=?',[owner,p['add'][0]['entry_id'] if p['add'] else next(e['id'] for e in before['entries'] if e['date']==p['date'])])}
  pending=[]
  for b in p['add']:
   if b['id'] in existing:
    assert all((json.loads(existing[b['id']][k]) if k=='images' else existing[b['id']].get(k))==v for k,v in b.items()),'Existing material conflict'
   else:pending.append(b)
  for offset in range(0,len(pending),6):
   group=pending[offset:offset+6];fields=['id','entry_id','content','category','occurred_at','images','source','starts_at','ends_at'];params=[];selects=[]
   for b in group:
    params.extend([owner]+[json.dumps(b.get(k,[]),ensure_ascii=False) if k=='images' else b.get(k) for k in fields]);selects.append('('+','.join('?' for _ in range(10))+')')
   q('INSERT INTO blocks(user_id,'+','.join(fields)+') VALUES '+','.join(selects)+' ON CONFLICT DO NOTHING RETURNING id',params)
  for u in p['updates']:
   actual=q('SELECT * FROM blocks WHERE user_id=? AND id=?',[owner,u['id']])[0]
   if actual['content']==u['content'] and json.loads(actual['images'])==u['images']:continue
   assert actual==u['expected'],'Photo block changed'
   assert q('UPDATE blocks SET content=?,images=? WHERE user_id=? AND id=? AND revision=? RETURNING id',[u['content'],json.dumps(u['images']),owner,u['id'],actual['revision']])
  save('sync-progress-'+p['date']+'.json',{'date':p['date'],'synced':True,'added':len(p['add']),'updated':len(p['updates'])})
  print('Materials synced:',p['date'],len(p['add']),flush=True)
 save('after-materials.json',{'entries':allrows('entries'),'blocks':allrows('blocks')})
 assert q('SELECT * FROM diary_generation_control')==before['diary_generation_control'],'Generation settings changed'
 assert q('SELECT * FROM diary_generation_jobs')==before['diary_generation_jobs'],'Import unexpectedly queued generation'
 print('Requested days synced before generation; no generation jobs added',len(requested),flush=True)

def generate(requested):
 bundle=RUN/'material-generator.mjs'
 build="import{build}from'esbuild';await build({entryPoints:['scripts/cloudflare/generate-material-diary.mjs'],outfile:process.argv[1],bundle:true,format:'esm',platform:'node',target:'node22',external:['node:*','cloudflare:*'],logLevel:'silent'});"
 subprocess.run(['node','--input-type=module','-e',build,str(bundle)],cwd=staging.ROOT,check=True,capture_output=True)
 def one(date):
  out=RUN/(date+'.output.json');snap=RUN/(date+'.snapshot.json')
  if out.exists():return date,'already_generated'
  s,_,_=state(date);save(date+'.snapshot.json',s)
  save(date+'.input.json',{'date':date,'owner':owner,'blocks':json.loads(s['blocks_json']),'config':json.loads(s['config_json']),'schema':schema,'encryption_key_file':str(production.PRIVATE/'encryption-key')})
  r=subprocess.run(['node','--experimental-sqlite',str(bundle),str(RUN/(date+'.input.json')),str(out)],cwd=staging.ROOT,capture_output=True,text=True,timeout=180)
  save(date+'.execution.json',{'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
  return date,'generated' if r.returncode==0 else 'failed'
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  for d,status in pool.map(one,requested):print('Diary:',d,status,flush=True)

def commit(requested):
 for date in requested:
  output=json.loads((RUN/(date+'.output.json')).read_text());saved_path=RUN/(date+'.saved.json')
  if saved_path.exists():
   assert q('SELECT * FROM entries WHERE user_id=? AND date=?',[owner,date])[0]==json.loads(saved_path.read_text()),'Saved diary changed';continue
  old=json.loads((RUN/(date+'.snapshot.json')).read_text());now,expr,params=state(date);assert now==old,'Diary, material or config changed: '+date
  body=output['result']['formatted_content'];assert body.strip() and len(re.findall(r'^## ',body,re.M))==1,'Invalid title structure'
  title=re.search(r'^## (.+)',body,re.M)[1];assert len(title)<=25,'Overlong title'
  expected_photos={u for b in json.loads(old['blocks_json']) for u in json.loads(b.get('images') or '[]')};used=re.findall(r'\{\{PHOTO:([^}]+)\}\}',body)
  assert set(used)==expected_photos and len(used)==len(set(used)),'Photo mismatch'
  ep,bp,cp=expr
  guard=ep+' IS ? AND '+bp+' IS ? AND '+cp+' IS ?'
  # Snapshot expressions have interleaved bindings.
  guarded=[owner,date,old['entry_json']]+params[2:8]+[old['blocks_json']]+[owner]*4+[old['config_json']]
  row=q("UPDATE entries SET formatted_content=?,summary='',score=NULL,score_details=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND date=? AND "+guard+' RETURNING *',[body,owner,date]+guarded)
  assert len(row)==1,'Concurrent write rejected';save(date+'.saved.json',row[0]);print('Saved and read back:',date,flush=True)

def verify():
 after={'entries':allrows('entries'),'blocks':allrows('blocks')};save('after.json',after)
 old={r['id']:r for r in before['entries']};new={r['id']:r for r in after['entries']}
 assert all(new[k]==v for k,v in old.items() if v['date'] not in dates),'Unrelated diary changed'
 for date in dates:
  receipt=json.loads((RUN/(date+'.saved.json')).read_text());assert new[receipt['id']]==receipt
 oldb={r['id']:r for r in before['blocks']};newb={r['id']:r for r in after['blocks']};changed={u['id'] for p in plan for u in p['updates']}
 assert all(newb[k]==v for k,v in oldb.items() if k not in changed),'Unrelated block changed'
 assert len(newb)-len(oldb)==sum(len(p['add']) for p in plan),'Block count mismatch'
 assert q('SELECT * FROM diary_generation_control')==before['diary_generation_control']
 assert q('SELECT * FROM diary_generation_jobs')==before['diary_generation_jobs']
 for date in json.loads((RUN/'added-protections.json').read_text()):q('DELETE FROM diary_generation_protected_dates WHERE user_id=? AND date=?',[owner,date])
 protections=q('SELECT * FROM diary_generation_protected_dates');assert sorted(protections,key=lambda r:(r['user_id'],r['date']))==sorted(before['diary_generation_protected_dates'],key=lambda r:(r['user_id'],r['date']))
 result={'days':len(dates),'new_blocks':sum(len(p['add']) for p in plan),'updated_blocks':len(changed),'photo_blocks_updated':sum(u['expected']['category']=='thought' for p in plan for u in p['updates']),'unrelated_diaries_unchanged':True,'unrelated_blocks_unchanged':True,'generation_settings_and_jobs_unchanged':True,'protection_restored':True}
 save('verification.json',result);print(json.dumps(result),flush=True)

action=sys.argv[1];requested=sys.argv[2:] or sorted(dates);assert set(requested)<=dates
if action=='sync':sync(requested)
elif action=='generate':generate(requested)
elif action=='commit':commit(requested)
elif action=='verify':verify()
else:raise RuntimeError('Choose sync, generate, commit, verify')
