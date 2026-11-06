#!/usr/bin/env python3
"""Short-lived staging-only QA session. Never resets a password or other sessions."""
import json,secrets,sys,time
import staging
c,_=staging.credentials();m=staging.resource(c)
p=staging.PRIVATE/'operator-session.json'
if len(sys.argv)>1 and sys.argv[1]=='remove':
    if p.exists():
        own=json.loads(p.read_text())
        staging.query(c,"DELETE FROM auth_session WHERE id=? AND token=? AND userAgent='flowlog-isolated-qa'",[own['id'],own['token']])
        p.unlink()
    print('Only this QA session removed. Owner login/password unchanged.')
else:
    if p.exists():
        own=json.loads(p.read_text())
        existing=staging.query(c,"SELECT id FROM auth_session WHERE id=? AND token=? AND userAgent='flowlog-isolated-qa'",[own['id'],own['token']])[0]['results']
        if own['expiresAt']>int(time.time()*1000)+60000 and existing:
            print('Existing isolated QA session reused.');sys.exit(0)
        staging.query(c,"DELETE FROM auth_session WHERE id=? AND token=? AND userAgent='flowlog-isolated-qa'",[own['id'],own['token']])
    now=int(time.time()*1000);config=json.loads(staging.CONFIG.read_text())
    own={'id':secrets.token_hex(16),'token':secrets.token_urlsafe(48),'expiresAt':now+45*60*1000,'origin':m['origin'],'owner':config['vars']['OWNER_ID']}
    staging.query(c,"INSERT INTO auth_session(id,userId,token,expiresAt,createdAt,updatedAt,userAgent)VALUES(?,?,?,?,?,?,'flowlog-isolated-qa')",[own['id'],own['owner'],own['token'],own['expiresAt'],now,now])
    staging.save(p,own)
    print('Short-lived QA session created; owner password/sessions untouched.')
