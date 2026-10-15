export type WhatsAppTemplateMessage = {
  recipient: string;
  templateName: string;
  languageCode: string;
  parameters: Record<string, string>;
  idempotencyKey: string;
  authenticatedAppPath?: string;
};

export type WhatsAppDeliveryResult = {
  providerMessageId: string;
  accepted: boolean;
  status: 'ACCEPTED' | 'REJECTED';
  idempotent?: boolean;
};

export interface WhatsAppProvider {
  sendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppDeliveryResult>;
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');
