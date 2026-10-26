/// <reference lib="dom" />
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type { Client } from 'pg';
import { Database } from '../src/database.js';
import { secretHash } from '../src/identity-store.js';
import { OperatorAccess } from '../src/operator-access.js';
import { OperatorAuthorization } from '../src/operator-authorization.js';
import { OperatorPasskeys } from '../src/operator-passkeys.js';
import { exerciseOperatorSessionAudit } from './operator-session-audit-fixture.js';
import { exerciseOperatorBrowser } from './operator-browser-fixture.js';
import { exerciseOperatorHttp, withOperatorHttp } from './operator-http-fixture.js';

const secret = () => randomBytes(32).toString('base64url');
const status = (value: number) => (error: { getStatus?: () => number }) => error.getStatus?.() === value;
const code = (value: string) => (error: { code?: string }) => error.code === value;

// Browser virtual authenticator + signed synthetic Access + complete disposable PG cluster only.
export async function exerciseOperatorPasskeys(database: Database, owner: Client) {
  const sql = (direction: string) => readFileSync(new URL(`../../../../infrastructure/database/migrations/0014_operator_passkeys.${direction}.sql`,import.meta.url),'utf8');
  const migrate = async (direction: string, commit = true) => {
    await owner.query('BEGIN');
    try { await owner.query(sql(direction)); await owner.query(commit?'COMMIT':'ROLLBACK'); }
    catch(error) { await owner.query('ROLLBACK'); throw error; }
  };
  const before = (await owner.query('SELECT * FROM qmenux_operator.operators ORDER BY id')).rows;
  const tenants = (await owner.query('SELECT * FROM qmenux.tenants ORDER BY id')).rows;
  const members = (await owner.query('SELECT * FROM qmenux_identity.memberships ORDER BY tenant_id,user_id')).rows;
  await migrate('up',false);
  assert.equal((await owner.query("SELECT to_regclass('qmenux_operator.passkeys') IS NULL AS absent")).rows[0].absent,true);
  await migrate('up'); await assert.rejects(migrate('up'),code('P0001'));
  await migrate('down'); await migrate('up');
  assert.deepEqual((await owner.query('SELECT * FROM qmenux_operator.operators ORDER BY id')).rows,before);
  await owner.query('BEGIN');
  try {
    await owner.query("INSERT INTO qmenux.schema_migrations(version) VALUES('0015_synthetic_future')");
    await assert.rejects(owner.query(sql('down')),code('P0001'));
  } finally { await owner.query('ROLLBACK'); }
  await owner.query('BEGIN');
  try { await assert.rejects(owner.query(readFileSync(new URL('../../../../infrastructure/database/migrations/0013_onboarding_applications.down.sql',import.meta.url),'utf8')),code('P0001')); }
  finally { await owner.query('ROLLBACK'); }

  const env={...process.env}, originalFetch=globalThis.fetch;
  const issuer='https://synthetic-passkey.cloudflareaccess.com', subject='synthetic-passkey-operator', audience='e'.repeat(64);
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const encode=(value: unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const assertion=(changes: Record<string,unknown>={})=>{
    const now=Math.floor(Date.now()/1000);
    const unsigned=`${encode({alg:'RS256',typ:'JWT',kid:'passkey-access'})}.${encode({iss:issuer,sub:subject,aud:[audience],type:'app',iat:now,nbf:now,exp:now+900,...changes})}`;
    return `${unsigned}.${sign('RSA-SHA256',Buffer.from(unsigned),privateKey).toString('base64url')}`;
  };
  let fetches=0; const network: string[]=[];
  globalThis.fetch=async url=>{network.push(String(url));assert.equal(String(url),`${issuer}/cdn-cgi/access/certs`);fetches++;return Response.json({keys:[{...publicKey.export({format:'jwk'}),kid:'passkey-access',alg:'RS256',use:'sig'}]});};
  process.env.OPERATOR_ACCESS_ENABLED='true'; process.env.OPERATOR_ACCESS_ISSUER=issuer; process.env.OPERATOR_ACCESS_AUDIENCE=audience;
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; delete process.env.VERCEL_ENV;
  const access=new OperatorAccess(), passkeys=new OperatorPasskeys(access,database), authorization=new OperatorAuthorization(access,database);
  const browserProof=secret(), grant=secret();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    process.env.OPERATOR_PASSKEY_ENABLED='false';
    await assert.rejects(passkeys.beginAuthentication(assertion(),browserProof),status(503)); assert.equal(fetches,0);
    process.env.OPERATOR_PASSKEY_ENABLED='true'; process.env.VERCEL_ENV='preview';
    await assert.rejects(passkeys.beginRegistration(assertion(),browserProof,grant),status(503)); assert.equal(fetches,0);
    delete process.env.VERCEL_ENV;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED='0'; await assert.rejects(passkeys.beginAuthentication(assertion(),browserProof),status(503));
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    for(const value of [undefined,null,42,'bad',[]]) await assert.rejects(passkeys.beginAuthentication(assertion(),value),status(403));
    await assert.rejects(passkeys.beginRegistration(assertion(),browserProof,grant),status(403));
    await assert.rejects(passkeys.beginAuthentication(assertion(),browserProof),status(403));
    const id=(await owner.query("INSERT INTO qmenux_operator.operators(issuer,subject,role,status) VALUES($1,$2,'PLATFORM_ADMIN','ACTIVE') RETURNING id",[issuer,subject])).rows[0].id as string;
    await owner.query('INSERT INTO qmenux_operator.passkey_grants(token_hash,operator_id,audience) VALUES($1,$2,$3)',[secretHash(grant),id,audience]);
    await owner.query("UPDATE qmenux_operator.passkey_grants SET created_at=now()-interval '20 minutes',expires_at=now()-interval '10 minutes' WHERE token_hash=$1",[secretHash(grant)]);
    await assert.rejects(passkeys.beginRegistration(assertion(),browserProof,grant),status(403));
    await owner.query("UPDATE qmenux_operator.passkey_grants SET created_at=now(),expires_at=now()+interval '10 minutes' WHERE token_hash=$1",[secretHash(grant)]);
    await assert.rejects(passkeys.beginRegistration(assertion(),browserProof,secret()),status(403));
    await assert.rejects(passkeys.beginRegistration(assertion({sub:'other'}),browserProof,grant),status(403));
    await assert.rejects(passkeys.beginRegistration('unsigned',browserProof,grant),status(401));
    await assert.rejects(migrate('down'),code('P0001'));

    browser=await chromium.launch();
    const page=await browser.newPage();
    await page.route('https://superman.qmenux.com/**',route=>route.fulfill({contentType:'text/html',body:'<main>Synthetic passkey fixture</main>'}));
    await page.goto('https://superman.qmenux.com');
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
    const register=async (options: Awaited<ReturnType<OperatorPasskeys['beginRegistration']>>)=>page.evaluate(async options=>{
      const publicKey=PublicKeyCredential.parseCreationOptionsFromJSON(JSON.parse(JSON.stringify(options)));
      const credential=await navigator.credentials.create({publicKey});return (credential as PublicKeyCredential).toJSON();
    },options);
    const authenticate=async (options: Awaited<ReturnType<OperatorPasskeys['beginAuthentication']>>)=>page.evaluate(async options=>{
      const publicKey=PublicKeyCredential.parseRequestOptionsFromJSON(JSON.parse(JSON.stringify(options)));
      const credential=await navigator.credentials.get({publicKey});return (credential as PublicKeyCredential).toJSON();
    },options);
    const unverifiedOptions=await passkeys.beginRegistration(assertion(),browserProof,grant);
    const unverifiedRegistration=await register(unverifiedOptions);
    const altered=unverifiedRegistration as {response:{attestationObject:string}};
    const attestation=isoCBOR.decodeFirst<Map<string,Uint8Array|string|Map<string,string>>>(Buffer.from(altered.response.attestationObject,'base64url'));
    const authData=attestation.get('authData');assert(authData instanceof Uint8Array);authData[32]=authData[32]! & ~4;
    altered.response.attestationObject=Buffer.from(isoCBOR.encode(attestation)).toString('base64url');
    await assert.rejects(passkeys.finishRegistration(assertion(),browserProof,unverifiedOptions.challenge,unverifiedRegistration),status(403));
    await assert.rejects(passkeys.finishRegistration(assertion(),browserProof,unverifiedOptions.challenge,unverifiedRegistration),status(403));
    const nonNoneOptions=await passkeys.beginRegistration(assertion(),browserProof,grant);
    const nonNone=await register(nonNoneOptions);
    const nonNoneResponse=nonNone as {response:{attestationObject:string}};
    const nonNoneAttestation=isoCBOR.decodeFirst<Map<string,Uint8Array|string|Map<string,string>>>(Buffer.from(nonNoneResponse.response.attestationObject,'base64url'));
    nonNoneAttestation.set('fmt','packed');nonNoneResponse.response.attestationObject=Buffer.from(isoCBOR.encode(nonNoneAttestation)).toString('base64url');
    await assert.rejects(passkeys.finishRegistration(assertion(),browserProof,nonNoneOptions.challenge,nonNone),status(403));
    const options=await passkeys.beginRegistration(assertion(),browserProof,grant);
    assert.equal(options.rp.id,'superman.qmenux.com'); assert.equal(options.authenticatorSelection?.userVerification,'required');
    assert.match(options.challenge,/^[A-Za-z0-9_-]{43}$/); assert(!JSON.stringify(options).includes(subject));
    let registration=await register(options);
    const originalData=(registration as {response:{clientDataJSON:string}}).response.clientDataJSON;
    const crossOrigin={...registration,response:{...(registration as {response:object}).response,
      clientDataJSON:encode({...JSON.parse(Buffer.from(originalData,'base64url').toString('utf8')),crossOrigin:true,topOrigin:'https://other.invalid'})}};
    for(const response of [null,[],{...registration,tenant:id},{...registration,id:'bad='}, {...registration,rawId:secret()},
      {...registration,clientExtensionResults:{text:'x'.repeat(17000)}},crossOrigin]) {
      await assert.rejects(passkeys.finishRegistration(assertion(),browserProof,options.challenge,response),status(400));
    }
    await assert.rejects(passkeys.finishRegistration(assertion(),secret(),options.challenge,registration),status(403));
    await assert.rejects(passkeys.finishRegistration(assertion({sub:'other'}),browserProof,options.challenge,registration),status(403));
    const wrongPurpose=await database.begin();
    try {
      assert.equal((await wrongPurpose.query('SELECT * FROM qmenux_operator.passkey_consume($1,$2,$3,$4,$5,false)',
        [issuer,subject,audience,secretHash(browserProof),secretHash(options.challenge)])).rowCount,0);
      await wrongPurpose.query('COMMIT');
    } finally { wrongPurpose.release(); }
    // SQL-only atomic rollback check; dummy bytes never become a persisted authenticator.
    await owner.query('BEGIN');
    try { await owner.query('SELECT qmenux_operator.passkey_register($1,$2,$3,$4,$5,$6,$7)',[issuer,subject,audience,secretHash(grant),registration.id,Buffer.alloc(32),0]); } finally { await owner.query('ROLLBACK'); }
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.passkeys WHERE operator_id=$1',[id])).rows[0].count,'0');
    assert.equal((await owner.query('SELECT consumed_at IS NULL AS unused FROM qmenux_operator.passkey_grants WHERE token_hash=$1',[secretHash(grant)])).rows[0].unused,true);
    await withOperatorHttp(passkeys,authorization,assertion,browserProof,async send=>{
      assert.equal((await send('registration/start',{assertion:assertion(),browser:browserProof,grant:secret()})).status,403);
      const start=await send('registration/start',{assertion:assertion(),browser:browserProof,grant});
      assert.equal(start.status,200);assert.equal(start.cache,'no-store');assert.equal(start.cookie,undefined);
      const fresh=start.data.options as Awaited<ReturnType<OperatorPasskeys['beginRegistration']>>;
      assert.equal(fresh.rp.id,'superman.qmenux.com');
      const signed=await register(fresh);
      const finish={assertion:assertion(),browser:browserProof,challenge:fresh.challenge,response:JSON.stringify(signed)};
      assert.equal((await send('registration/finish',{...finish,browser:secret()})).status,403);
      const result=await send('registration/finish',finish);
      assert.equal(result.status,200);assert.equal(result.cache,'no-store');assert.equal(result.cookie,undefined);
      assert.deepEqual(result.data,{status:'registered'});
      assert.equal((await send('registration/finish',finish)).status,403);
      assert.equal((await send('registration/start',{assertion:assertion(),browser:browserProof,grant})).status,403);
      assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.sessions WHERE operator_id=$1',[id])).rows[0].count,'0');
      assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.passkey_proofs WHERE operator_id=$1',[id])).rows[0].count,'0');
      assert.equal((await owner.query('SELECT id FROM qmenux_operator.passkeys WHERE operator_id=$1',[id])).rows[0].id,signed.id);
      // Remaining service-level checks use the credential admitted through the real HTTP adapter.
      registration=signed;
    });
    await assert.rejects(passkeys.finishRegistration(assertion(),browserProof,options.challenge,registration),status(403));
    await assert.rejects(passkeys.beginRegistration(assertion(),browserProof,grant),status(403));
    assert.equal((await owner.query('SELECT consumed_at IS NOT NULL AS consumed FROM qmenux_operator.passkey_grants WHERE token_hash=$1',[secretHash(grant)])).rows[0].consumed,true);
    const credential=(await owner.query('SELECT id,public_key,counter FROM qmenux_operator.passkeys WHERE operator_id=$1',[id])).rows[0];
    assert.equal(credential.id,registration.id); assert(Buffer.isBuffer(credential.public_key));
    const run=async(proof:unknown,binding:unknown=browserProof)=>authorization.signIn(assertion(),passkeys.policy(proof,binding));
    for(const proof of [undefined,'bad',secret(),grant]) await assert.rejects(run(proof),status(403));

    let authOptions=await passkeys.beginAuthentication(assertion(),browserProof);
    const authentication=await authenticate(authOptions);
    await assert.rejects(passkeys.finishAuthentication(assertion(),secret(),authOptions.challenge,authentication),status(403));
    const proof=await passkeys.finishAuthentication(assertion(),browserProof,authOptions.challenge,authentication);
    assert.match(proof,/^[A-Za-z0-9_-]{43}$/);
    await assert.rejects(passkeys.finishAuthentication(assertion(),browserProof,authOptions.challenge,authentication),status(403));
    await assert.rejects(run(proof,secret()),status(403));
    assert.equal(await passkeys.policy(proof,browserProof)({issuer,subject:'other',audience}),false);
    assert.equal(await passkeys.policy(proof,browserProof)({issuer,subject,audience:'f'.repeat(64)}),false);
    const logoutSql=(direction:string)=>readFileSync(new URL(`../../../../infrastructure/database/migrations/0015_operator_logout.${direction}.sql`,import.meta.url),'utf8');
    const logoutMigration=async(direction:string,commit=true)=>{await owner.query('BEGIN');try{await owner.query(logoutSql(direction));await owner.query(commit?'COMMIT':'ROLLBACK');}catch(error){await owner.query('ROLLBACK');throw error;}};
    await logoutMigration('up',false); await logoutMigration('up'); await logoutMigration('down'); await logoutMigration('up');
    const browserSql=(direction:string)=>readFileSync(new URL(`../../../../infrastructure/database/migrations/0016_operator_browser_sessions.${direction}.sql`,import.meta.url),'utf8');
    const browserMigration=async(direction:string,commit=true)=>{await owner.query('BEGIN');try{await owner.query(browserSql(direction));await owner.query(commit?'COMMIT':'ROLLBACK');}catch(error){await owner.query('ROLLBACK');throw error;}};
    await browserMigration('up',false); await browserMigration('up'); await browserMigration('down'); await browserMigration('up');
    const restartSql=(direction:string)=>readFileSync(new URL(`../../../../infrastructure/database/migrations/0017_operator_challenge_restart.${direction}.sql`,import.meta.url),'utf8');
    const restartMigration=async(direction:string,commit=true)=>{await owner.query('BEGIN');try{await owner.query(restartSql(direction));await owner.query(commit?'COMMIT':'ROLLBACK');}catch(error){await owner.query('ROLLBACK');throw error;}};
    await restartMigration('up',false);await restartMigration('up');await restartMigration('down');await restartMigration('up');

    const combinedSubject='synthetic-combined-operator',combinedGrant=secret();
    const combinedId=(await owner.query("INSERT INTO qmenux_operator.operators(issuer,subject,role,status) VALUES($1,$2,'PLATFORM_ADMIN','ACTIVE') RETURNING id",[issuer,combinedSubject])).rows[0].id as string;
    await owner.query('INSERT INTO qmenux_operator.passkey_grants(token_hash,operator_id,audience) VALUES($1,$2,$3)',[secretHash(combinedGrant),combinedId,audience]);
    await exerciseOperatorBrowser(passkeys,authorization,()=>assertion({sub:combinedSubject}),browser,owner,combinedId,combinedGrant,originalFetch);


    const token=await run(proof);
    const bound=await authorization.signInBrowser(assertion(),passkeys.policy(proof,browserProof));
    assert.match(bound.csrf,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(bound.csrf,bound.session);
    assert.equal((await owner.query('SELECT csrf_hash FROM qmenux_operator.sessions WHERE token_hash=$1',[secretHash(bound.session)])).rows[0].csrf_hash,secretHash(bound.csrf));
    const peerBound=await authorization.signInBrowser(assertion(),passkeys.policy(proof,browserProof));
    await assert.rejects(authorization.runBrowser(assertion(),bound.session,peerBound.csrf,'platform:read',passkeys.policy(proof,browserProof),async()=>true),status(403));
    await authorization.signOutBrowser(assertion(),peerBound.session,peerBound.csrf,secret(),browserProof);
    const browserFunctions=(await owner.query("SELECT prosecdef,proconfig,has_function_privilege('qmenux_runtime',p.oid,'EXECUTE') AS runtime,EXISTS(SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='qmenux_operator' AND p.proname IN ('create_browser_session','read_browser_session','revoke_browser_session')")).rows;
    assert.equal(browserFunctions.length,3);for(const f of browserFunctions)assert.deepEqual(f,{prosecdef:true,proconfig:['search_path=pg_catalog, pg_temp'],runtime:true,public:false});
    const readBound=(csrf:unknown)=>authorization.runBrowser(assertion(),bound.session,csrf,'platform:read',passkeys.policy(proof,browserProof),async(_client,operator)=>operator.id);
    for(const csrf of [undefined,'bad',secret()]) await assert.rejects(readBound(csrf),status(403));
    assert.equal(await readBound(bound.csrf),id);
    await assert.rejects(authorization.run(assertion(),bound.session,'platform:read',passkeys.policy(proof,browserProof),async()=>true),status(403));
    await assert.rejects(authorization.runBrowser(assertion(),token,bound.csrf,'platform:read',passkeys.policy(proof,browserProof),async()=>true),status(403));
    await restartMigration('down');
    await assert.rejects(browserMigration('down'),code('P0001'));
    await restartMigration('up');
    await authorization.signOut(assertion(),bound.session);
    assert.equal(await readBound(bound.csrf),id,'Legacy logout cannot retire browser sessions');
    await assert.rejects(authorization.signOutBrowser(assertion(),bound.session,secret(),proof,browserProof),status(403));
    assert.equal(await readBound(bound.csrf),id);
    await authorization.signOutBrowser(assertion(),bound.session,bound.csrf,secret(),browserProof);
    await assert.rejects(readBound(bound.csrf),status(403));

    process.env.OPERATOR_PASSKEY_ENABLED='false';
    await assert.rejects(run(proof),status(503));
    process.env.OPERATOR_PASSKEY_ENABLED='true';
    assert.equal(await authorization.run(assertion(),token,'platform:read',passkeys.policy(proof,browserProof),async(_client,operator)=>operator.id),id);
    const stored=(await owner.query('SELECT token_hash,browser_hash,expires_at>verified_at AND expires_at<=verified_at+interval \'6 minutes\' AS bounded FROM qmenux_operator.passkey_proofs WHERE operator_id=$1',[id])).rows[0];
    assert.deepEqual(stored,{token_hash:secretHash(proof),browser_hash:secretHash(browserProof),bounded:true});
    const staleClient=await database.begin();
    try {
      await assert.rejects(staleClient.query('SELECT qmenux_operator.passkey_authenticate($1,$2,$3,$4,$5,$6,$7,$8)',
        [issuer,subject,audience,registration.id,999,1000,secretHash(secret()),secretHash(browserProof)]),code('28000'));
      await staleClient.query('ROLLBACK');
    } finally { staleClient.release(); }

    const abandoned=await passkeys.beginAuthentication(assertion(),browserProof);
    await passkeys.beginAuthentication(assertion(),browserProof);
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.passkey_challenges WHERE operator_id=$1',[id])).rows[0].count,'1');
    await assert.rejects(passkeys.finishAuthentication(assertion(),browserProof,abandoned.challenge,authentication),status(403));
    const outstanding=await Promise.all(Array.from({length:5},(_,index)=>passkeys.beginAuthentication(assertion(),index===0?browserProof:secret())));
    await assert.rejects(passkeys.beginAuthentication(assertion(),secret()),status(403));
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.passkey_challenges WHERE operator_id=$1',[id])).rows[0].count,'5');
    await owner.query("UPDATE qmenux_operator.passkey_challenges SET expires_at=now()-interval '1 second' WHERE operator_id=$1",[id]);
    await assert.rejects(passkeys.finishAuthentication(assertion(),browserProof,outstanding[0]!.challenge,authentication),status(403));

    // A child origin can request the parent RP key, but this application accepts only its exact origin.
    await page.route('https://other.superman.qmenux.com/**',route=>route.fulfill({contentType:'text/html',body:'<main>Synthetic foreign origin</main>'}));
    await page.goto('https://other.superman.qmenux.com');
    authOptions=await passkeys.beginAuthentication(assertion(),browserProof);
    const foreignOrigin=await authenticate(authOptions);
    await assert.rejects(passkeys.finishAuthentication(assertion(),browserProof,authOptions.challenge,foreignOrigin),status(403));
    await page.goto('https://superman.qmenux.com');

    const saved=(await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials.find(credential=>Buffer.from(credential.credentialId,'base64').toString('base64url')===registration.id)!;
    await cdp.send('WebAuthn.removeCredential',{authenticatorId,credentialId:saved.credentialId});
    await cdp.send('WebAuthn.addCredential',{authenticatorId,credential:{...saved,signCount:0}});
    authOptions=await passkeys.beginAuthentication(assertion(),browserProof);
    await assert.rejects(passkeys.finishAuthentication(assertion(),browserProof,authOptions.challenge,await authenticate(authOptions)),status(403));
    await cdp.send('WebAuthn.removeCredential',{authenticatorId,credentialId:saved.credentialId});
    await cdp.send('WebAuthn.addCredential',{authenticatorId,credential:saved});

    // A signature failure consumes its challenge before verification and cannot recover by replaying the valid response.
    authOptions=await passkeys.beginAuthentication(assertion(),browserProof);
    const signed=await authenticate(authOptions);
    const tampered=structuredClone(signed) as {response:{signature:string}};
    tampered.response.signature=Buffer.from('invalid signature').toString('base64url');
    await assert.rejects(passkeys.finishAuthentication(assertion(),browserProof,authOptions.challenge,tampered),status(403));
    await assert.rejects(passkeys.finishAuthentication(assertion(),browserProof,authOptions.challenge,signed),status(403));
    assert.equal(await passkeys.policy(proof,browserProof)({issuer,subject,audience}),true);

    // Require both authenticator presence and verification, independently of a signed Access claim.
    authOptions=await passkeys.beginAuthentication(assertion(),browserProof);
    await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:false});
    const uvOptions={...authOptions,userVerification:'discouraged' as const};
    const noUv=await authenticate(uvOptions);
    await assert.rejects(passkeys.finishAuthentication(assertion(),browserProof,authOptions.challenge,noUv),status(403));
    await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:true});

    authOptions=await passkeys.beginAuthentication(assertion(),browserProof);
    await cdp.send('WebAuthn.setResponseOverrideBits',{authenticatorId,isBadUP:true});
    const noPresence=await authenticate(authOptions);
    await assert.rejects(passkeys.finishAuthentication(assertion(),browserProof,authOptions.challenge,noPresence),status(403));
    await cdp.send('WebAuthn.setResponseOverrideBits',{authenticatorId});

    authOptions=await passkeys.beginAuthentication(assertion(),browserProof);
    const valid=await authenticate(authOptions);
    const replayResults=await Promise.allSettled(Array.from({length:4},()=>passkeys.finishAuthentication(assertion(),browserProof,authOptions.challenge,valid)));
    assert.equal(replayResults.filter(result=>result.status==='fulfilled').length,1);
    const newer=(replayResults.find(result=>result.status==='fulfilled') as PromiseFulfilledResult<string>).value;
    assert.equal(await passkeys.policy(proof,browserProof)({issuer,subject,audience}),false,'New ceremony replaces prior evidence');
    const newerToken=await run(newer);
    await restartMigration('down');
    await browserMigration('down');
    await logoutMigration('down');
    await assert.rejects(authorization.signOut(assertion(),newerToken,newer,browserProof),status(503));
    assert.equal(await authorization.run(assertion(),newerToken,'platform:read',passkeys.policy(newer,browserProof),async()=>true),true,'Proof revocation failure rolls back session revocation');
    await logoutMigration('up');
    await browserMigration('up');
    await restartMigration('up');
    await owner.query("UPDATE qmenux_operator.passkey_proofs SET expires_at=clock_timestamp()-interval '1 second' WHERE operator_id=$1",[id]);
    await assert.rejects(authorization.run(assertion(),newerToken,'platform:read',passkeys.policy(newer,browserProof),async()=>true),status(403));
    await owner.query("UPDATE qmenux_operator.passkey_proofs SET expires_at=clock_timestamp()+interval '5 minutes' WHERE operator_id=$1",[id]);
    await assert.rejects(authorization.signOut(assertion(),newerToken,newer),status(403));
    await authorization.signOut(assertion({sub:'other'}),newerToken,newer,browserProof);
    assert.equal(await passkeys.policy(newer,browserProof)({issuer,subject,audience}),true);
    await authorization.signOut(assertion(),newerToken,newer,secret());
    assert.equal(await passkeys.policy(newer,browserProof)({issuer,subject,audience}),true,'Wrong browser cannot revoke MFA evidence');
    const logoutPair=await authorization.signInBrowser(assertion(),passkeys.policy(newer,browserProof));
    await authorization.signOutBrowser(assertion(),logoutPair.session,logoutPair.csrf,newer,browserProof);
    await authorization.signOutBrowser(assertion(),logoutPair.session,logoutPair.csrf,newer,browserProof);
    await authorization.signOut(assertion(),newerToken,newer,browserProof);
    assert.equal(await passkeys.policy(newer,browserProof)({issuer,subject,audience}),false,'Logout revokes reusable MFA proof even after session already gone');

    await owner.query("UPDATE qmenux_operator.passkey_proofs SET expires_at=clock_timestamp()-interval '1 second' WHERE operator_id=$1",[id]);
    await assert.rejects(authorization.run(assertion(),newerToken,'platform:read',passkeys.policy(newer,browserProof),async()=>true),status(403));

    const pending=await passkeys.beginAuthentication(assertion(),browserProof);
    await owner.query("UPDATE qmenux_operator.operators SET status='SUSPENDED' WHERE id=$1",[id]);
    await assert.rejects(passkeys.beginAuthentication(assertion(),browserProof),status(403));
    await owner.query("UPDATE qmenux_operator.operators SET status='ACTIVE' WHERE id=$1",[id]);
    await assert.rejects(passkeys.finishAuthentication(assertion(),browserProof,pending.challenge,valid),status(403));
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.sessions WHERE operator_id=$1',[id])).rows[0].count,'0');

    const finalOptions=await passkeys.beginAuthentication(assertion(),browserProof);
    let finalProof=await passkeys.finishAuthentication(assertion(),browserProof,finalOptions.challenge,await authenticate(finalOptions));
    finalProof=await exerciseOperatorHttp(passkeys,authorization,assertion,browserProof,authenticate);
    await run(finalProof);
    await owner.query("UPDATE qmenux_operator.passkeys SET status='REVOKED' WHERE operator_id=$1",[id]);
    assert.equal(await passkeys.policy(finalProof,browserProof)({issuer,subject,audience}),false);
    await assert.rejects(passkeys.beginAuthentication(assertion(),browserProof),status(403));
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.sessions WHERE operator_id=$1',[id])).rows[0].count,'0');
    for(const sql of ["UPDATE qmenux_operator.passkeys SET status='ACTIVE' WHERE operator_id=$1",'DELETE FROM qmenux_operator.passkeys WHERE operator_id=$1',
      'UPDATE qmenux_operator.passkey_events SET occurred_at=now() WHERE operator_id=$1','DELETE FROM qmenux_operator.passkey_events WHERE operator_id=$1']) {
      await owner.query('BEGIN');try{await assert.rejects(owner.query(sql,[id]),code('42501'));}finally{await owner.query('ROLLBACK');}
    }
    const kinds=(await owner.query('SELECT kind,count(*) FROM qmenux_operator.passkey_events WHERE operator_id=$1 GROUP BY kind ORDER BY kind',[id])).rows;
    assert.deepEqual(kinds,[{kind:'AUTHENTICATED',count:'5'},{kind:'REGISTERED',count:'1'},{kind:'REVOKED',count:'1'}]);
    for(const table of ['passkey_grants','passkeys','passkey_challenges','passkey_proofs','passkey_events']) {
      const row=(await owner.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('qmenux_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS allowed FROM pg_class WHERE oid=$1::regclass",[`qmenux_operator.${table}`])).rows[0];
      assert.deepEqual(row,{relrowsecurity:true,relforcerowsecurity:true,allowed:false});
      const client=await database.begin();try{await assert.rejects(client.query(`SELECT * FROM qmenux_operator.${table}`),code('42501'));await client.query('ROLLBACK');}finally{client.release();}
    }
    const functions=(await owner.query("SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('qmenux_runtime',p.oid,'EXECUTE') AS runtime,EXISTS(SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='qmenux_operator' AND p.proname LIKE 'passkey_%'")).rows;
    assert.equal(functions.length,10);
    for(const row of functions){assert.deepEqual(row.proconfig,['search_path=pg_catalog, pg_temp']);assert.equal(row.prosecdef,row.proname!=='passkey_event_immutable');assert.equal(row.public,false);assert.equal(row.runtime,!['passkey_change','passkey_invalidate','passkey_event_immutable'].includes(row.proname));}
    await assert.rejects(migrate('down'),code('P0001'));
    await restartMigration('down');
    await browserMigration('down');
    await logoutMigration('down');
    await logoutMigration('up');await browserMigration('up');await restartMigration('up');
    await exerciseOperatorSessionAudit(database,owner);
    const auditedSubject='synthetic-audited-browser',auditedGrant=secret();
    const auditedId=(await owner.query("INSERT INTO qmenux_operator.operators(issuer,subject,role,status) VALUES($1,$2,'PLATFORM_ADMIN','ACTIVE') RETURNING id",[issuer,auditedSubject])).rows[0].id as string;
    await owner.query('INSERT INTO qmenux_operator.passkey_grants(token_hash,operator_id,audience) VALUES($1,$2,$3)',[secretHash(auditedGrant),auditedId,audience]);
    await exerciseOperatorBrowser(passkeys,authorization,()=>assertion({sub:auditedSubject}),browser,owner,auditedId,auditedGrant,originalFetch);
    assert.deepEqual((await owner.query('SELECT kind,count(*) FROM qmenux_operator.session_events WHERE operator_id=$1 GROUP BY kind ORDER BY kind',[auditedId])).rows,[{kind:'ISSUED',count:'2'},{kind:'RETIRED',count:'2'}]);
    assert.deepEqual((await owner.query('SELECT * FROM qmenux.tenants ORDER BY id')).rows,tenants);
    assert.deepEqual((await owner.query('SELECT * FROM qmenux_identity.memberships ORDER BY tenant_id,user_id')).rows,members);
    assert(network.length>0);assert(network.every(url=>url===`${issuer}/cdn-cgi/access/certs`));
  } finally {
    await browser?.close(); globalThis.fetch=originalFetch;
    for(const name of Object.keys(process.env))if(!(name in env))delete process.env[name];Object.assign(process.env,env);
  }
}
