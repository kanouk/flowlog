#!/usr/bin/env python3
"""Patch a private HTTP Shortcuts export locally. Never prints credentials."""
import argparse, copy, hashlib, json, os, uuid, zipfile
from pathlib import Path
from urllib.parse import urlsplit

PREPARE = r'''// FlowLog: retain pending requests across app restarts and retries.
let pending = JSON.parse(getVariable(__STATE__) || '{}');
const now = Date.now();
for (const k of Object.keys(pending)) {
  if (pending[k].done && now - pending[k].done > 60000) delete pending[k];
}
const payload = __PAYLOAD__;
const identity = hash('SHA-256', JSON.stringify([shortcut.id, payload]));
let operation = pending[identity];
if (!operation) operation = {id: 'pixel:' + uuidv4()};
pending[identity] = operation;
const serialized = JSON.stringify(pending);
if (serialized.length > 30000) throw new Error('FlowLog: too many unresolved posts; review pending requests.');
setVariable(__STATE__, serialized);
setVariable('flowlog_post_id', operation.id);
setVariable('flowlog_identity', identity);
'''
SUCCESS = r'''const result = JSON.parse(response.body);
if (result.success && result.data && result.data.id) {
  const pending = JSON.parse(getVariable(__STATE__) || '{}');
  const identity = getVariable('flowlog_identity');
  if (pending[identity] && pending[identity].id === getVariable('flowlog_post_id')) {
    pending[identity].done = Date.now();
    setVariable(__STATE__, JSON.stringify(pending));
  }
}
'''
PAYLOADS = {
 'FlowLogへ': "[getVariable('share_title'), getVariable('share_text')]",
 'Inbox': "getVariable('hitokoto')",
 # ISO-8859-1 represents every byte without replacement; file IDs change on re-share.
 'FlowLog写真': "selectedFiles.map(f => [f.type, hash('SHA-256', getDirectory().readFile(f.id, 'ISO-8859-1'))])",
}
def patch(source):
 result=copy.deepcopy(source)
 found=set()
 for category in result['categories']:
  for s in category.get('shortcuts',[]):
   name=s['name']
   if name not in PAYLOADS: continue
   found.add(name)
   assert not s.get('codeOnPrepare') and not s.get('codeOnSuccess') and not s.get('headers'), 'Existing custom logic; review required'
   old=urlsplit(s['url'])
   assert old.path.endswith('/api/capture') or old.path.endswith('/api/capture-image')
   s['url']='https://flowlog.jp/api/'+('capture-image' if name=='FlowLog写真' else 'capture')+('?' + old.query if old.query else '')
   state='flowlog_pending_'+hashlib.sha256(s['id'].encode()).hexdigest()[:12]
   result['variables'].append({'id':str(uuid.uuid4()),'key':state,'type':'constant','value':'{}'})
   s['headers']=[{'key':'Idempotency-Key','value':'{{flowlog_post_id}}'}]
   s['codeOnPrepare']=PREPARE.replace('__STATE__',json.dumps(state)).replace('__PAYLOAD__',PAYLOADS[name])
   s['codeOnSuccess']=SUCCESS.replace('__STATE__',json.dumps(state))
 assert found==set(PAYLOADS), 'Expected three existing FlowLog shortcuts'
 return result

def main():
 ap=argparse.ArgumentParser();ap.add_argument('source',type=Path);ap.add_argument('output',type=Path);a=ap.parse_args()
 with zipfile.ZipFile(a.source) as z: source=json.loads(z.read('shortcuts.json'))
 result=patch(source)
 fd=os.open(a.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:
  with zipfile.ZipFile(f,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('shortcuts.json',json.dumps(result,ensure_ascii=False))
 print('Patched three FlowLog shortcuts; credentials preserved without display.')
if __name__=='__main__':main()
