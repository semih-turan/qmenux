import { All, BadRequestException, Controller, Header, HttpCode, MethodNotAllowedException, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { readAdminJson, type AdminRequest } from './admin-request.js';
import { fields } from './request-input.js';
import { TenantProvisioning } from './tenant-provisioning.js';

const actions = ['start', 'finish', 'provision'];

// Review-gated: the production AppModule does not register this controller.
@Controller('internal/operator-provisioning')
export class OperatorProvisioningController {
  constructor(private readonly provisioning: TenantProvisioning) {}

  @Post(actions)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async execute(@Req() req: AdminRequest) {
    if (process.env.OPERATOR_PROVISIONING_ENABLED !== 'true' || process.env.OPERATOR_BFF_ENABLED !== 'true'
      || process.env.OPERATOR_PASSKEY_ENABLED !== 'true' || process.env.VERCEL_ENV === 'preview') {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
    const action = req.url?.split('?')[0]?.slice('/v1/internal/operator-provisioning/'.length);
    const required = ['assertion','browser','session','csrf','proof','id','revision','slug','businessName','initialBranchName','reason','requestId',
      ...(action === 'finish' ? ['challenge','response'] : [])];
    const body = fields(readAdminJson(req, 'OPERATOR_PROVISIONING_SECRET'), [...required, ...(action === 'provision' ? ['stepUp'] : [])]);
    if (!actions.includes(action ?? '') || required.some(key => !Object.hasOwn(body, key))) throw new BadRequestException();
    for (const name of ['assertion','browser','session','csrf','proof','challenge','stepUp']) {
      if (!Object.hasOwn(body, name)) continue;
      const value = body[name];
      if (typeof value !== 'string' || (name === 'assertion'
        ? (!value || value.length > 8192 || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
        : !/^[A-Za-z0-9_-]{43}$/.test(value))) throw new BadRequestException();
    }
    const { assertion, browser, session, csrf, proof, id } = body;
    const command = { revision: body.revision, slug: body.slug, businessName: body.businessName,
      initialBranchName: body.initialBranchName, reason: body.reason, requestId: body.requestId };
    if (action === 'start') return { options: await this.provisioning.begin(assertion, browser, session, csrf, proof, id, command) };
    if (action === 'finish') {
      let response: unknown;
      try {
        if (typeof body.response !== 'string' || body.response.length > 16384) throw new Error();
        response = JSON.parse(body.response);
        if (JSON.stringify(response) !== body.response) throw new Error();
      } catch { throw new BadRequestException(); }
      return { stepUp: await this.provisioning.finish(assertion, browser, session, csrf, proof, id, command, body.challenge, response), expiresIn: 120 };
    }
    const result = await this.provisioning.provision(assertion, browser, session, csrf, proof, body.stepUp, id, command);
    return { provisioning: { applicationId: result.applicationId, tenantId: result.tenantId,
      branchId: result.branchId, slug: result.slug, createdAt: result.createdAt } };
  }

  @All(actions)
  @Header('Allow', 'POST')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  unsupported(): never { throw new MethodNotAllowedException(); }
}
