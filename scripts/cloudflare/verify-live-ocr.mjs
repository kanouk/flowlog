/** Real selected OCR model, fictional canvas image and unused fixture date only. */
import {qaSession} from './qa-session.mjs';
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const s=await qaSession(),day='1995-01-02';
async function call(path,body){const form=body instanceof FormData;const r=await fetch(s.base+path,{method:'POST',headers:{Cookie:s.cookie,Origin:s.base,...(form?{}:{'Content-Type':'application/json'})},body:form?body:JSON.stringify(body)});return{status:r.status,body:await r.json()};}
const data=(table,body)=>call('/api/data/'+table,body);
const browser=await chromium.launch({headless:true});let entryId,blockId,path;
try{
 const before=await data('entries',{action:'select',filters:[{column:'date',op:'eq',value:day}]});assert.equal(before.body.data.length,0);
 const page=await browser.newPage();
 const encoded=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=500;c.height=150;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,c.width,c.height);g.fillStyle='black';g.font='bold 64px sans-serif';g.fillText('TEST 123',30,95);return c.toDataURL('image/png').split(',')[1];});
 const form=new FormData();form.append('file',new File([Buffer.from(encoded,'base64')],'fictional-ocr.png',{type:'image/png'}));
 const upload=await call('/api/images',form);assert.equal(upload.status,200);path=upload.body.path;
 const entry=await data('entries',{action:'insert',values:{date:day},single:true});assert.equal(entry.status,200);entryId=entry.body.data.id;
 const image=s.base+'/media/block-images/'+path;
 const block=await data('blocks',{action:'insert',values:{entry_id:entryId,content:'Fictional OCR rehearsal',category:'thought',occurred_at:day+'T03:00:00Z',images:[image]},single:true});assert.equal(block.status,200);blockId=block.body.data.id;
 const result=await call('/api/functions/ocr-image',{block_id:blockId,image_urls:[image]});
 const recognized=result.status===200&&/TEST\s*123/i.test(result.body.extracted_text||'');
 const row=await data('blocks',{action:'select',filters:[{column:'id',op:'eq',value:blockId}],single:true});
 const saved=row.body.data?.extracted_text===result.body.extracted_text;
 await writeFile('.migration-backups/live-ocr-verification.json',JSON.stringify({at:new Date().toISOString(),scope:'fictional-TEST-123-image',status:result.status,recognized,saved,streamedPrivateR2:true},null,2),{mode:0o600});
 assert.ok(recognized&&saved,'Real OCR did not recognize and persist fictional text');
 console.log('PASS real selected OCR model: fictional image text recognized and saved.');
}finally{
 await browser.close();
 if(blockId)await data('blocks',{action:'delete',filters:[{column:'id',op:'eq',value:blockId}]});
 if(entryId)await data('entries',{action:'delete',filters:[{column:'id',op:'eq',value:entryId}]});
 if(path)await call('/api/images/delete',{paths:[path]});
}
