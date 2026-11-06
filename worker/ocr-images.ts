import type { Env } from './auth';

async function* base64Image(object: R2ObjectBody): AsyncGenerator<string> {
  const reader = object.body.getReader();
  let tail = new Uint8Array(0);
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const joined = new Uint8Array(tail.length + next.value.length);
      joined.set(tail); joined.set(next.value, tail.length);
      const end = joined.length - joined.length % 3;
      // Every intermediate slice is divisible by three: base64 padding is
      // emitted only for the final tail, without buffering the whole image.
      for (let start = 0; start < end; start += 8190) {
        yield btoa(String.fromCharCode(...joined.subarray(start, Math.min(start + 8190, end))));
      }
      tail = joined.slice(end);
    }
    if (tail.length) yield btoa(String.fromCharCode(...tail));
  } finally { reader.releaseLock(); }
}
async function* imageJSON(env: Env, owner: string, source: string, provider: string) {
  const url = new URL(source);
  if (url.origin !== env.APP_ORIGIN || !url.pathname.startsWith('/media/block-images/' + owner + '/')) throw new Error('Owned R2 image required');
  const object = await env.IMAGES.get(decodeURIComponent(url.pathname.slice('/media/block-images/'.length)));
  if (!object || object.size > 10 * 1024 * 1024) throw new Error('Image unavailable or too large');
  const mime = object.httpMetadata?.contentType || 'image/jpeg';
  if (provider === 'openai') yield '{"type":"image_url","image_url":{"url":' + JSON.stringify('data:' + mime + ';base64,').slice(0,-1);
  else if (provider === 'google') yield '{"inline_data":{"mime_type":' + JSON.stringify(mime) + ',"data":"';
  else yield '{"type":"image","source":{"type":"base64","media_type":' + JSON.stringify(mime) + ',"data":"';
  yield* base64Image(object);
  yield '"}}';
}
async function* ocrJSON(env: Env, owner: string, provider: string, model: string, system: string, prompt: string, urls: string[]) {
  if (provider === 'google') yield '{"systemInstruction":{"parts":[{"text":' + JSON.stringify(system) + '}]},"contents":[{"parts":[';
  else if (provider === 'openai') yield '{"model":' + JSON.stringify(model) + ',"messages":[{"role":"system","content":' + JSON.stringify(system) + '},{"role":"user","content":[';
  else yield '{"model":' + JSON.stringify(model) + ',"max_tokens":4096,"system":' + JSON.stringify(system) + ',"messages":[{"role":"user","content":[';
  for (const url of urls) { yield* imageJSON(env, owner, url, provider);yield ','; }
  yield JSON.stringify(provider === 'google' ? {text:prompt} : {type:'text',text:prompt});
  yield provider === 'google' ? ']}]}' : ']}]}';
}
export async function streamOCRRequest(env: Env, owner: string, provider: string, model: string, apiKey: string | null, system: string, prompt: string, urls: string[], fetcher: typeof globalThis.fetch) {
  if (!apiKey || !['openai','google','anthropic'].includes(provider)) throw new Error('AI設定でOCRのモデルとAPIキーを指定してください');
  if (!urls.length || urls.length > 5) throw new Error('画像は1〜5枚を指定してください');
  const iterator = ocrJSON(env,owner,provider,model,system,prompt,urls);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(encoder.encode(next.value));}
      catch(error){controller.error(error);}
    },
    async cancel(){await iterator.return(undefined);},
  });
  const headers: Record<string,string> = {'Content-Type':'application/json'};
  let url: string;
  if(provider==='google')url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model.replace(/^models\//,''))+':generateContent?key='+encodeURIComponent(apiKey);
  else if(provider==='openai'){url='https://api.openai.com/v1/chat/completions';headers.Authorization='Bearer '+apiKey;}
  else{url='https://api.anthropic.com/v1/messages';headers['x-api-key']=apiKey;headers['anthropic-version']='2023-06-01';}
  return fetcher(url,{method:'POST',headers,body,signal:AbortSignal.timeout(60000)});
}
