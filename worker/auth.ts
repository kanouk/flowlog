import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export interface Env {
    DB: D1Database;
    IMAGES: R2Bucket;
    ASSETS: Fetcher;
    AUTH_SECRET: string;
    OWNER_EMAIL: string;
    OWNER_ID: string;
    APP_ORIGIN: string;
    ENVIRONMENT: string;
    ENCRYPTION_KEY?: string;
    FIRECRAWL_API_KEY?: string;
    EXTERNAL_WRITES_ENABLED?: string;
    PUBLIC_IMAGE_DELIVERY?: string;
    GYAZO_REHEARSAL_SHA256?: string;
    GYAZO_REHEARSAL_UNTIL?: string;
    DIARY_QUEUE?: Queue;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
}
const date = (name: string) => integer(name, { mode: 'timestamp_ms' });
const user = sqliteTable('auth_user', {
    id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
    emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull(), image: text('image'),
    createdAt: date('createdAt').notNull(), updatedAt: date('updatedAt').notNull(),
});
const session = sqliteTable('auth_session', {
    id: text('id').primaryKey(), token: text('token').notNull().unique(), userId: text('userId').notNull(),
    expiresAt: date('expiresAt').notNull(), createdAt: date('createdAt').notNull(), updatedAt: date('updatedAt').notNull(),
    ipAddress: text('ipAddress'), userAgent: text('userAgent'),
});
const account = sqliteTable('auth_account', {
    id: text('id').primaryKey(), accountId: text('accountId').notNull(), providerId: text('providerId').notNull(),
    userId: text('userId').notNull(), password: text('password'), accessToken: text('accessToken'),
    refreshToken: text('refreshToken'), idToken: text('idToken'), scope: text('scope'),
    accessTokenExpiresAt: date('accessTokenExpiresAt'), refreshTokenExpiresAt: date('refreshTokenExpiresAt'),
    createdAt: date('createdAt').notNull(), updatedAt: date('updatedAt').notNull(),
});
const verification = sqliteTable('auth_verification', {
    id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
    expiresAt: date('expiresAt').notNull(), createdAt: date('createdAt'), updatedAt: date('updatedAt'),
});
const schema = { user, session, account, verification };
export function authFor(env: Env) {
    return betterAuth({
        appName: env.ENVIRONMENT === 'production' ? 'FlowLog' : 'FlowLog staging', secret: env.AUTH_SECRET, baseURL: env.APP_ORIGIN,
        trustedOrigins: [env.APP_ORIGIN],
        database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: 'sqlite', schema, transaction: false }),
        socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
            google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, disableSignUp: true, prompt: 'select_account' },
        } : {},
        account: { encryptOAuthTokens: true, accountLinking: { enabled: true, allowDifferentEmails: false } },
        databaseHooks: {
            user: { create: { before: async () => false }, update: { before: async (user) => user.email && user.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase() ? false : undefined } },
            account: { create: { before: async (account) => account.userId === env.OWNER_ID && ['credential', 'google'].includes(account.providerId) } },
            session: { create: { before: async (session) => session.userId === env.OWNER_ID } },
        },
        emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12,
            revokeSessionsOnPasswordReset: true },
        session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
        advanced: { cookiePrefix: env.ENVIRONMENT === 'production' ? 'flowlog' : 'flowlog-staging' },
        logger: { disabled: true },
    });
}
