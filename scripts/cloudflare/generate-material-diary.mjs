/** Explicit operator generation, using the same selector/runtime as the Worker.
 * No production writes. Configuration and keys never leave private files. */
import {readFile,writeFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createDiaryRuntime} from '../../worker/ported/format-entries/diary.ts';
import {createServerClient} from '../../worker/database.ts';
import {readDiaryMaterials} from '../../worker/diary-materials.ts';
const [inputPath,outputPath]=process.argv.slice(2);
try {
 const input=JSON.parse(await readFile(inputPath,'utf8')),db=new DatabaseSync(':memory:');
 for(const [table,definition] of Object.entries(input.schema)) {
  if(!['blocks','user_ai_settings','user_ai_models','user_ai_api_keys','user_ai_feature_settings'].includes(table))continue;
  if(!definition.every(c=>/^[a-z_]+$/.test(c.name)))throw Error('Invalid schema');
  db.exec('CREATE TABLE '+table+'('+definition.map(c=>c.name+' '+(c.type==='INTEGER'?'INTEGER':'TEXT')).join(',')+')');
  for(const row of table==='blocks'?input.blocks:input.config[table]) {
   const fields=Object.keys(row);db.prepare('INSERT INTO '+table+'('+fields.join(',')+')VALUES('+fields.map(()=>'?').join(',')+')').run(...fields.map(k=>row[k]));
  }
 }
 const binding={prepare(sql){
  if(!/^SELECT\b/i.test(sql.trim()))throw Error('Read-only binding');
  let params=[];return {bind(...v){params=v;return this;},async all(){return {results:db.prepare(sql).all(...params)};},async first(){return db.prepare(sql).get(...params)||null;}};
 }};
 const env={DB:binding,OWNER_ID:input.owner,OWNER_EMAIL:'',ENVIRONMENT:'production',APP_ORIGIN:'https://flowlog.jp',ENCRYPTION_KEY:(await readFile(input.encryption_key_file,'utf8')).trim()};
 let calls=0;const usage=[];
 const observedFetch=async(url,options)=>{
  if(++calls>2)throw Error('Formatting retry limit');
  const response=await fetch(url,options);
  const data=await response.clone().json().catch(()=>({}));
  usage.push(data.usageMetadata||data.usage||null);
  return response;
 };
 const runtime=createDiaryRuntime(env,observedFetch),client=createServerClient(env,input.owner);
 const config=await runtime.getFeatureConfig(client,input.owner,'diary_format',true);
 if(!config?.enabled||!config.provider||!config.model_name||!config.api_key)throw Error('Configured diary model unavailable');
 const selected=await readDiaryMaterials(env,input.owner,input.date);
 if(!selected.blocks.length)throw Error('No diary materials');
 const result=await runtime.generateDiaryText(selected.blocks,input.date,selected.dayBoundaryHour,config);
 await writeFile(outputPath,JSON.stringify({date:input.date,result,provider:config.provider,model:config.model_name,provider_calls:calls,usage,material_ids:selected.blocks.map(b=>b.id)}),{mode:0o600});
 console.log(JSON.stringify({date:input.date,generated:true,characters:result.formatted_content.length,provider_calls:calls}));
 db.close();
} catch(error) {
 await writeFile(outputPath+'.error',String(error?.stack||error),{mode:0o600});
 console.error('Generation failed; private diagnostics saved');process.exitCode=1;
}
