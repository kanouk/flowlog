#!/usr/bin/env python3
"""Verify every copied row and image, without emitting private content."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone
import staging

credential, _ = staging.credentials()
resource = staging.resource(credential)
snapshot = json.loads((staging.PRIVATE/'source-snapshot.json').read_text())
manifest = json.loads((staging.PRIVATE/'image-manifest.json').read_text())
urls={r['old_url']:resource['origin']+'/media/block-images/'+r['object_key'] for r in manifest}
secret_copy=staging.PRIVATE/'staging-secret-copy.json'
settings_copy=json.loads(secret_copy.read_text()) if secret_copy.exists() else None
model_keys={r['id']:r.get('api_key_id') for r in settings_copy['models']} if settings_copy else {}
overrides_path=staging.PRIVATE/'staging-config-overrides.json'
overrides=json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
previous=staging.PRIVATE/'copy-verification.json'
images=json.loads(previous.read_text()).get('images',{}) if previous.exists() else {}
report={'snapshot_at':snapshot['snapshot_at'],'rows_verified_at':datetime.now(timezone.utc).isoformat(),'tables':{},'images':images}
for table in ['profiles','entries','blocks','custom_tags','user_ai_settings','user_ai_models','user_ai_feature_settings']:
    actual={};cursor=''
    while True:
        page=staging.query(credential,'SELECT * FROM '+table+' WHERE id>? ORDER BY id LIMIT 100',[cursor])[0]['results']
        for row in page:actual[row['id']]=row
        if len(page)<100:break
        cursor=page[-1]['id']
    expected={}
    for source in snapshot[table]:
        row=dict(source)
        if table=='blocks':row['images']=[urls[u] for u in (row.get('images') or [])]
        if table=='entries' and row.get('formatted_content'):
            for old,new in urls.items():row['formatted_content']=row['formatted_content'].replace(old,new)
        if table=='user_ai_models':row['api_key_id']=model_keys.get(row['id'])
        if table=='user_ai_settings':row['auto_ocr']=settings_copy['settings']['auto_ocr'] if settings_copy else False
        row.update(overrides.get(table,{}).get(row['id'],{}))
        expected[row['id']]=row
    assert set(actual)==set(expected),'Primary key set mismatch: '+table
    for key,row in expected.items():
        for field,value in row.items():
            normalized=json.dumps(value,ensure_ascii=False,separators=(',',':')) if isinstance(value,(list,dict)) else int(value) if isinstance(value,bool) else value
            assert actual[key].get(field)==normalized,'Value mismatch: '+table+'.'+field
    digest=hashlib.sha256(json.dumps(expected,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    report['tables'][table]={'count':len(expected),'all_fields_matched':True,'expected_hash':digest}
    print('Verified all fields:',table,len(expected),flush=True)
staging.save(staging.PRIVATE/'copy-verification.json',report)
if '--rows-only' not in sys.argv:
    subprocess.run(['node',str(Path(__file__).with_name('verify-images.mjs'))],check=True)
print('Copied row values and primary keys match; image evidence is recorded separately.')
