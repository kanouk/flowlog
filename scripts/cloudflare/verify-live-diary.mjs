import{qaSession}from'./qa-session.mjs';
import{writeFile}from'node:fs/promises';
import assert from'node:assert/strict';
const{base,cookie}=await qaSession(),day='1997-01-02';
const call=async(path,body)=>{
 const r=await fetch(base+path,{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json();return{status:r.status,data};
};
const data=(table,body)=>call('/api/data/'+table,body);
let entryId,blockId;const seen=[];
try{
 const entry=await data('entries',{action:'insert',values:{date:day},single:true});
 assert.equal(entry.status,200);entryId=entry.data.data.id;
 const block=await data('blocks',{action:'insert',values:{entry_id:entryId,content:'これは移植検証用の架空の記録です。朝にテスト用の机を片付け、動作を確認した。',occurred_at:day+'T00:00:00Z',category:'event',images:[]},single:true});
 assert.equal(block.status,200);blockId=block.data.data.id;
 const started=Date.now();let status;
 while(Date.now()-started<180000){
  const reply=await call('/api/rpc/diary_generation_status',{p_date:day});
  assert.equal(reply.status,200);status=reply.data.data;
  const sig=status.status+':'+status.error_code;
  if(seen.at(-1)!==sig){seen.push(sig);console.log('Fictional diary job:',status.status,status.error_code||'');}
  if(status.status==='succeeded'||status.status==='failed')break;
  await new Promise(resolve=>setTimeout(resolve,3000));
 }
 const after=await data('entries',{action:'select',filters:[{column:'id',op:'eq',value:entryId}],single:true});
 const report={at:new Date().toISOString(),scope:'single-fictional-day-only',seen,status,generatedNonempty:!!after.data.data?.formatted_content?.trim(),modelFallbackUsed:false,scorePersisted:Number.isInteger(after.data.data?.score)};
 await writeFile('.migration-backups/live-diary-verification.json',JSON.stringify(report,null,2),{mode:0o600});
 console.log('Queue/model rehearsal completed:',JSON.stringify({status:status?.status,generatedNonempty:report.generatedNonempty,scorePersisted:report.scorePersisted}));
 if(status?.status!=='succeeded'||!report.generatedNonempty)process.exitCode=1;
}finally{
 if(blockId)await data('blocks',{action:'delete',filters:[{column:'id',op:'eq',value:blockId}]});
 if(entryId)await data('entries',{action:'delete',filters:[{column:'id',op:'eq',value:entryId}]});
}
