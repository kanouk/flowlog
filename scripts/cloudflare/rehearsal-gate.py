#!/usr/bin/env python3
"""Temporarily permit one fictional day on the dedicated staging Worker only."""
import json,sys
import staging
DATE='1997-01-02'
c,_=staging.credentials();staging.resource(c)
p=staging.PRIVATE/'rehearsal-control.json'
row=staging.query(c,'SELECT enabled,allowed_dates FROM diary_generation_control WHERE singleton=1')[0]['results'][0]
if sys.argv[1]=='enable':
    if p.exists():raise RuntimeError('Previous rehearsal control record still exists; inspect it first')
    if row['enabled'] or json.loads(row['allowed_dates']):raise RuntimeError('Generation policy already configured; refusing to overwrite it')
    owner=json.loads(staging.CONFIG.read_text())['vars']['OWNER_ID']
    if staging.query(c,'SELECT id FROM entries WHERE user_id=? AND date=?',[owner,DATE])[0]['results']:raise RuntimeError('Fictional rehearsal date is already used')
    staging.save(p,row)
    staging.query(c,'UPDATE diary_generation_control SET enabled=1,allowed_dates=? WHERE singleton=1',[json.dumps([DATE])])
    print('Only fictional date permitted; copied diary dates remain excluded.')
elif sys.argv[1]=='disable':
    original=json.loads(p.read_text())
    if not row['enabled'] or json.loads(row['allowed_dates'])!=[DATE]:raise RuntimeError('Rehearsal control changed; refusing to overwrite another change')
    staging.query(c,'UPDATE diary_generation_control SET enabled=?,allowed_dates=? WHERE singleton=1',[original['enabled'],original['allowed_dates']])
    # Only this test day's durable metadata, never general owner sessions/data.
    owner=json.loads(staging.CONFIG.read_text())['vars']['OWNER_ID']
    for table in ['diary_generation_jobs','diary_generation_outbox','diary_generation_attempts','diary_entry_versions','diary_generation_history']:
        staging.query(c,'DELETE FROM '+table+' WHERE user_id=? AND date=?',[owner,DATE])
    p.unlink()
    print('Rehearsal gate restored; only fictional job metadata removed.')
else:raise RuntimeError('Choose enable or disable')
