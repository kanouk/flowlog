/** Local Worker/D1/R2 contract and race tests. Fictional data, no outbound network. */
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomBytes,createCipheriv} from 'node:crypto';
import {serializeSignedCookie} from 'better-call';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
await mkdir('.migration-backups',{recursive:true,mode:0o700});
await build({entryPoints:['worker/index.ts'],outfile:'.migration-backups/retry-fix/idempotency-worker.mjs',bundle:true,format:'esm',platform:'node',target:'es2022',external:['node:*','cloudflare:*'],logLevel:'silent'});
const origin='https://fixture.example',owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const environment=process.argv.includes('--production')?'production':'staging';
const cookieName=environment==='production'?'__Secure-flowlog.session_token':'__Secure-flowlog-staging.session_token';
const secret='test-only-auth-secret-at-least-thirty-two-chars',key=randomBytes(32),machine='fixture-only-machine-token';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'.migration-backups/retry-fix/idempotency-worker.mjs',compatibilityDate:'2026-10-29',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'test-db'},r2Buckets:{IMAGES:'test-images'},queueProducers:{DIARY_QUEUE:'test-diary'},serviceBindings:{ASSETS:()=>new Response('fixture static asset')},bindings:{PUBLIC_IMAGE_DELIVERY:'true',ENVIRONMENT:environment,APP_ORIGIN:origin,OWNER_ID:owner,OWNER_EMAIL:'fixture@example.com',AUTH_SECRET:secret,ENCRYPTION_KEY:key.toString('base64'),FIRECRAWL_API_KEY:'fictional-firecrawl-key'}}));
const checks=[];let cookie;
try {
 const db=await mf.getD1Database('DB'),r2=await mf.getR2Bucket('IMAGES');
 const schema=spawnSync('python3',['-c',`import sqlite3,json,pathlib
out=[]
for p in sorted(pathlib.Path('worker/migrations').glob('*.sql')):
 text=''
 for line in p.read_text().splitlines():
  text+=line+'\\n'
  if sqlite3.complete_statement(text):out.append(text);text=''
print(json.dumps(out))`],{encoding:'utf8'});
 if(schema.status)throw Error(schema.stderr);
 for(const statement of JSON.parse(schema.stdout))await db.prepare(statement).run();
 const sql=(text,...params)=>db.prepare(text).bind(...params).run();
 const first=(text,...params)=>db.prepare(text).bind(...params).first();
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
 const http=async(path,{method='GET',body,auth='cookie',originHeader=true,extraHeaders={}}={})=>{
  const headers={...extraHeaders};if(body!==undefined)headers['Content-Type']='application/json';
  if(originHeader)headers.Origin=origin;
  if(auth==='cookie'&&cookie)headers.Cookie=cookie;
  else if(auth==='token')headers.Authorization='Bearer '+machine;
  else if(auth==='fake')headers.Authorization='Bearer cookie-session';
  const res=await mf.dispatchFetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  const type=res.headers.get('Content-Type')||'';const data=type.includes('json')?await res.json():await res.text();return {status:res.status,data,headers:res.headers};
 };
 const test=(op,body)=>http('/__test/'+op,{method:'POST',body,auth:'none'}).then(r=>r.data);
 await sql('INSERT INTO profiles(id,user_id)VALUES(?,?)',owner,owner);
 const now=Date.now(),sessionToken=randomBytes(32).toString('hex');
 await sql('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt)VALUES(?,?,?,1,?,?)',owner,'Fixture','fixture@example.com',now,now);
 await sql('INSERT INTO auth_session(id,userId,token,expiresAt,createdAt,updatedAt)VALUES(?,?,?,?,?,?)',randomBytes(16).toString('hex'),owner,sessionToken,now+3600000,now,now);
 cookie=(await serializeSignedCookie(cookieName,sessionToken,secret,{path:'/',secure:true,httpOnly:true})).split(';')[0];

 await sql('INSERT INTO user_api_tokens(id,user_id,token_hash)VALUES(?,?,?)','fixture-token',owner,createHash('sha256').update(machine).digest('hex'));

 const stamp='1999-01-02T03:00:00Z';
 const count=async()=> (await first('SELECT count(*) n FROM blocks')).n;
 const post=async(path,body,key)=>http('/api/'+path,{method:'POST',auth:'token',originHeader:false,body,extraHeaders:key?{'Idempotency-Key':key}:{}});
 const routes=[['events',{content:'event fixture',occurred_at:stamp}],['tasks',{content:'task fixture',priority:2}],['schedules',{title:'schedule fixture',starts_at:'2099-01-02T03:00:00Z'}],['memos',{content:'memo fixture'}],['read-later',{url:'https://example.com/article'}],['capture',{text:'capture fixture'}]];
 for(const[path,body]of routes){
  const before=await count();check(path+' missing key is rejected before storage',(await post(path,body)).status===428&&await count()===before);
  const key='fixture:'+path;const replies=await Promise.all(Array.from({length:4},()=>post(path,body,key)));
  check(path+' concurrent retry creates one block',replies.every(r=>r.status===200)&&new Set(replies.map(r=>r.data.data.id)).size===1&&await count()===before+1);
  const r=await post(path,body,key);check(path+' sequential replay returns original ID',r.status===200&&r.data.data.id===replies[0].data.data.id&&await count()===before+1);
  const changed={...body,...(path==='schedules'?{title:'different'}:path==='read-later'?{url:'https://example.com/different'}:path==='capture'?{text:'different'}:{content:'different'})};
  check(path+' key reuse with changed request conflicts',(await post(path,changed,key)).status===409&&await count()===before+1);
 }
 const original=await post('events',{content:'edit and delete fixture',occurred_at:stamp},'edit-delete');const id=original.data.data.id;
 await sql('UPDATE blocks SET content=? WHERE id=?','human edit',id);
 const edited=await post('events',{content:'edit and delete fixture',occurred_at:stamp},'edit-delete');check('replay returns saved snapshot without overwriting human edit',edited.data.data.content==='edit and delete fixture'&&(await first('SELECT content FROM blocks WHERE id=?',id)).content==='human edit');
 await sql('DELETE FROM blocks WHERE id=?',id);const beforeDeleteReplay=await count();const deleted=await post('events',{content:'edit and delete fixture',occurred_at:stamp},'edit-delete');check('deleted post is never recreated',deleted.status===200&&deleted.data.data.id===id&&await count()===beforeDeleteReplay);
 const crossBody={content:'cross surface fixture',occurred_at:stamp};const rest=await post('events',crossBody,'cross-surface');
 const mcp=async(name,args)=>http('/mcp',{method:'POST',auth:'token',originHeader:false,body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}});
 check('MCP missing key fails before storage',!!(await mcp('add_event',crossBody)).data.error);
 const mc=await mcp('add_event',{...crossBody,idempotency_key:'cross-surface'});check('MCP shares the same receipt as REST',JSON.parse(mc.data.result.content[0].text).id===rest.data.data.id);
 const browser=async(values,key)=>http('/api/data/blocks',{method:'POST',body:{action:'insert',values,single:!Array.isArray(values)},extraHeaders:key?{'Idempotency-Key':key}:{}});
 const sameBrowser=await browser({...crossBody,category:'event',images:[]},'cross-surface');check('browser shares REST receipt',sameBrowser.data.data.id===rest.data.data.id);
 const beforeBrowser=await count();check('browser missing key fails before storage',(await browser({...crossBody,content:'no-key'})).status===428&&await count()===beforeBrowser);
 const vals=[{category:'task',content:'batch A',occurred_at:stamp},{category:'task',content:'batch B',occurred_at:stamp}];
 const batches=await Promise.all([browser(vals,'batch-key'),browser(vals,'batch-key')]);check('browser batch replay is atomic',batches.every(r=>r.status===200)&&JSON.stringify(batches[0].data.data)===JSON.stringify(batches[1].data.data)&&await count()===beforeBrowser+2);
 const beforeInvalid=await count();const bad=await browser([{category:'event',content:'must roll back',occurred_at:stamp},{category:'event',content:'future rejected',occurred_at:'2199-01-01T03:00:00Z'}],'bad-batch');check('failed second row rolls back all inserts and receipt',bad.status===400&&await count()===beforeInvalid&&!(await first('SELECT key FROM block_create_receipts WHERE key=?','bad-batch')));
 const distinctBody={content:'intentionally repeated fixture',occurred_at:stamp};const distinct=await Promise.all([post('events',distinctBody,'intent-1'),post('events',distinctBody,'intent-2')]);check('distinct IDs allow intentional identical posts',distinct.every(r=>r.status===200)&&distinct[0].data.data.id!==distinct[1].data.data.id);
 const tools=(await http('/mcp',{method:'POST',auth:'token',originHeader:false,body:{jsonrpc:'2.0',id:7,method:'tools/list'}})).data.result.tools;check('all five creation tools advertise a required key',tools.filter(t=>t.name.startsWith('add_')).length===5&&tools.filter(t=>t.name.startsWith('add_')).every(t=>t.inputSchema.required.includes('idempotency_key')));
 const image=async(key,text='image fixture')=>{const response=await mf.dispatchFetch(origin+'/api/capture-image',{method:'POST',headers:{Authorization:'Bearer '+machine,...(key?{'Idempotency-Key':key}:{}),'Content-Type':'image/png'},body:text});return{status:response.status,data:await response.json()};};
 const beforeImage=await count();check('capture-image without key cannot upload or insert',(await image()).status===428&&await count()===beforeImage);
 const im1=await image('image-key'),im2=await image('image-key');check('capture-image replays original image URL and ID',im1.status===200&&im2.status===200&&im1.data.data.id===im2.data.data.id&&im1.data.data.image_url===im2.data.data.image_url&&await count()===beforeImage+1);check('changed image with same key is rejected',(await image('image-key','changed image bytes')).status===409);
 const large=Array.from({length:100},(_,i)=>({category:'task',content:'large batch '+i,occurred_at:stamp}));const largeBefore=await count();const largeFirst=await browser(large,'large-batch'),largeRetry=await browser(large,'large-batch');check('100-row batch stays within D1 parameter limits and replays in order',largeFirst.status===200&&largeRetry.status===200&&largeFirst.data.data.length===100&&JSON.stringify(largeFirst.data.data)===JSON.stringify(largeRetry.data.data)&&await count()===largeBefore+100);
 const concurrentImages=await Promise.all([image('parallel-image','parallel bytes'),image('parallel-image','parallel bytes')]);check('concurrent capture-image retry creates one block and one object URL',concurrentImages.every(r=>r.status===200)&&concurrentImages[0].data.data.id===concurrentImages[1].data.data.id&&concurrentImages[0].data.data.image_url===concurrentImages[1].data.data.image_url);
 const legacyRequest={content:'legacy receipt fixture',occurred_at:stamp,images:[]};const legacyBlock={id:'old-deleted-fixture',content:legacyRequest.content,occurred_at:stamp,images:[]};await sql('INSERT INTO event_api_receipts(user_id,key,request,response,created_at)VALUES(?,?,?,?,?)',owner,'legacy-retained',JSON.stringify(Object.fromEntries(Object.entries(legacyRequest).sort(([a],[b])=>a.localeCompare(b)))),JSON.stringify({block:legacyBlock,date:'1999-01-02',replayed:false}),new Date().toISOString());
 const legacyBefore=await count();const oldRest=await post('events',legacyRequest,'legacy-retained');check('pre-existing legacy receipt replays without recreating deleted data',oldRest.status===200&&oldRest.data.data.id===legacyBlock.id&&await count()===legacyBefore);const oldBrowser=await browser({...legacyRequest,category:'event'},'legacy-retained');check('browser also honors pre-existing legacy receipt',oldBrowser.status===200&&oldBrowser.data.data.id===legacyBlock.id&&await count()===legacyBefore);
 const report={at:new Date().toISOString(),checks:checks.length,passed:checks};await writeFile('.migration-backups/retry-fix/idempotency-tests.json',JSON.stringify(report,null,2),{mode:0o600});console.log('Idempotency regression checks passed:',checks.length);
}finally{await mf.dispose();}
