import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { Database } from './database.js';
import { secretHash } from './identity-store.js';
import { OperatorAccess } from './operator-access.js';
import { OperatorPasskeys, type OperatorOperation } from './operator-passkeys.js';
import { fields, integer, text, uuid } from './request-input.js';

type Application={id:string;requestedName:string;status:'PENDING_APPROVAL'|'REJECTED';revision:number;createdAt:Date;submittedAt:Date};
function unavailable(error:unknown):never {
  if(error instanceof NotFoundException||error instanceof ConflictException)throw error;
  const code=(error as {code?:string})?.code;
  if(code==='28000')throw new ForbiddenException();
  if(code==='23505')throw new ConflictException({status:'conflict'});
  throw new ServiceUnavailableException({status:'unavailable'});
}

@Injectable()
export class OperatorApplicationReview {
  constructor(private readonly database:Database,private readonly access:OperatorAccess,private readonly passkeys:OperatorPasskeys) {}

  private command(value:unknown,input:unknown) {
    const id=uuid(value),body=fields(input,['revision','reason','requestId']);
    const revision=integer(body.revision,1,2147483646),reason=text(body.reason,1000,true),requestId=uuid(body.requestId);
    const operation:OperatorOperation=Object.freeze({action:'tenant:reject',targetId:id,requestId,payloadHash:secretHash(`${revision}:${reason}`)});
    return {id,revision,reason,requestId,operation};
  }
  private async bindings(assertion:unknown,browser:unknown,session:unknown,csrf:unknown,proof:unknown) {
    if(process.env.OPERATOR_PASSKEY_ENABLED!=='true'||process.env.VERCEL_ENV==='preview'||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new ServiceUnavailableException({status:'unavailable'});
    if(![session,csrf,proof,browser].every(value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value)))throw new ForbiddenException();
    const identity=await this.access.verify(assertion);
    return [identity.issuer,identity.subject,identity.audience,...[session,csrf,proof,browser].map(value=>secretHash(value as string))];
  }
  private async query<T extends QueryResultRow>(sql:string,values:unknown[]):Promise<T[]> {
    const client=await this.database.begin();let clean=false;
    try{const result=await client.query<T>(sql,values);await client.query('COMMIT');clean=true;return result.rows;}
    catch(error){try{await client.query('ROLLBACK');clean=true;}catch{/* Discard an unresettable connection. */}unavailable(error);}
    finally{client.release(!clean);}
  }
  async list(assertion:unknown,browser:unknown,session:unknown,csrf:unknown,proof:unknown,input:unknown) {
    const body=fields(input,['after','limit']),after=Object.hasOwn(body,'after')?uuid(body.after):null;
    const limit=Object.hasOwn(body,'limit')?integer(body.limit,1,100):20;
    const bindings=await this.bindings(assertion,browser,session,csrf,proof);
    const rows=await this.query<Application>('SELECT * FROM qmenux_onboarding.list_pending($1,$2,$3,$4,$5,$6,$7,$8,$9)',[...bindings,after,limit+1]);
    return {items:rows.slice(0,limit),nextCursor:rows.length>limit?rows[limit-1]!.id:null};
  }
  async decisions(assertion:unknown,browser:unknown,session:unknown,csrf:unknown,proof:unknown,input:unknown) {
    const body=fields(input,['after','limit']),after=Object.hasOwn(body,'after')?uuid(body.after):null;
    const limit=Object.hasOwn(body,'limit')?integer(body.limit,1,100):20;
    const bindings=await this.bindings(assertion,browser,session,csrf,proof);
    const rows=await this.query<Application & {reviewedAt:Date;reason:string;requestId:string}>('SELECT * FROM qmenux_onboarding.list_rejections($1,$2,$3,$4,$5,$6,$7,$8,$9)',[...bindings,after,limit+1]);
    return {items:rows.slice(0,limit),nextCursor:rows.length>limit?rows[limit-1]!.id:null};
  }
  async beginReject(assertion:unknown,browser:unknown,session:unknown,csrf:unknown,proof:unknown,id:unknown,input:unknown) {
    return this.passkeys.beginStepUp(assertion,browser,session,csrf,proof,this.command(id,input).operation);
  }
  async finishReject(assertion:unknown,browser:unknown,session:unknown,csrf:unknown,proof:unknown,id:unknown,input:unknown,challenge:unknown,response:unknown) {
    return this.passkeys.finishStepUp(assertion,browser,session,csrf,proof,this.command(id,input).operation,challenge,response);
  }
  async reject(assertion:unknown,browser:unknown,session:unknown,csrf:unknown,proof:unknown,stepUp:unknown,id:unknown,input:unknown):Promise<Application> {
    const command=this.command(id,input),bindings=await this.bindings(assertion,browser,session,csrf,proof);
    const replay=()=>this.query<Application>('SELECT * FROM qmenux_onboarding.replay_rejection($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [...bindings,command.id,command.requestId,command.revision,command.reason]);
    const previous=await replay();if(previous[0])return previous[0];
    try{return await this.passkeys.runStepUp(assertion,browser,session,csrf,proof,stepUp,command.operation,async(client:PoolClient)=>{
      try{
        const result=await client.query<Application>('SELECT * FROM qmenux_onboarding.reject_application($1,$2,$3,$4)',[command.id,command.requestId,command.revision,command.reason]);
        if(!result.rows[0])throw new NotFoundException({status:'not_found'});
        return result.rows[0];
      }catch(error){unavailable(error);}
    });}catch(error){
      if(error instanceof ForbiddenException){const recorded=await replay();if(recorded[0])return recorded[0];}
      throw error;
    }
  }
}
