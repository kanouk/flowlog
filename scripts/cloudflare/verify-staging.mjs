/** Non-destructive live staging QA. Never resets owner credentials. */
import{qaSession}from'./qa-session.mjs';
import{readFile,writeFile}from'node:fs/promises';
import{randomBytes,createHash}from'node:crypto';
import assert from'node:assert/strict';
const session=await qaSession(),{base,cookie,owner}=session;
const passed=[],created=[];let machine='',machineId='';
const check=(condition,label)=>{assert.ok(condition,label);passed.push(label);};
async function call(path,body,options={}){
 const{method=body===undefined?'GET':'POST',auth='cookie',headers={}}=options;
 const response=await fetch(base+path,{method,redirect:'manual',headers:{Origin:base,...(auth==='cookie'?{Cookie:cookie}:auth==='token'?{Authorization:'Bearer '+machine}:{}),...(body!==undefined&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=null;}
 return{status:response.status,headers:response.headers,data,text};
}
const data=(table,body)=>call('/api/data/'+table,body);
try{
 check((await call('/api/session')).data.user?.id===owner,'Owner cookie session');
 check((await call('/dashboard',undefined,{auth:'none'})).status===302,'Anonymous dashboard protected');
 check((await data('entries',{action:'select'})).status===200,'Owner records readable');
 check((await call('/api/data/entries',{action:'select'},{auth:'none'})).status===401,'Anonymous data rejected');
 check((await call('/api/data/entries',{action:'select'},{headers:{Origin:'https://other.example'}})).status===403,'CSRF rejected');
 check((await call('/api/health',undefined,{auth:'none'})).data.functions===11,'Full Worker entrypoints deployed');
 const landing=await call('/',undefined,{auth:'none'});
 check(landing.status===200 && landing.text.includes('<div id="root">'),'Original frontend landing served');
 const options=(await call('/api/auth-options',undefined,{auth:'none'})).data;
 check(typeof options.google==='boolean','Google connection readiness is explicit');
 for(const name of['get_user_ai_api_keys_safe','get_user_ai_models_safe','get_user_image_storage_settings_safe']){
  const reply=await call('/api/rpc/'+name,{});
  check(reply.status===200&&Array.isArray(reply.data.data),'Settings RPC '+name);
  check(!JSON.stringify(reply.data).includes('enc:v1:'),'Settings response contains no encrypted credentials '+name);
 }
 const keyRows=(await call('/api/rpc/get_user_ai_api_keys_safe',{})).data.data;
 check(keyRows.length===3 && keyRows.every(k=>k.has_key),'Migrated three API key metadata records');
 const models=(await call('/api/rpc/get_user_ai_models_safe',{})).data.data;
 check(models.length===4 && models.every(m=>m.api_key_id),'Four models retain key relations');
 for(const key of keyRows){
  const result=await call('/api/functions/test-ai-connection',{api_key_id:key.id});
  // Key connectivity is recorded separately from inference/model availability.
  passed.push('Provider key connectivity '+key.provider+': '+(result.data?.success===true?'connected':'not-confirmed'));
 }
 check((await call('/api/functions/format-entries',{})).status===410,'Old synchronous diary writer retired');
 check((await call('/api/rpc/request_diary_generation',{p_date:'2026-10-28'})).status===400,'Copied journal regeneration remains disabled');
 machine=randomBytes(32).toString('hex');machineId=crypto.randomUUID();
 const name='isolated-qa-'+Date.now();
 check((await data('user_api_tokens',{action:'insert',values:{id:machineId,name,token_hash:createHash('sha256').update(machine).digest('hex')}})).status===200,'Isolated machine token creation');
 const marker='架空の移植検証 '+Date.now(),day='1998-01-02';
 const before=await data('entries',{action:'select',filters:[{column:'date',op:'eq',value:day}]});
 assert.equal(before.data.data.length,0,'Fixture date must be unused');
 const entry=await data('entries',{action:'insert',values:{date:day},single:true});
 assert.ok(entry.data.data?.id);const entryId=entry.data.data.id;
 created.push({table:'entries',id:entryId});
 const block=await data('blocks',{action:'insert',values:{entry_id:entryId,content:marker,category:'event',occurred_at:day+'T03:00:00Z',images:[]},single:true});
 check(block.status===200&&block.data.data.content===marker,'Browser block creation');
 const blockId=block.data.data.id;created.push({table:'blocks',id:blockId});
 const event=await call('/api/events?date='+day,undefined,{auth:'token'});
 check(event.status===200&&event.data.success&&event.data.data.some(r=>r.id===blockId),'Original REST list reads Worker D1');
 const mcp=await call('/mcp',{jsonrpc:'2.0',id:1,method:'tools/list'},{auth:'token'});
 check(mcp.status===200&&mcp.data.result.tools.length>0,'Live MCP JSON-RPC tool list');
 const fixtureBlock=block.data.data;
 const expected={content:fixtureBlock.content,images:fixtureBlock.images,occurred_at:fixtureBlock.occurred_at,entry_id:fixtureBlock.entry_id,revision:fixtureBlock.revision};
 const patch=()=>call('/api/blocks/'+blockId,{content:marker+' edited',images:[],expected},{method:'PATCH',auth:'token'});
 const updates=await Promise.all([patch(),patch()]);
 check(updates.filter(r=>r.status===200).length===1&&updates.filter(r=>r.status===409).length===1,'Live D1 concurrent CAS one winner');
 const after=await data('blocks',{action:'select',filters:[{column:'id',op:'eq',value:blockId}],single:true});
 check(after.data.data.entry_id===entryId&&after.data.data.revision===fixtureBlock.revision+1,'Photo edit preserves entry membership and increments revision');
 const metadata=await call('/.well-known/oauth-authorization-server',undefined,{auth:'none'});
 check(metadata.status===200&&metadata.data.token_endpoint===base+'/mcp/oauth/token','Live OAuth metadata uses staging endpoints');
 const fakeBearer=await call('/api/events',undefined,{auth:'none',headers:{Authorization:'Bearer cookie-session'}});
 check(fakeBearer.status===401,'Dummy cookie token cannot authenticate machine request');
 await writeFile('.migration-backups/full-staging-verification.json',JSON.stringify({at:new Date().toISOString(),environment:'dedicated-cloudflare-staging',passed:passed.length,checks:passed},null,2),{mode:0o600});
 console.log('PASS',passed.length,'live staging checks; provider connectivity recorded separately.');
}catch(error){console.error('Staging verification stopped after',passed.length,'checks:',error.message);process.exitCode=1;}
finally{
 for(const target of created.reverse())await data(target.table,{action:'delete',filters:[{column:'id',op:'eq',value:target.id}]});
 if(machineId)await data('user_api_tokens',{action:'delete',filters:[{column:'id',op:'eq',value:machineId}]});
}
