import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';

@Injectable()
export class AppleClientSecret {
  async create(): Promise<string> {
    const team = process.env.APPLE_TEAM_ID;
    const kid = process.env.APPLE_KEY_ID;
    const client = process.env.APPLE_CLIENT_ID;
    const pem = process.env.APPLE_PRIVATE_KEY;
    try {
      if (process.env.AUTH_APPLE_ENABLED !== 'true' || !team || !/^[A-Z0-9]{10}$/.test(team)
        || !kid || !/^[A-Z0-9]{10}$/.test(kid) || !client || client.length > 255
        || !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(client) || !pem || pem.length > 16384) {
        throw new Error('Invalid Apple signing configuration');
      }
      const key = await importPKCS8(pem, 'ES256');
      const now = Math.floor(Date.now() / 1000);
      return await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid })
        .setIssuer(team).setSubject(client).setAudience('https://appleid.apple.com')
        .setIssuedAt(now).setExpirationTime(now + 300).sign(key);
    } catch { throw new ServiceUnavailableException({ status: 'unavailable' }); }
  }
}
