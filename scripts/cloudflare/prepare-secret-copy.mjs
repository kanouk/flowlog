/** Decrypt the read-only source transport and immediately re-encrypt credentials
 * with the staging-only Worker key. Never writes plaintext credentials. */
import{readFile,writeFile,chmod,unlink}from'node:fs/promises';
import{createDecipheriv,createCipheriv,randomBytes}from'node:crypto';
const root='.migration-backups/';
let key;
try{key=Buffer.from(await readFile(root+'encryption-key','utf8'),'base64');}
catch{key=randomBytes(32);await writeFile(root+'encryption-key',key.toString('base64'),{mode:0o600});}
if(key.length!==32)throw Error('Invalid staging encryption key');
const transport=Buffer.from(await readFile(root+'transport-key','utf8'),'hex');
const decipher=createDecipheriv('aes-256-cbc',transport,Buffer.alloc(16));
const input=await readFile(root+'encrypted-source-settings','utf8');
const source=JSON.parse(Buffer.concat([decipher.update(Buffer.from(input,'base64')),decipher.final()]).toString('utf8'));
function seal(value){if(!value)return value;const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);return'enc:v1:'+iv.toString('base64')+':'+data.toString('base64');}
for(const row of source.keys)row.api_key=seal(row.api_key);
for(const row of source.external)row.token=seal(row.token);
if(source.image?.gyazo_token)source.image.gyazo_token=seal(source.image.gyazo_token);
for(const field of ['openai_api_key','anthropic_api_key','google_api_key'])if(source.settings?.[field])source.settings[field]=seal(source.settings[field]);
await writeFile(root+'staging-secret-copy.json',JSON.stringify(source),{mode:0o600});
await chmod(root+'staging-secret-copy.json',0o600);
console.log(JSON.stringify({encryptedKeys:source.keys.length,models:source.models.length,externalTokens:source.external.length,imageSettings:!!source.image,plaintextCredentialFiles:0}));
