import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const generated=JSON.parse(execFileSync('python3',['-c',`import sys,json;sys.path.insert(0,'scripts/android');from patch_http_shortcuts import patch
names=['FlowLogへ','Inbox','FlowLog写真'];s={'categories':[{'shortcuts':[{'id':str(i),'name':n,'url':'https://old.invalid/api/capture','authToken':'fictional-only'} for i,n in enumerate(names)]}],'variables':[]};print(json.dumps(patch(s)))`]));
for(const shortcut of generated.categories[0].shortcuts){
 const state=new Map(generated.variables.map(v=>[v.key,v.value]));
 let now=100000; let file='fake image bytes';
 const inputs={share_title:'example',share_text:'https://example.com',hitokoto:'fictional text'};
 const run=(code,extra={})=>vm.runInNewContext(code,{shortcut,selectedFiles:[{id:crypto.randomUUID(),type:'image/png'}],getDirectory:()=>({readFile:()=>file}),getVariable:k=>state.has(k)?state.get(k):inputs[k],setVariable:(k,v)=>state.set(k,v),hash:(alg,s)=>crypto.createHash('sha256').update(s).digest('hex'),uuidv4:crypto.randomUUID,Date:{now:()=>now},...extra});
 run(shortcut.codeOnPrepare);const first=state.get('flowlog_post_id');
 now+=5000;run(shortcut.codeOnPrepare);assert.equal(state.get('flowlog_post_id'),first,'lost response keeps original ID');
 run(shortcut.codeOnSuccess,{response:{body:JSON.stringify({success:true,data:{id:'fictional-block'}})}});
 now+=1000;run(shortcut.codeOnPrepare);assert.equal(state.get('flowlog_post_id'),first,'rapid repeat reuses completed ID');
 now+=61000;run(shortcut.codeOnPrepare);assert.notEqual(state.get('flowlog_post_id'),first,'later intentional post has new ID');
 const second=state.get('flowlog_post_id');inputs.hitokoto+=' changed';inputs.share_text+='?changed=1';file+=' changed';
 run(shortcut.codeOnPrepare);assert.notEqual(state.get('flowlog_post_id'),second,'different content has different ID');
 assert.equal(shortcut.authToken,'fictional-only');assert(shortcut.url.startsWith('https://flowlog.jp/api/'));
}
console.log('Three shortcuts: pending retry, rapid replay, later new post, changed input, and credential preservation passed.');
