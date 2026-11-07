import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SimulatorWhatsAppProvider } from './simulator-whatsapp.provider';
import { WhatsAppNotificationService, type SendApprovedWhatsAppInput } from './whatsapp-notification.service';

describe('WhatsAppNotificationService', () => {
  it('sends only an approved template and returns an authenticated app route', async () => {
    const service = new WhatsAppNotificationService(new SimulatorWhatsAppProvider());
    const result = await service.sendApprovedTemplate({
      recipient: '+919999999999',
      template: 'ACCESS_APPROVAL_REQUESTED',
      parameters: { subjectName: 'Ravi', subjectType: 'VISITOR' },
      idempotencyKey: 'access:req-1',
      languageCode: 'ta',
    });

    expect(result.accepted).toBe(true);
    expect(result.status).toBe('ACCEPTED');
  });

  it('is idempotent for the same delivery key', async () => {
    const service = new WhatsAppNotificationService(new SimulatorWhatsAppProvider());
    const input = {
      recipient: '+919999999999',
      template: 'SERVICE_BOOKING_STATUS' as const,
      parameters: { offeringName: 'AC service', status: 'CONFIRMED' },
      idempotencyKey: 'booking:b-1:confirmed',
    };

    const first = await service.sendApprovedTemplate(input);
    const second = await service.sendApprovedTemplate(input);
    expect(second.providerMessageId).toBe(first.providerMessageId);
    expect(second.idempotent).toBe(true);
  });

  it.each([
    { caseName: 'missing parameter map', parameters: undefined },
    { caseName: 'null parameter map', parameters: null },
    { caseName: 'array parameter map', parameters: [] },
    { caseName: 'non-string required value', parameters: { subjectName: 42, subjectType: 'VISITOR' } },
    { caseName: 'whitespace-only required value', parameters: { subjectName: '   ', subjectType: 'VISITOR' } },
  ])('rejects $caseName without calling WhatsApp provider', async ({ parameters }) => {
    const provider = new SimulatorWhatsAppProvider();
    const send = vi.spyOn(provider, 'sendTemplate');
    const service = new WhatsAppNotificationService(provider);
    const input = {
      recipient: '+919999999999',
      template: 'ACCESS_APPROVAL_REQUESTED',
      parameters,
      idempotencyKey: 'access:req-invalid',
    } as unknown as SendApprovedWhatsAppInput;

    await expect(service.sendApprovedTemplate(input)).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed for malformed recipients and missing approved parameters', async () => {
    const service = new WhatsAppNotificationService(new SimulatorWhatsAppProvider());

    await expect(service.sendApprovedTemplate({
      recipient: '9999999999',
      template: 'MAINTENANCE_DUE_ISSUED',
      parameters: { amount: '1200', dueDate: '2026-09-30' },
      idempotencyKey: 'invoice:i-1',
    })).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.sendApprovedTemplate({
      recipient: '+919999999999',
      template: 'MAINTENANCE_DUE_ISSUED',
      parameters: { amount: '1200' },
      idempotencyKey: 'invoice:i-1',
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
