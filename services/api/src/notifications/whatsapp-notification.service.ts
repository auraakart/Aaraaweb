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
    // Runtime event payloads are not guaranteed to respect TypeScript strings.
    // Validate before trimming so bad input stays a controlled 400 error.
    if (typeof input.recipient !== 'string') {
      throw new BadRequestException('WhatsApp recipient must use E.164 format');
    }
    const recipient = input.recipient.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(recipient)) {
      throw new BadRequestException('WhatsApp recipient must use E.164 format');
    }
    if (typeof input.idempotencyKey !== 'string') {
      throw new BadRequestException('WhatsApp idempotency key is required');
    }
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) throw new BadRequestException('WhatsApp idempotency key is required');
    if (input.languageCode != null && typeof input.languageCode !== 'string') {
      throw new BadRequestException('WhatsApp language code must be a string');
    }

    // Registry keys must be explicit own entries. Prototype names such as
    // "__proto__" and "constructor" are not approved WhatsApp templates.
    if (typeof input.template !== 'string' || !Object.prototype.hasOwnProperty.call(APPROVED_WHATSAPP_TEMPLATES, input.template)) {
      throw new BadRequestException('WhatsApp template is not approved');
    }
    const approved = APPROVED_WHATSAPP_TEMPLATES[input.template];
    // TypeScript types do not validate payloads from jobs or external adapters.
    // Reject malformed inputs before a provider can receive them.
    if (!input.parameters || typeof input.parameters !== 'object' || Array.isArray(input.parameters)) {
      throw new BadRequestException('WhatsApp template parameters must be an object');
    }

    for (const key of approved.requiredParameters) {
      // Inherited values do not belong to the message payload and may vanish
      // when an adapter serializes the parameters to JSON.
      const value = Object.prototype.hasOwnProperty.call(input.parameters, key)
        ? input.parameters[key]
        : undefined;
      if (typeof value !== 'string' || !value.trim()) {
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
