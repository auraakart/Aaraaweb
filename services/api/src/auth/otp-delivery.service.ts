import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type OtpDeliveryChannel = 'SMS' | 'WHATSAPP';

export interface DeliverOtpInput {
  phone: string;
  code: string;
  expiresInSeconds: number;
  channel?: OtpDeliveryChannel;
}

export interface OtpDeliveryProvider {
  send(input: DeliverOtpInput): Promise<void>;
}

class TestOtpDeliveryProvider implements OtpDeliveryProvider {
  async send(): Promise<void> {
    return;
  }
}

class Msg91OtpDeliveryProvider implements OtpDeliveryProvider {
  constructor(
    private readonly authKey: string,
    private readonly templateId: string,
    private readonly baseUrl: string,
  ) {}

  async send(input: DeliverOtpInput): Promise<void> {
    if (input.channel === 'WHATSAPP') {
      throw new ServiceUnavailableException('WhatsApp OTP delivery is not configured');
    }

    const mobile = input.phone.replace(/^\+/, '');
    const url = new URL(this.baseUrl);
    url.searchParams.set('template_id', this.templateId);
    url.searchParams.set('mobile', mobile);
    url.searchParams.set('otp', input.code);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authkey: this.authKey,
        'content-type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('OTP delivery provider rejected the request');
    }

    const payload = (await response.json().catch(() => null)) as { type?: string } | null;
    if (payload?.type && payload.type !== 'success') {
      throw new ServiceUnavailableException('OTP delivery provider rejected the request');
    }
  }
}

@Injectable()
export class OtpDeliveryService {
  private readonly provider: OtpDeliveryProvider;

  constructor() {
    const environment = process.env.NODE_ENV ?? 'development';
    const providerName = (process.env.OTP_DELIVERY_PROVIDER ?? '').trim().toLowerCase();

    if (environment === 'test' || (!providerName && environment !== 'production')) {
      this.provider = new TestOtpDeliveryProvider();
      return;
    }

    if (providerName !== 'msg91') {
      throw new Error('OTP_DELIVERY_PROVIDER must be configured to a supported provider in production');
    }

    const authKey = process.env.MSG91_AUTH_KEY?.trim();
    const templateId = process.env.MSG91_OTP_TEMPLATE_ID?.trim();
    if (!authKey || !templateId) {
      throw new Error('MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are required for MSG91 OTP delivery');
    }

    this.provider = new Msg91OtpDeliveryProvider(
      authKey,
      templateId,
      process.env.MSG91_OTP_SEND_URL?.trim() || 'https://control.msg91.com/api/v5/otp',
    );
  }

  async send(input: DeliverOtpInput): Promise<void> {
    await this.provider.send({ ...input, channel: input.channel ?? 'SMS' });
  }
}
