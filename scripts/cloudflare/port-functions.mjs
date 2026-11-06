import ts from 'typescript';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const names=['api','mcp-server','ocr-image','summarize-url','test-ai-connection','gyazo-upload','gyazo-delete','save-image-storage-settings','raindrop-sync','format-entries'];
const manifest=[];
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
const formatted=(path,code)=>printer.printFile(ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true));
for(const name of names) {
  const path=`supabase/functions/${name}/index.ts`;
  const source=await readFile(path,'utf8');
  // These ports now own the Cloudflare-only durable post-ID contract.
  // Keep them maintained explicitly rather than restoring unsafe legacy INSERTs.
  if (['api','mcp-server'].includes(name)) {
    manifest.push({name,source:path,sha256:createHash('sha256').update(source).digest('hex'),maintained:true});
    continue;
  }
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  const imports=[];const pieces=[];
  for(const node of ast.statements) {
    if(ts.isImportDeclaration(node)) {
      const target=node.moduleSpecifier.text;
      if(target.includes('supabase-js') || target.includes('std@') || target.includes('edge-runtime'))continue;
      imports.push(node.getText(ast).replace(/https:\/\/deno.land\/x\/hono[^"']+/, 'hono'));
    } else if(ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && ['Deno.serve','serve'].includes(node.expression.expression.getText(ast))) {
      pieces.push('return '+node.expression.arguments[0].getText(ast)+';');
    } else pieces.push(node.getText(ast).replace(/^export const app/,'const app'));
  }
  let body=pieces.join('\n\n').replaceAll('/functions/v1/mcp-server','/mcp').replaceAll('/functions/v1/api','/api');
  body=body.replace(/async function authenticateUser\(([^)]*)\): Promise<string \| null> \{/, 'async function authenticateUser($1): Promise<string | null> {\n  if (actor) return actor;');
  if(name==='mcp-server') {
    const marker='// 認可コードを削除（一度だけ使用可能）';
    const start=body.indexOf(marker);
    const pos=body.indexOf('await supabase.from("oauth_authorization_codes").delete().eq("id", authCode.id);',start);
    if(pos<0)throw Error('OAuth one-use block not found');
    const old='await supabase.from("oauth_authorization_codes").delete().eq("id", authCode.id);';
    body=body.slice(0,pos)+body.slice(pos).replace(old,`const consumed = await supabase.from("oauth_authorization_codes").delete().eq("id", authCode.id).select('id').maybeSingle();
  if (consumed.error || !consumed.data) return new Response(JSON.stringify({error:'invalid_grant'}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}});`);
  }
  if(name==='test-ai-connection') {
    const start=body.indexOf("const response = await fetch('https://api.anthropic.com/v1/messages'");
    const end=body.indexOf("    if (response.ok)",start);
    if(start<0||end<0)throw Error('Anthropic connectivity test missing');
    body=body.slice(0,start)+`const response=await fetch('https://api.anthropic.com/v1/models',{method:'GET',headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01'}});\n`+body.slice(end);
    body=body.replace('function testProvider(provider: string, apiKey: string) {',`async function testProvider(provider: string, apiKey: string, model?:string) {
      if(model){
        const id=encodeURIComponent(model.replace(/^models\\//,''));
        const url=provider==='google'?'https://generativelanguage.googleapis.com/v1beta/models/'+id+'?key='+encodeURIComponent(apiKey):provider==='anthropic'?'https://api.anthropic.com/v1/models/'+id:'https://api.openai.com/v1/models/'+id;
        const headers:Record<string,string>=provider==='anthropic'?{'x-api-key':apiKey,'anthropic-version':'2023-06-01'}:provider==='openai'?{'Authorization':'Bearer '+apiKey}:{};
        const response=await fetch(url,{method:'GET',headers});
        return {success:response.ok,message:response.ok?'指定モデルの参照を確認しました。生成結果の確認は別途必要です。':'指定モデルを確認できませんでした ('+response.status+')'};
      }
    `);
    body=body.replace(".select('provider, api_key_id')",".select('provider, api_key_id, model_name')");
    const mode3=body.indexOf('// Mode 3:');
    body=body.slice(0,mode3)+body.slice(mode3).replace('testProvider(keyRecord.provider, keyRecord.api_key)','testProvider(keyRecord.provider, keyRecord.api_key, model.model_name)');
  }
  if(name==='summarize-url') {
    const parsed=ts.createSourceFile('summary.ts',body,ts.ScriptTarget.Latest,true);
    const old=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='callLovableAI');
    if(!old)throw Error('Summary gateway block missing');
    body=body.slice(0,old.pos)+body.slice(old.end);
    body=body.replace("return callLovableAI('google/gemini-2.5-flash', systemPrompt, userPrompt);","throw new Error('AI設定でURL要約のモデルとAPIキーを指定してください');");
    body=body.replace("if (data.error && data.error.includes('not currently supported'))", "const providerError=typeof data.error==='string'?data.error:data.error?.message;\nif (providerError && providerError.includes('not currently supported'))");
    body=body.replace("throw new Error(data.error || `ページの取得に失敗しました (${response.status})`);", "throw new Error(`ページの取得に失敗しました (${response.status})`);");
    // Do not spend a scrape request on another owner's block or disabled feature.
    body=body.replace("console.log('Summarizing URL:', url);","const owned=await serviceClient.from('blocks').select('id').eq('id',blockId).eq('user_id',userId).maybeSingle(); if(!owned.data)return new Response(JSON.stringify({error:'Block not found'}),{status:404,headers:{'Content-Type':'application/json'}}); if(featureConfig?.enabled===false)throw new Error('URL要約は無効です');\nconsole.log('Summarizing URL:', url);");
  }
  if(name==='raindrop-sync') {
    // A real-provider rehearsal can inspect the result without importing any
    // personal bookmarks or changing a diary/sync timestamp.
    const start=body.indexOf("// Get user's entry for today");
    const end=body.indexOf('// Fetch raindrops from API',start);
    const createEntry=body.slice(start,end);
    if(start<0||end<0)throw Error('Raindrop entry block missing');
    body=body.slice(0,start)+body.slice(end);
    body=body.replace("// Filter out already imported URLs and insert new ones",`if(body.dry_run===true){
      const seen=new Set(existingUrls);let pending=0;
      for(const item of allRaindrops){if(item.link&&!seen.has(item.link)){seen.add(item.link);pending++;}}
      return new Response(JSON.stringify({success:true,dry_run:true,fetched:allRaindrops.length,pending,imported:0,mode}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
    }
    ${createEntry}
    // Filter out already imported URLs and insert new ones`);
  }
  if(name==='api')body=body.replace('occurred_at: body.starts_at,','occurred_at: Date.parse(body.starts_at)>Date.now()?new Date().toISOString():body.starts_at,').replace('p_user_id:userId});\n  if(activeError)','p_user_id:userId,p_date:date});\n  if(activeError)');
  if(name==='ocr-image') {
    body=body.replace('image_url: { url }','image_url: { url: await dataImageURL(env,user.id,url) }');
    body=body.replace('parts.push({ text: `[画像URL: ${url}]` });','parts.push(await inlineGoogleImage(env,user.id,url));');
    const oldStart=body.indexOf('    } else {\n      // Lovable AI (default)');
    const oldEnd=body.indexOf('\n\n    if (!aiResponse.ok)',oldStart);
    if(oldStart<0||oldEnd<0)throw Error('OCR default block missing');
    body=body.slice(0,oldStart)+`    } else if(useProvider==='anthropic' && useApiKey) {
      const content:unknown[]=[];
      for(const url of image_urls){const image=await inlineGoogleImage(env,user.id,url);content.push({type:'image',source:{type:'base64',media_type:image.inline_data.mime_type,data:image.inline_data.data}});}
      content.push({type:'text',text:userContent[userContent.length-1].text});
      aiResponse=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':useApiKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:useModel,max_tokens:4096,system:systemPrompt,messages:[{role:'user',content}]})});
    } else { throw new Error('AI設定でOCRのモデルとAPIキーを指定してください'); }`+body.slice(oldEnd);
    body=body.replace("if (useProvider === 'google' && useApiKey) {\n      extractedText","if(useProvider==='anthropic'){extractedText=(aiData.content||[]).filter((part:{type:string})=>part.type==='text').map((part:{text:string})=>part.text).join('');} else if (useProvider === 'google' && useApiKey) {\n      extractedText");
    body=body.replace('// Determine which provider/model/key to use',"if(featureConfig?.enabled===false)throw new Error('OCRは無効です');\n    // Determine which provider/model/key to use");

  }
  if(name==='ocr-image') {
    // Image JSON is streamed from R2; avoid two copies of five large base64
    // images and another giant UTF-16 JSON string inside the Worker.
    const start=body.indexOf('    const userContent:');
    const end=body.indexOf('    // Determine which provider/model/key to use',start);
    if(start<0||end<0)throw Error('OCR image content block missing');
    const promptStart=body.indexOf('      text: image_urls.length > 1',start);
    const promptEnd=body.indexOf('    });',promptStart);
    const promptExpression=body.slice(promptStart+'      text: '.length,promptEnd).trim().replace(/,$/,'');
    body=body.slice(0,start)+"    if(featureConfig?.enabled===false)throw new Error('OCRは無効です');\n"+'    const imagePrompt = '+promptExpression+';\n'+body.slice(end);
    const responseStart=body.indexOf('    let aiResponse: Response;');
    const responseEnd=body.indexOf('    if (!aiResponse.ok)',responseStart);
    body=body.slice(0,responseStart)+"    const aiResponse=await streamOCRRequest(env,user.id,useProvider,useModel,useApiKey,systemPrompt,imagePrompt,image_urls,fetch);\n\n"+body.slice(responseEnd);
  }
  if(['ocr-image','summarize-url'].includes(name)) {
    // The generic outbound guard also rejects the removed gateway path. Keep
    // the original assigned-provider branches; never substitute a default.
    body=body.replaceAll('https://ai.gateway.lovable.dev/v1/chat/completions','https://disabled.invalid/lovable-ai-gateway');
  }
  body=body.replace(/async \(req\)/g,'async (req: Request)').replace(/\.json\(\)/g,'.json<LegacyJSON>()');
  const header=`// Ported from ${path}; source behaviour retained except documented runtime/security adaptations.\n`;
  const factory=`import type { Env } from '../../auth';
import { createServerClient } from '../../database';
import { guardedFetch } from '../../outbound';
${name==='ocr-image'?"import { streamOCRRequest } from '../../ocr-images';":''}
${imports.join('\n')}
// Explicit boundary type retains the original Deno JSON contracts. Request validation remains in each handler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LegacyJSON = any;
export function createHandler(env: Env, actor: string | null, ctx: Pick<ExecutionContext, 'waitUntil'>, delegate: typeof globalThis.fetch = globalThis.fetch) {
  const fetch = guardedFetch(env,delegate);
  const runtime: Record<string,string|undefined>={...env as unknown as Record<string,string>,SUPABASE_URL:env.APP_ORIGIN,SUPABASE_SERVICE_ROLE_KEY:'worker-owner',SUPABASE_ANON_KEY:'worker-owner',FLOWLOG_APP_URL:env.APP_ORIGIN,SITE_URL:env.APP_ORIGIN,SUPABASE_SITE_URL:env.APP_ORIGIN,LOVABLE_API_KEY:undefined};
  const Deno={env:{get:(key:string)=>runtime[key]}};
  const createClient=(..._args:unknown[])=>createServerClient(env,env.OWNER_ID,actor);
  const waitUntil=(promise:PromiseLike<unknown>)=>ctx.waitUntil(Promise.resolve(promise));
  const console={log:(..._args:unknown[])=>{},warn:(..._args:unknown[])=>{},error:(..._args:unknown[])=>{}};
  ${body}
}
`;
  await mkdir(`worker/ported/${name}`,{recursive:true});
  await writeFile(`worker/ported/${name}/index.ts`,formatted(name+'.ts',header+factory));
  manifest.push({name,source:path,sha256:createHash('sha256').update(source).digest('hex')});
}
for(const relative of ['_shared/cors.ts','api/native-images.ts','format-entries/legacy-handler.ts','format-entries/score-parser.ts']) {
  await mkdir('worker/ported/'+relative.slice(0,relative.lastIndexOf('/')),{recursive:true});
  await writeFile('worker/ported/'+relative,await readFile('supabase/functions/'+relative));
}
let diary=await readFile('supabase/functions/format-entries/diary.ts','utf8');
diary=diary.replace('"npm:date-fns@3"','"date-fns"').replace('"npm:date-fns-tz@3"','"date-fns-tz"').replace('"https://esm.sh/@supabase/supabase-js@2.89.0"','"@supabase/supabase-js"');
const ast=ts.createSourceFile('diary.ts',diary,ts.ScriptTarget.Latest,true);
const gateway=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='callLovableAI');
if(!gateway)throw Error('Gateway implementation not found');
diary=diary.slice(0,gateway.pos)+diary.slice(gateway.end);
diary=diary.replace('return callLovableAI("google/gemini-2.5-flash", systemPrompt, userPrompt);','throw new Error("Configured AI model and key required");');
diary=diary.replace(String.raw`/^## .+\n(?=## |\s*$)/gm`,String.raw`/^## .+\n(?=\s*(?:^## |(?![\s\S])))/gm`);
diary=diary.replace(String.raw`(?=^## |\s*$)/gm`,String.raw`(?=^## |(?![\s\S]))/gm`);
diary=diary.replace(/\.json\(\)/g,'.json<LegacyJSON>()');
diary='// eslint-disable-next-line @typescript-eslint/no-explicit-any\ntype LegacyJSON = any;\nconst console={log:(..._args:unknown[])=>{},warn:(..._args:unknown[])=>{},error:(..._args:unknown[])=>{}};\n'+diary;
const diaryAst=ts.createSourceFile('diary.ts',diary,ts.ScriptTarget.Latest,true);
const diaryImports=[],diaryTypes=[],diaryBody=[];
for(const node of diaryAst.statements) {
 const code=node.getText(diaryAst);
 if(ts.isImportDeclaration(node))diaryImports.push(code);
 else if((ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node))&&node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))diaryTypes.push(code);
 else diaryBody.push((code==='type LegacyJSON = any;'?'// eslint-disable-next-line @typescript-eslint/no-explicit-any\n':'')+code.replace(/^export /,''));
}
diary=`import type {Env} from '../../auth';\nimport {guardedFetch} from '../../outbound';\n${diaryImports.join('\n')}\n${diaryTypes.join('\n')}\nexport function createDiaryRuntime(env:Env,delegate:typeof globalThis.fetch=globalThis.fetch) {\nconst fetch=guardedFetch(env,delegate);\n${diaryBody.join('\n')}\nreturn {getFeatureConfig,generateDiaryText,generateDiaryScore};\n}`;
await writeFile('worker/ported/format-entries/diary.ts',formatted('diary.ts',diary));
for(const path of ['supabase/functions/diary-worker/worker.ts','supabase/functions/format-entries/diary.ts','supabase/functions/_shared/cors.ts','supabase/functions/api/native-images.ts'])manifest.push({name:path.split('/').slice(-2).join('/'),source:path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
await writeFile('worker/ported/source-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Generated handlers:',names.length-2,'; manually maintained API/MCP:',2,'; diary worker orchestration uses the dedicated D1/Queue implementation.');
