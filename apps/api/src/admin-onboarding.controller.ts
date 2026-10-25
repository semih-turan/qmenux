import { All, BadRequestException, Controller, Header, HttpCode, MethodNotAllowedException, Param, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { readAdminJson, type AdminRequest } from './admin-request.js';
import { OnboardingApplications } from './onboarding-applications.js';
import { fields } from './request-input.js';

@Controller('internal/admin-onboarding')
export class AdminOnboardingController {
  constructor(private readonly applications: OnboardingApplications) {}

  private body(req: AdminRequest, required: string[], optional: string[] = []) {
    if (process.env.ADMIN_ONBOARDING_ENABLED !== 'true' || process.env.VERCEL_ENV === 'preview') {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
    const body = fields(readAdminJson(req, 'ADMIN_ONBOARDING_SECRET'), [...required,...optional]);
    if (required.some(key => !Object.hasOwn(body, key)) || Object.entries(body).some(([key,value]) =>
      ['revision','limit'].includes(key) ? typeof value !== 'number' || !Number.isInteger(value)
        : typeof value !== 'string' || !value || value.length > 2048
          || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) throw new BadRequestException();
    return body;
  }

  @Post('list')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  list(@Req() req: AdminRequest) {
    const { session, ...input } = this.body(req, ['session'], ['after','limit']);
    return this.applications.list(session, input);
  }

  @Post('drafts')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async create(@Req() req: AdminRequest) {
    const { session, csrf, ...input } = this.body(req, ['session','csrf','name','idempotencyKey']);
    return { application: await this.applications.create(session, csrf, input) };
  }

  @Post('drafts/:id/edit')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async edit(@Req() req: AdminRequest, @Param('id') id: string) {
    const { session, csrf, ...input } = this.body(req, ['session','csrf','name','revision']);
    return { application: await this.applications.edit(session, csrf, id, input) };
  }

  @Post('drafts/:id/submit')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async submit(@Req() req: AdminRequest, @Param('id') id: string) {
    const { session, csrf, ...input } = this.body(req, ['session','csrf','revision']);
    return { application: await this.applications.submit(session, csrf, id, input) };
  }

  @All(['list','drafts','drafts/:id/edit','drafts/:id/submit'])
  @Header('Allow', 'POST')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  unsupported(): never { throw new MethodNotAllowedException(); }
}
