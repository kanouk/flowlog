import{readFile}from'node:fs/promises';
import{serializeSignedCookie}from'better-call';
export async function qaSession(){
 const root=new URL('../../.migration-backups/',import.meta.url);
 const session=JSON.parse(await readFile(new URL('operator-session.json',root)));
 if(session.expiresAt<=Date.now())throw Error('QA session expired; run the staging-only operator-session.py helper');
 if(!/^https:\/\/flowlog-staging\.[a-z0-9-]+\.workers\.dev$/.test(session.origin))throw Error('Unexpected staging origin');
 const secret=await readFile(new URL('auth-secret',root),'utf8');
 const cookie=(await serializeSignedCookie('__Secure-flowlog-staging.session_token',session.token,secret,{path:'/',secure:true,httpOnly:true})).split(';')[0];
 return{base:session.origin,cookie,owner:session.owner};
}
