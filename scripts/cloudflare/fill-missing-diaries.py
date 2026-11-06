#!/usr/bin/env python3
"""Explicit one-off backfill, empty diaries only. Never opens historical auto-generation."""
import concurrent.futures,json,os,re,subprocess,sys,uuid,traceback
from datetime import datetime,timezone
from pathlib import Path
import staging,production

CONFIG_TABLES=['user_ai_settings','user_ai_models','user_ai_api_keys','user_ai_feature_settings']
EMPTY="trim(replace(replace(replace(COALESCE(formatted_content,''),char(10),''),char(13),''),char(9),''),' '||char(12288)||char(8203))=''"

def projection(columns,alias='t'):
    assert all(re.fullmatch('[a-z_]+',c) for c in columns)
    return 'json_object('+','.join("'"+c+"',"+alias+'.'+c for c in columns)+')'

def expressions(schema,owner,date):
    entry="COALESCE((SELECT "+projection(schema['entries'])+" FROM entries t WHERE user_id=? AND date=?),'null')"
    blocks="(SELECT json_group_array("+projection(schema['blocks'])+") FROM (SELECT b.* FROM blocks b LEFT JOIN user_ai_settings a ON a.user_id=b.user_id WHERE b.user_id=? AND date(b.occurred_at,printf('%+d hours',9-COALESCE(a.day_boundary_hour,0)))=? ORDER BY b.id) t)"
    parts=[]
    for table in CONFIG_TABLES:
        parts.extend(["'"+table+"'","json((SELECT json_group_array("+projection(schema[table])+") FROM (SELECT * FROM "+table+" WHERE user_id=? ORDER BY id) t))"])
    config='json_object('+','.join(parts)+')'
    return entry,blocks,config,[owner,date,owner,date]+[owner]*len(CONFIG_TABLES)

def snapshot(c,schema,owner,date):
    e,b,a,params=expressions(schema,owner,date)
    return production.query(c,'SELECT '+e+' entry_json,'+b+' blocks_json,'+a+' config_json',params)[0]['results'][0]

def commit_statement(schema,owner,date,before,output,new_id=None):
    e,b,a,_=expressions(schema,owner,date)
    guard=e+' IS ? AND '+b+' IS ? AND '+a+' IS ?'
    # Expression placeholders and their snapshot comparisons are interleaved.
    conditions=[owner,date,before['entry_json'],owner,date,before['blocks_json']]+[owner]*len(CONFIG_TABLES)+[before['config_json']]
    row=json.loads(before['entry_json']);result=output['result']
    values=[result['formatted_content'],result.get('score'),result.get('score_details')]
    if row is not None:
        sql="UPDATE entries SET formatted_content=?,score=COALESCE(?,score),score_details=COALESCE(?,score_details),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND date=? AND id=? AND "+EMPTY+' AND '+guard+' RETURNING id,date,formatted_content,score'
        return sql,values+[owner,date,row['id']]+conditions
    sql="INSERT INTO entries(id,user_id,date,formatted_content,score,score_details) SELECT ?,?,?,?,?,? WHERE "+guard+' ON CONFLICT(user_id,date) DO NOTHING RETURNING id,date,formatted_content,score'
    return sql,[new_id or str(uuid.uuid4()),owner,date]+values+conditions

def all_rows(c,table):
    out=[];cursor=''
    while True:
        page=production.query(c,'SELECT * FROM '+table+' WHERE id>? ORDER BY id LIMIT 100',[cursor])[0]['results'];out.extend(page)
        if len(page)<100:return out
        cursor=page[-1]['id']

def audit(c,owner):
    return production.query(c,"WITH days AS(SELECT date(b.occurred_at,printf('%+d hours',9-COALESCE(a.day_boundary_hour,0))) date,count(*) blocks,sum(b.category='event') events FROM blocks b LEFT JOIN user_ai_settings a ON a.user_id=b.user_id WHERE b.user_id=? GROUP BY 1) SELECT d.date,d.blocks,d.events,e.id FROM days d LEFT JOIN entries e ON e.user_id=? AND e.date=d.date WHERE "+EMPTY+' ORDER BY d.date',[owner,owner])[0]['results']

