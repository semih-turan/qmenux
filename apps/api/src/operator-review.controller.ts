import { All, BadRequestException, Controller, Header, HttpCode, MethodNotAllowedException, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { readAdminJson, type AdminRequest } from './admin-request.js';
import { OperatorApplicationReview } from './operator-application-review.js';
import { fields } from './request-input.js';

const actions=['list','rejection/start','rejection/finish','reject'];
// Review-gated: only the private test module registers this controller.
@Controller('internal/operator-review')
export class OperatorReviewController {
  constructor(private readonly review:OperatorApplicationReview) {}
  @Post(actions)
  @HttpCode(200)
  @Header('Cache-Control','no-store')
  @Header('Referrer-Policy','no-referrer')
  async execute(@Req() req:AdminRequest) {
    if(process.env.OPERATOR_REVIEW_ENABLED!=='true'||process.env.OPERATOR_BFF_ENABLED!=='true'||process.env.OPERATOR_PASSKEY_ENABLED!=='true'||process.env.VERCEL_ENV==='preview')throw new ServiceUnavailableException({status:'unavailable'});
    const action=req.url?.split('?')[0]?.slice('/v1/internal/operator-review/'.length);
    const required=['assertion','browser','session','csrf','proof',...(action==='list'?[]:['id','revision','reason','requestId']),...(action==='rejection/finish'?['challenge','response']:[])];
    const optional=action==='list'?['after','limit']:action==='reject'?['stepUp']:[];
    const body=fields(readAdminJson(req,'OPERATOR_REVIEW_SECRET'),[...required,...optional]);
    if(!actions.includes(action??'')||required.some(key=>!Object.hasOwn(body,key)))throw new BadRequestException();
    for(const name of ['assertion','browser','session','csrf','proof','challenge','stepUp']){
      if(!Object.hasOwn(body,name))continue;
      const value=body[name];
      if(typeof value!=='string'||(name==='assertion'?(!value||value.length>8192||[...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127)):!/^[A-Za-z0-9_-]{43}$/.test(value)))throw new BadRequestException();
    }
    const {assertion,browser,session,csrf,proof}=body;
    if(action==='list')return this.review.list(assertion,browser,session,csrf,proof,{...(Object.hasOwn(body,'after')?{after:body.after}:{}),...(Object.hasOwn(body,'limit')?{limit:body.limit}:{})});
    const command={revision:body.revision,reason:body.reason,requestId:body.requestId};
    if(action==='rejection/start')return {options:await this.review.beginReject(assertion,browser,session,csrf,proof,body.id,command)};
    if(action==='rejection/finish'){
      let response:unknown;
      try{if(typeof body.response!=='string'||body.response.length>16384)throw new Error();response=JSON.parse(body.response);if(JSON.stringify(response)!==body.response)throw new Error();}catch{throw new BadRequestException();}
      return {stepUp:await this.review.finishReject(assertion,browser,session,csrf,proof,body.id,command,body.challenge,response),expiresIn:120};
    }
    return {application:await this.review.reject(assertion,browser,session,csrf,proof,body.stepUp,body.id,command)};
  }
  @All(actions)
  @Header('Allow','POST')
  @Header('Cache-Control','no-store')
  @Header('Referrer-Policy','no-referrer')
  unsupported():never {throw new MethodNotAllowedException();}
}
