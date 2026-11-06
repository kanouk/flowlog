// Local-only test harness. Never referenced by the deployment config.
import worker from './index';
import { claimDiary, finishDiary, runDiary, dispatchDiary, jobRpc } from './jobs';
import type { Env } from './auth';
import type { Block } from './ported/format-entries/diary';
import { createHandler as ocr } from './ported/ocr-image';
import { createHandler as summarize } from './ported/summarize-url';
import { createHandler as gyazoUpload } from './ported/gyazo-upload';
import { createHandler as gyazoDelete } from './ported/gyazo-delete';
import { createHandler as raindrop } from './ported/raindrop-sync';
import { createHandler as testAI } from './ported/test-ai-connection';
import { createDiaryRuntime } from './ported/format-entries/diary';
import { readDiaryMaterials } from './diary-materials';
const ctx = { waitUntil: (_promise: Promise<unknown>) => { } };
export default {
    async fetch(request: Request, env: Env, execution: ExecutionContext) {
        const url = new URL(request.url);
        if (!url.pathname.startsWith('/__test/'))
            return worker.fetch(request, env, execution);
        const payload = await request.json() as {
            date: string;
            job: Awaited<ReturnType<typeof claimDiary>>;
            result: {
                formatted_content: string;
            };
            empty: boolean;
            name: string;
            body: unknown;
            response: unknown;
            status?: number;
            provider?: string;
            method?: string;
            responses?: unknown[];
            allowExternalWrites?: boolean; streamOnly?:boolean;
            gyazoSHA?: string;
        };
        const owner = env.OWNER_ID;
        if (url.pathname === '/__test/materials')
            return Response.json(await readDiaryMaterials(env, owner, payload.date));
        if (url.pathname === '/__test/claim')
            return Response.json(await claimDiary(env, owner, payload.date));
        if (url.pathname === '/__test/finish')
            return Response.json(await finishDiary(env, payload.job!, payload.result, payload.empty));
        if (url.pathname === '/__test/run')
            return Response.json(await runDiary(env, owner, payload.date, async () => payload.result));
        if (url.pathname === '/__test/run-input') {
            let input: Block[] = [];
            const status = await runDiary(env, owner, payload.date, async blocks => { input = blocks; return payload.result; });
            return Response.json({ status, input });
        }
        if (url.pathname === '/__test/job-rpc')
            return Response.json(await jobRpc(env, owner, payload.name, payload.body as Record<string, unknown>));
        if (url.pathname === '/__test/dispatch') {
            await dispatchDiary(env);
            return Response.json({ success: true });
        }
        const calls: {
            url: string;
            method: string;
            body: unknown;
        }[] = [];
        const fetchMock: typeof globalThis.fetch = async (input, init) => {
            if(payload.streamOnly && init?.body instanceof ReadableStream) {
              const reader=init.body.getReader();let bytes=0,maximumChunk=0;
              for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;maximumChunk=Math.max(maximumChunk,chunk.value.byteLength);}
              calls.push({url:typeof input==='string'?input:String(input),method:init?.method||'GET',body:{streamed:true,bytes,maximumChunk}});
              return Response.json(payload.response,{status:payload.status||200});
            }
            calls.push({ url: typeof input === 'string' ? input : String(input), method: init?.method || 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body instanceof ReadableStream ? await new Response(init.body).json() : null });
            return Response.json(payload.responses?.[calls.length - 1] ?? payload.response, { status: payload.status || 200 });
        };
        if(url.pathname==='/__test/score') {
          const d=createDiaryRuntime(env,fetchMock);
          const value=await d.generateDiaryScore('架空の検証日記',0,{feature_key:'score_evaluation',enabled:true,provider:payload.provider||'openai',model_name:'test-model',api_key:'fictional-key',system_prompt:null,user_prompt_template:'架空の行動規範'});
          return Response.json({value,calls});
        }
        if (url.pathname === '/__test/diary') {
            try {
                const d = createDiaryRuntime(env, fetchMock);
                const value = await d.generateDiaryText(payload.body as Block[], payload.date, 0, { feature_key: 'diary_format', enabled: true, provider: payload.provider || 'openai', model_name: 'test-model', api_key: 'fictional-key', system_prompt: null, user_prompt_template: null });
                return Response.json({ value, calls });
            }
            catch (error) {
                return Response.json({ error: error instanceof Error ? error.message : 'diary_failed', calls });
            }
        }
        const factories = { ocr, summarize, gyazoUpload, gyazoDelete, raindrop, testAI };
        const factory = factories[payload.name as keyof typeof factories];
        if (!factory)
            return Response.json({ error: 'unknown fixture' }, { status: 400 });
        let body: BodyInit = JSON.stringify(payload.body);
        const headers: Record<string, string> = { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' };
        if (payload.name === 'gyazoUpload') {
            const form = new FormData();
            form.append('image', new File([new Uint8Array([137, 80, 78, 71])], 'fixture.png', { type: 'image/png' }));
            body = form;
            delete headers['Content-Type'];
        }
        const req = new Request(env.APP_ORIGIN + '/api/functions/' + payload.name, { method: 'POST', headers, body });
        const isolatedEnv = { ...env, ...(payload.allowExternalWrites ? { EXTERNAL_WRITES_ENABLED: 'true' } : {}), ...(payload.gyazoSHA ? { GYAZO_REHEARSAL_SHA256: payload.gyazoSHA, GYAZO_REHEARSAL_UNTIL: String(Date.now() + 60_000) } : {}) };
        const result = await factory(isolatedEnv, owner, ctx, fetchMock)(req);
        return Response.json({ status: result.status, body: await result.json(), calls });
    }
};
