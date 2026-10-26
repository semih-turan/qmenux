/** Explicit DI tokens: test builds (esbuild) do not emit decorator metadata, so nothing relies on type-based injection. */
export const CONFIG = Symbol('CONFIG');
export const DB = Symbol('DB');
export const OIDC = Symbol('OIDC');
export const SESSIONS = Symbol('SESSIONS');
export const LIMITER = Symbol('LIMITER');
export const STORAGE = Symbol('STORAGE');
