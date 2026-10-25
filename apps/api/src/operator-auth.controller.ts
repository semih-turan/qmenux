import { All, BadRequestException, Controller, Header, HttpCode, MethodNotAllowedException, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { readAdminJson, type AdminRequest } from './admin-request.js';
import { OperatorAuthorization } from './operator-authorization.js';
import { OperatorPasskeys } from './operator-passkeys.js';
import { fields } from './request-input.js';

const actions = ['registration/start','registration/finish','authentication/start','authentication/finish','me','logout'];

// Deliberately unregistered in AppModule pending the documented privileged-route review gate.
@Controller('internal/operator-auth')
export class OperatorAuthController {
  constructor(private readonly passkeys: OperatorPasskeys, private readonly authorization: OperatorAuthorization) {}

  @Post(actions)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async execute(@Req() req: AdminRequest) {
    if (process.env.OPERATOR_BFF_ENABLED !== 'true' || process.env.OPERATOR_PASSKEY_ENABLED !== 'true'
      || process.env.VERCEL_ENV === 'preview') throw new ServiceUnavailableException({ status: 'unavailable' });
    const action = req.url?.split('?')[0]?.slice('/v1/internal/operator-auth/'.length);
    const required = ['assertion','browser', ...(action === 'registration/start' ? ['grant']
      : action === 'registration/finish' || action === 'authentication/finish' ? ['challenge','response']
      : action === 'me' || action === 'logout' ? ['session','csrf','proof'] : [])];
    const optional = action === 'authentication/finish' ? ['previousSession'] : [];
    const body = fields(readAdminJson(req,'OPERATOR_BFF_SECRET'), [...required,...optional]);
    if (!actions.includes(action ?? '') || required.some(key => !Object.hasOwn(body,key))
      || Object.entries(body).some(([key,value]) => typeof value !== 'string' || !value
        || (key === 'assertion' ? value.length > 8192 : key === 'response' ? value.length > 16384 : !/^[A-Za-z0-9_-]{43}$/.test(value))
        || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) throw new BadRequestException();
    const { assertion,browser } = body;
    let response: unknown;
    if (Object.hasOwn(body,'response')) {
      try {
        response = JSON.parse(body.response as string);
        if (JSON.stringify(response) !== body.response) throw new Error();
      } catch { throw new BadRequestException(); }
    }
    if (action === 'registration/start') return { options: await this.passkeys.beginRegistration(assertion,browser,body.grant) };
    if (action === 'registration/finish') {
      await this.passkeys.finishRegistration(assertion,browser,body.challenge,response);
      return { status: 'registered' };
    }
    if (action === 'authentication/start') return { options: await this.passkeys.beginAuthentication(assertion,browser) };
    if (action === 'authentication/finish') {
      const proof = await this.passkeys.finishAuthentication(assertion,browser,body.challenge,response);
      const pair = await this.authorization.signInBrowser(assertion,this.passkeys.policy(proof,browser),body.previousSession);
      return { ...pair, proof, expiresIn: 900, mfaExpiresIn: 300 };
    }
    if (action === 'me') return this.authorization.runBrowser(assertion,body.session,body.csrf,'platform:read',
      this.passkeys.policy(body.proof,browser),async (_client,operator) => ({ operator: { id: operator.id, role: operator.role } }));
    await this.authorization.signOutBrowser(assertion,body.session,body.csrf,body.proof,browser);
    return { status: 'signed_out' };
  }

  @All(actions)
  @Header('Allow', 'POST')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  unsupported(): never { throw new MethodNotAllowedException(); }
}
