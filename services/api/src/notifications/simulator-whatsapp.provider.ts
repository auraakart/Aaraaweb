import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { WhatsAppDeliveryResult, WhatsAppProvider, WhatsAppTemplateMessage } from './whatsapp.provider';

@Injectable()
export class SimulatorWhatsAppProvider implements WhatsAppProvider {
  private readonly deliveries = new Map<string, WhatsAppDeliveryResult>();

  async sendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppDeliveryResult> {
    const existing = this.deliveries.get(message.idempotencyKey);
    if (existing) return { ...existing, idempotent: true };

    const result: WhatsAppDeliveryResult = {
      providerMessageId: `sim-wa-${randomUUID()}`,
      accepted: true,
      status: 'ACCEPTED',
    };
    this.deliveries.set(message.idempotencyKey, result);
    return result;
  }
}
