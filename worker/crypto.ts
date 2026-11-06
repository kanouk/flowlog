import type { Env } from './auth';
const encoder = new TextEncoder();
const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));
const bytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function sha256(value: string) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function seal(env: Env, value: string) {
    if (!env.ENCRYPTION_KEY)
        throw new Error('Encryption key unavailable');
    const key = await crypto.subtle.importKey('raw', bytes(env.ENCRYPTION_KEY), 'AES-GCM', false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value));
    return 'enc:v1:' + b64(iv) + ':' + b64(new Uint8Array(encrypted));
}
export async function unseal(env: Env, value: string) {
    if (!value.startsWith('enc:v1:') || !env.ENCRYPTION_KEY)
        throw new Error('Encrypted credential required');
    const [, , iv, cipher] = value.split(':');
    const key = await crypto.subtle.importKey('raw', bytes(env.ENCRYPTION_KEY), 'AES-GCM', false, ['decrypt']);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, key, bytes(cipher)));
}