def main():
    os.umask(0o077);c,env=staging.credentials();production.resource(c)
    conf=json.loads(production.CONFIG.read_text());assert conf['vars']['APP_ORIGIN']=='https://flowlog.jp' and not conf['workers_dev']
    owner=conf['vars']['OWNER_ID']
    if len(sys.argv)>1:
        run=Path(sys.argv[1]).resolve();assert run.parent==staging.PRIVATE.resolve() and run.name.startswith('missing-diaries-')
        plan=json.loads((run/'plan.json').read_text());assert plan['owner']==owner
    else:
        run=staging.PRIVATE/('missing-diaries-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'));run.mkdir(mode=0o700)
        targets=audit(c,owner);assert len(targets)<=100,'Review unexpectedly large batch before generation'
        tables=['entries','blocks']+CONFIG_TABLES
        definitions={t:production.query(c,'PRAGMA table_info('+t+')')[0]['results'] for t in tables}
        schema={t:[r['name'] for r in definitions[t]] for t in tables}
        before={t:all_rows(c,t) for t in ['entries','blocks']}
        before['control']=production.query(c,'SELECT * FROM diary_generation_control')[0]['results']
        before['protected_dates']=production.query(c,'SELECT * FROM diary_generation_protected_dates ORDER BY user_id,date')[0]['results']
        staging.save(run/'before.json',before)
        plan={'owner':owner,'targets':targets,'schema':schema,'config_schema':{t:definitions[t] for t in CONFIG_TABLES},'started_at':datetime.now(timezone.utc).isoformat()};staging.save(run/'plan.json',plan)
    schema=plan['schema'];progress_file=run/'progress.json';progress=json.loads(progress_file.read_text()) if progress_file.exists() else {}
    bundle=run/'generator.mjs'
    build="import{build}from'esbuild';await build({entryPoints:['scripts/cloudflare/generate-missing-diary.mjs'],outfile:process.argv[1],bundle:true,format:'esm',platform:'node',target:'node22',external:['node:*','cloudflare:*'],logLevel:'silent'});"
    subprocess.run(['node','--input-type=module','-e',build,str(bundle)],cwd=staging.ROOT,check=True,capture_output=True)
    def generate(target):
        date=target['date'];assert re.fullmatch(r'\d{4}-\d{2}-\d{2}',date)
        state=snapshot(c,schema,owner,date);entry=json.loads(state['entry_json']);blocks=json.loads(state['blocks_json'])
        if entry and (entry.get('formatted_content') or '').strip(' \t\r\n\u3000\u200b'):return date,{'status':'already_filled'}
        if not blocks:return date,{'status':'no_blocks'}
        input_path=run/(date+'.input.json');output_path=run/(date+'.output.json');state_path=run/(date+'.snapshot.json')
        if output_path.exists() and state_path.exists():
            previous=json.loads(state_path.read_text())
            if previous!=state:return date,{'status':'conflict','reason':'snapshot_changed_after_generation'}
        else:
            config=json.loads(state['config_json']);hour=config['user_ai_settings'][0]['day_boundary_hour']
            staging.save(state_path,state)
            staging.save(input_path,{'date':date,'owner':owner,'blocks':blocks,'config':config,'config_schema':plan['config_schema'],'day_boundary_hour':hour,'encryption_key_file':str(production.PRIVATE/'encryption-key')})
            r=subprocess.run(['node','--experimental-sqlite',str(bundle),str(input_path),str(output_path)],cwd=staging.ROOT,capture_output=True,text=True,timeout=180)
            staging.save(run/(date+'.execution.json'),{'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
            if r.returncode:return date,{'status':'generation_failed'}
        output=json.loads(output_path.read_text());assert output['date']==date and output['result']['formatted_content'].strip()
        sql,params=commit_statement(schema,owner,date,state,output)
        saved=production.query(c,sql,params)[0]['results']
        if not saved:return date,{'status':'conflict','reason':'entry_blocks_or_config_changed'}
        actual=production.query(c,'SELECT * FROM entries WHERE id=? AND user_id=?',[saved[0]['id'],owner])[0]['results'][0]
        assert actual['formatted_content']==output['result']['formatted_content']
        staging.save(run/(date+'.saved.json'),actual)
        return date,{'status':'saved','id':actual['id'],'characters':len(actual['formatted_content']),'provider':output['provider'],'model':output['model'],'provider_calls':output['provider_calls'],'scored':output['scored']}
    pending=[r for r in plan['targets'] if progress.get(r['date'],{}).get('status') not in ['saved','already_filled']]
    print('Backfill targets:',len(plan['targets']),'; pending:',len(pending),'; private run:',run.name,flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures={pool.submit(generate,t):t['date'] for t in pending}
        for future in concurrent.futures.as_completed(futures):
            try:date,result=future.result()
            except Exception:
                date=futures[future];result={'status':'operator_error'}
                p=run/(date+'.operator-error.txt');p.write_text(traceback.format_exc());p.chmod(0o600)
            progress[date]=result;staging.save(progress_file,progress)
            print('Processed:',len(progress),'/',len(plan['targets']),';',date,result['status'],flush=True)
    remaining=audit(c,owner);staging.save(run/'remaining.json',remaining)
    before=json.loads((run/'before.json').read_text());after_entries=all_rows(c,'entries');after_blocks=all_rows(c,'blocks')
    planned_dates={r['date'] for r in plan['targets']};originals={r['id']:r for r in before['entries'] if r['date'] not in planned_dates}
    after={r['id']:r for r in after_entries};unchanged=all(after.get(id)==row for id,row in originals.items())
    control=production.query(c,'SELECT * FROM diary_generation_control')[0]['results'];protected=production.query(c,'SELECT * FROM diary_generation_protected_dates ORDER BY user_id,date')[0]['results']
    report={'targets':len(plan['targets']),'saved':sum(r['status']=='saved' for r in progress.values()),'remaining_missing_days':len(remaining),'existing_diaries_unchanged':unchanged,'all_blocks_unchanged':before['blocks']==after_blocks,'automatic_generation_settings_unchanged':control==before['control'],'historical_protection_unchanged':protected==before['protected_dates'],'provider_calls':sum(r.get('provider_calls',0) for r in progress.values())}
    staging.save(run/'verification.json',report);staging.save(staging.PRIVATE/'missing-diaries-latest.json',{'run':str(run),'verification':report});print('Verification:',json.dumps(report),flush=True)
    if remaining or not all(report[k] for k in ['existing_diaries_unchanged','all_blocks_unchanged','automatic_generation_settings_unchanged','historical_protection_unchanged']):raise RuntimeError('Backfill not fully verified; inspect private run before resuming')

if __name__=='__main__':main()
