import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { decodeAttestationObject } from '@simplewebauthn/server/helpers';
import { randomBytes } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import { Database } from './database.js';
import { secretHash } from './identity-store.js';
import { OperatorAccess, type AccessIdentity } from './operator-access.js';
import type { OperatorMfaPolicy } from './operator-authorization.js';
import { fields, invalid } from './request-input.js';

const rpID = 'superman.qmenux.com', origin = `https://${rpID}`;
const algorithms = [-7, -257];
const secret = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export type OperatorOperation = Readonly<{ action: 'tenant:approve'|'tenant:reject'|'license:grant'|'license:extend'|'license:suspend'|'license:revoke'|'operator:manage'; targetId: string; requestId: string; payloadHash: string }>;
const actions=['tenant:approve','tenant:reject','license:grant','license:extend','license:suspend','license:revoke','operator:manage'];

type Credential = { id: string; operator_id: string; public_key: Buffer; counter: string };

@Injectable()
export class OperatorPasskeys {
  constructor(private readonly access: OperatorAccess, private readonly database: Database) {}

  private enabled() {
    if (process.env.OPERATOR_PASSKEY_ENABLED !== 'true' || process.env.VERCEL_ENV === 'preview'
      || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new ServiceUnavailableException({ status: 'unavailable' });
  }
  private async identity(assertion: unknown, browser: unknown): Promise<AccessIdentity> {
    this.enabled();
    if (!secret(browser)) throw new ForbiddenException();
    return this.access.verify(assertion);
  }
  private async query<T extends QueryResultRow>(sql: string, values: unknown[]): Promise<T[]> {
    const client = await this.database.begin();
    let clean = false;
    try {
      const result = await client.query<T>(sql, values);
      await client.query('COMMIT'); clean = true;
      return result.rows;
    } catch (error) {
      try { await client.query('ROLLBACK'); clean = true; } catch { /* Discard an unresettable connection. */ }
      if ((error as { code?: string }).code === '28000') throw new ForbiddenException();
      throw new ServiceUnavailableException({ status: 'unavailable' });
    } finally { client.release(!clean); }
  }
  private args(identity: AccessIdentity): string[] { return [identity.issuer, identity.subject, identity.audience]; }
  private response(value: unknown, registration: boolean): Record<string, unknown> {
    const row = fields(value, ['id','rawId','type','response','clientExtensionResults','authenticatorAttachment']);
    let encoded: string;
    try { encoded = JSON.stringify(row); } catch { invalid(); }
    if (Buffer.byteLength(encoded) > 16384) invalid();
    if (row.type !== 'public-key' || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,1024}$/.test(row.id)
      || row.id !== row.rawId || Buffer.from(row.id, 'base64url').toString('base64url') !== row.id) invalid();
    const body = fields(row.response, registration ? ['clientDataJSON','attestationObject','transports','publicKey','publicKeyAlgorithm','authenticatorData']
      : ['clientDataJSON','authenticatorData','signature','userHandle']);
    try {
      if (typeof body.clientDataJSON !== 'string' || !/^[A-Za-z0-9_-]+$/.test(body.clientDataJSON)) invalid();
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(body.clientDataJSON, 'base64url')));
      // This privileged RP permits only top-level, same-origin ceremonies, including older browsers omitting crossOrigin.
      if (!data || typeof data !== 'object' || Array.isArray(data) || (data.crossOrigin !== undefined && data.crossOrigin !== false)
        || Object.hasOwn(data, 'topOrigin')) invalid();
    } catch { invalid(); }
    return row;
  }

  async beginRegistration(assertion: unknown, browser: unknown, grant: unknown) {
    const identity = await this.identity(assertion, browser);
    if (!secret(grant)) throw new ForbiddenException();
    const rows = await this.query<{ id: string | null }>('SELECT qmenux_operator.passkey_registration($1,$2,$3,$4) AS id', [...this.args(identity), secretHash(grant)]);
    if (!rows[0]?.id) throw new ForbiddenException();
    const options = await generateRegistrationOptions({ rpName: 'QMenuX platform', rpID, userName: 'QMenuX operator',
      userID: new TextEncoder().encode(rows[0].id), supportedAlgorithmIDs: algorithms,
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' }, attestationType: 'none', timeout: 60000 });
    await this.query('SELECT qmenux_operator.passkey_begin($1,$2,$3,$4,$5,$6)',
      [...this.args(identity), secretHash(browser as string), secretHash(options.challenge), secretHash(grant)]);
    return options;
  }
  async finishRegistration(assertion: unknown, browser: unknown, challenge: unknown, response: unknown): Promise<void> {
    const identity = await this.identity(assertion, browser);
    if (!secret(challenge)) throw new ForbiddenException();
    const row = this.response(response, true);
    const consumed = await this.consume(identity, browser as string, challenge, true);
    let verified;
    try {
      const attestation = (row.response as Record<string, unknown>).attestationObject;
      if (typeof attestation !== 'string' || !/^[A-Za-z0-9_-]+$/.test(attestation)
        || decodeAttestationObject(Buffer.from(attestation, 'base64url')).get('fmt') !== 'none') throw new Error();
      verified = await verifyRegistrationResponse({ response: row as unknown as RegistrationResponseJSON, expectedChallenge: challenge,
        expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, requireUserPresence: true, supportedAlgorithmIDs: algorithms });
    } catch { throw new ForbiddenException(); }
    if (!verified.verified || !verified.registrationInfo.userVerified || verified.registrationInfo.fmt !== 'none') throw new ForbiddenException();
    const credential = verified.registrationInfo.credential;
    if (credential.id !== row.id) throw new ForbiddenException();
    await this.query('SELECT qmenux_operator.passkey_register($1,$2,$3,$4,$5,$6,$7)',
      [...this.args(identity), consumed.grant_hash, credential.id, Buffer.from(credential.publicKey), credential.counter]);
  }
  private async credentials(identity: AccessIdentity): Promise<Credential> {
    const rows = await this.query<Credential>('SELECT * FROM qmenux_operator.passkey_credentials($1,$2,$3)', this.args(identity));
    // shortcut: one active key per operator/application; add reviewed multi-key recovery before production.
    if (rows.length !== 1) throw new ForbiddenException();
    return rows[0]!;
  }
  async beginAuthentication(assertion: unknown, browser: unknown) {
    const identity = await this.identity(assertion, browser);
    const credential = await this.credentials(identity);
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', timeout: 60000, allowCredentials: [{ id: credential.id }] });
    await this.query('SELECT qmenux_operator.passkey_begin($1,$2,$3,$4,$5,NULL)',
      [...this.args(identity), secretHash(browser as string), secretHash(options.challenge)]);
    return options;
  }
  private async consume(identity: AccessIdentity, browser: string, challenge: string, registration: boolean) {
    // Commit consumption before cryptographic verification: failed signatures cannot replay the ceremony.
    const rows = await this.query<{ operator_id: string; grant_hash: string | null }>('SELECT * FROM qmenux_operator.passkey_consume($1,$2,$3,$4,$5,$6)',
      [...this.args(identity), secretHash(browser), secretHash(challenge), registration]);
    if (rows.length !== 1) throw new ForbiddenException();
    return rows[0]!;
  }
  async finishAuthentication(assertion: unknown, browser: unknown, challenge: unknown, response: unknown): Promise<string> {
    const identity = await this.identity(assertion, browser);
    if (!secret(challenge)) throw new ForbiddenException();
    const row = this.response(response, false);
    const consumed = await this.consume(identity, browser as string, challenge, false);
    const verified = await this.verifyAssertion(identity,challenge,row,consumed.operator_id);
    const proof = randomBytes(32).toString('base64url');
    await this.query('SELECT qmenux_operator.passkey_authenticate($1,$2,$3,$4,$5,$6,$7,$8)',
      [...this.args(identity), verified.credential.id, verified.credential.counter, verified.counter, secretHash(proof), secretHash(browser as string)]);
    return proof;
  }
  private async verifyAssertion(identity: AccessIdentity,challenge:string,row:Record<string,unknown>,operatorId:string) {
    const credential = await this.credentials(identity);
    const body = row.response as Record<string, unknown>;
    if (row.id !== credential.id || operatorId !== credential.operator_id
      || (body.userHandle !== null && body.userHandle !== undefined && body.userHandle !== Buffer.from(credential.operator_id).toString('base64url'))) throw new ForbiddenException();
    let verified;
    try {
      verified = await verifyAuthenticationResponse({ response: row as unknown as AuthenticationResponseJSON,
        expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: credential.id, publicKey: new Uint8Array(credential.public_key), counter: Number(credential.counter) } });
    } catch { throw new ForbiddenException(); }
    if (!verified.verified || !verified.authenticationInfo.userVerified) throw new ForbiddenException();
    return {credential,counter:verified.authenticationInfo.newCounter};
  }
  private operation(value:OperatorOperation) {
    const row=fields(value,['action','targetId','requestId','payloadHash']);
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    if(typeof row.action!=='string'||!actions.includes(row.action)||typeof row.targetId!=='string'||!uuid.test(row.targetId)
      ||typeof row.requestId!=='string'||!uuid.test(row.requestId)||typeof row.payloadHash!=='string'||!/^[0-9a-f]{64}$/.test(row.payloadHash))invalid();
    return [secretHash(JSON.stringify([row.action,row.targetId,row.requestId,row.payloadHash])),row.action,row.targetId,row.requestId] as [string,string,string,string];
  }
  private bindings(identity:AccessIdentity,session:unknown,csrf:unknown,proof:unknown,browser:unknown) {
    if(![session,csrf,proof,browser].every(secret))throw new ForbiddenException();
    return [...this.args(identity),...[session,csrf,proof,browser].map(value=>secretHash(value as string))];
  }
  async beginStepUp(assertion:unknown,browser:unknown,session:unknown,csrf:unknown,proof:unknown,operation:OperatorOperation) {
    const identity=await this.identity(assertion,browser),[digest]=this.operation(operation);
    const bindings=this.bindings(identity,session,csrf,proof,browser);
    const credential=await this.credentials(identity);
    const options=await generateAuthenticationOptions({rpID,userVerification:'required',timeout:60000,allowCredentials:[{id:credential.id}]});
    await this.query('SELECT qmenux_operator.step_up_begin($1,$2,$3,$4,$5,$6,$7,$8,$9)',[...bindings,digest,secretHash(options.challenge)]);
    return options;
  }
  async finishStepUp(assertion:unknown,browser:unknown,session:unknown,csrf:unknown,proof:unknown,operation:OperatorOperation,challenge:unknown,response:unknown) {
    const identity=await this.identity(assertion,browser),[digest,action,target,request]=this.operation(operation);
    const bindings=this.bindings(identity,session,csrf,proof,browser);
    if(!secret(challenge))throw new ForbiddenException();
    const row=this.response(response,false);
    const consumed=await this.query<{operator_id:string}>('SELECT * FROM qmenux_operator.step_up_consume_challenge($1,$2,$3,$4,$5,$6,$7,$8,$9)',[...bindings,digest,secretHash(challenge)]);
    if(consumed.length!==1)throw new ForbiddenException();
    const verified=await this.verifyAssertion(identity,challenge,row,consumed[0]!.operator_id);
    const token=randomBytes(32).toString('base64url');
    await this.query('SELECT qmenux_operator.step_up_verify($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
      [...bindings,digest,verified.credential.id,verified.credential.counter,verified.counter,secretHash(token),action,target,request]);
    return token;
  }
  async runStepUp<T>(assertion:unknown,browser:unknown,session:unknown,csrf:unknown,proof:unknown,stepUp:unknown,operation:OperatorOperation,
    work:(client:PoolClient,operator:Readonly<{id:string;role:'PLATFORM_ADMIN'}>)=>Promise<T>):Promise<T> {
    const identity=await this.identity(assertion,browser),[digest,action,target,request]=this.operation(operation);
    const bindings=this.bindings(identity,session,csrf,proof,browser);
    if(!secret(stepUp))throw new ForbiddenException();
    const client=await this.database.begin();let clean=false;
    try {
      const result=await client.query<{id:string|null}>('SELECT qmenux_operator.step_up_use($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS id',
        [...bindings,digest,secretHash(stepUp),action,target,request]);
      if(!result.rows[0]?.id)throw new ForbiddenException();
      // The callback must contain only transactional contracts/outbox writes, never external side effects.
      const value=await work(client,Object.freeze({id:result.rows[0].id,role:'PLATFORM_ADMIN' as const}));
      await client.query('COMMIT');clean=true;return value;
    }catch(error){
      try{await client.query('ROLLBACK');clean=true;}catch{/* Discard an unresettable connection. */}
      if(error instanceof ForbiddenException)throw error;
      throw new ServiceUnavailableException({status:'unavailable'});
    }finally{client.release(!clean);}
  }
  policy(proof: unknown, browser: unknown): OperatorMfaPolicy {
    return async identity => {
      this.enabled();
      if (!secret(proof) || !secret(browser)) return false;
      const rows = await this.query<{ valid: boolean }>('SELECT qmenux_operator.passkey_proof($1,$2,$3,$4,$5) AS valid',
        [...this.args(identity), secretHash(proof), secretHash(browser)]);
      return rows[0]?.valid === true;
    };
  }
}
