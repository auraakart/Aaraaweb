import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from './whatsapp.provider';
import { APPROVED_WHATSAPP_TEMPLATES, type WhatsAppTemplateKey } from './whatsapp-template.registry';

export type SendApprovedWhatsAppInput = {
  recipient: string;
  template: WhatsAppTemplateKey;
  languageCode?: string;
  parameters: Record<string, string>;
  idempotencyKey: string;
};

@Injectable()
export class WhatsAppNotificationService {
  constructor(@Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider) {}

  async sendApprovedTemplate(input: SendApprovedWhatsAppInput) {
    const recipient = input.recipient.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(recipient)) {
      throw new BadRequestException('WhatsApp recipient must use E.164 format');
    }
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) throw new BadRequestException('WhatsApp idempotency key is required');

    const approved = APPROVED_WHATSAPP_TEMPLATES[input.template];
    if (!approved) throw new BadRequestException('WhatsApp template is not approved');

    for (const key of approved.requiredParameters) {
      if (!input.parameters[key]?.trim()) {
        throw new BadRequestException(`WhatsApp template parameter ${key} is required`);
      }
    }

    return this.provider.sendTemplate({
      recipient,
      templateName: approved.name,
      languageCode: input.languageCode?.trim() || 'en',
      parameters: input.parameters,
      idempotencyKey,
      // WhatsApp actions only deep-link back into the authenticated app.
      // Domain mutations continue through the normal permission-checked APIs.
      authenticatedAppPath: approved.authenticatedAppPath,
    });
  }
}
