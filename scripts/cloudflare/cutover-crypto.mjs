/** Private migration files only. Never prints credentials or plaintext records. */
import {readFile,writeFile} from 'node:fs/promises';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const [operation,input,output,keyPath]=process.argv.slice(2);
if(!['seal','unseal'].includes(operation))throw Error('Invalid operation');
const key=Buffer.from((await readFile(keyPath,'utf8')).trim(),'base64');
if(key.length!==32)throw Error('Invalid key');
function transform(v){
 if(!v)return v;
 if(operation==='unseal'){
  if(!v.startsWith('enc:v1:'))throw Error('Expected encrypted staging credential');
  const [,,iv,data]=v.split(':'),ciphertext=Buffer.from(data,'base64');
  const d=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64'));
  d.setAuthTag(ciphertext.subarray(-16));return Buffer.concat([d.update(ciphertext.subarray(0,-16)),d.final()]).toString('utf8');
 }
 if(v.startsWith('enc:v1:'))throw Error('Refusing double encryption');
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([c.update(v,'utf8'),c.final(),c.getAuthTag()]);
 return 'enc:v1:'+iv.toString('base64')+':'+encrypted.toString('base64');
}
const tables={user_ai_api_keys:['api_key'],user_external_tokens:['token'],user_image_storage_settings:['gyazo_token'],user_ai_settings:['openai_api_key','anthropic_api_key','google_api_key']};
const data=JSON.parse(await readFile(input,'utf8'));
for(const [table,fields]of Object.entries(tables))for(const row of data[table]||[])for(const field of fields)if(row[field])row[field]=transform(row[field]);
await writeFile(output,JSON.stringify(data),{mode:0o600});
