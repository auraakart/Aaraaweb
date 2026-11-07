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

  const projectionCases: Array<{
    template: SendApprovedWhatsAppInput['template'];
    parameters: Record<string, string>;
    expected: Record<string, string>;
  }> = [
    {
      template: 'ACCESS_APPROVAL_REQUESTED' as const,
      parameters: { subjectName: 'Visitor A', subjectType: 'VISITOR', internalAccessToken: 'do-not-send' },
      expected: { subjectName: 'Visitor A', subjectType: 'VISITOR' },
    },
    {
      template: 'MAINTENANCE_DUE_ISSUED' as const,
      parameters: { amount: '1200', dueDate: '2026-11-30', societyId: 'private-society-id' },
      expected: { amount: '1200', dueDate: '2026-11-30' },
    },
    {
      template: 'SERVICE_BOOKING_STATUS' as const,
      parameters: { offeringName: 'AC service', status: 'CONFIRMED', residentPhone: '+919111111111' },
      expected: { offeringName: 'AC service', status: 'CONFIRMED' },
    },
  ];

  it.each(projectionCases)('forwards only allowlisted placeholders for $template', async ({ template, parameters, expected }) => {
    const provider = new SimulatorWhatsAppProvider();
    const send = vi.spyOn(provider, 'sendTemplate');
    const service = new WhatsAppNotificationService(provider);

    await expect(service.sendApprovedTemplate({
      recipient: '+919999999999',
      template,
      parameters,
      idempotencyKey: `projection:${template}`,
    })).resolves.toMatchObject({ accepted: true });

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0].parameters).toEqual(expected);
    // Never mutate the original event payload; the projection is provider-only.
    expect(Object.keys(parameters)).toHaveLength(3);
  });

  it('excludes inherited metadata even when required values are owned', async () => {
    const provider = new SimulatorWhatsAppProvider();
    const send = vi.spyOn(provider, 'sendTemplate');
    const service = new WhatsAppNotificationService(provider);
    const parameters = Object.assign(Object.create({ privateResidentId: 'resident-private' }), {
      subjectName: 'Visitor A', subjectType: 'VISITOR',
    }) as Record<string, string>;

    await expect(service.sendApprovedTemplate({
      recipient: '+919999999999',
      template: 'ACCESS_APPROVAL_REQUESTED',
      parameters,
      idempotencyKey: 'projection:inherited-extra',
    })).resolves.toMatchObject({ accepted: true });

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0].parameters).toEqual({
      subjectName: 'Visitor A', subjectType: 'VISITOR',
    });
  });

  it.each([
    { name: 'all required values inherited', parameters: Object.create({ subjectName: 'Ravi', subjectType: 'VISITOR' }) },
    { name: 'one required value inherited', parameters: Object.assign(Object.create({ subjectName: 'Ravi' }), { subjectType: 'VISITOR' }) },
  ])('rejects $name instead of forwarding incomplete own parameters', async ({ parameters }) => {
    const provider = new SimulatorWhatsAppProvider();
    const send = vi.spyOn(provider, 'sendTemplate');
    const service = new WhatsAppNotificationService(provider);
    await expect(service.sendApprovedTemplate({
      recipient: '+919999999999',
      template: 'ACCESS_APPROVAL_REQUESTED',
      parameters,
      idempotencyKey: 'access:inherited-parameter',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('accepts own required values on a null-prototype parameter map', async () => {
    const provider = new SimulatorWhatsAppProvider();
    const send = vi.spyOn(provider, 'sendTemplate');
    const service = new WhatsAppNotificationService(provider);
    const parameters = Object.assign(Object.create(null) as Record<string, string>, {
      subjectName: 'Visitor A', subjectType: 'VISITOR',
    });
    await expect(service.sendApprovedTemplate({
      recipient: '+919999999999', template: 'ACCESS_APPROVAL_REQUESTED',
      parameters, idempotencyKey: 'access:own-parameters',
    })).resolves.toMatchObject({ accepted: true });
    expect(send).toHaveBeenCalledOnce();
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

  it.each(['__proto__', 'constructor', 'toString', 'unapproved', ''])(
    'rejects unapproved runtime template key %s before provider dispatch',
    async (template) => {
      const provider = new SimulatorWhatsAppProvider();
      const send = vi.spyOn(provider, 'sendTemplate');
      const service = new WhatsAppNotificationService(provider);
      const input = {
        recipient: '+919999999999',
        template,
        parameters: { subjectName: 'Visitor A', subjectType: 'VISITOR' },
        idempotencyKey: 'access:unapproved-template',
      } as unknown as SendApprovedWhatsAppInput;

      await expect(service.sendApprovedTemplate(input)).rejects.toBeInstanceOf(BadRequestException);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([
    { caseName: 'missing recipient', override: { recipient: undefined } },
    { caseName: 'non-string recipient', override: { recipient: 919999999999 } },
    { caseName: 'missing delivery key', override: { idempotencyKey: undefined } },
    { caseName: 'non-string delivery key', override: { idempotencyKey: 123 } },
    { caseName: 'non-string language code', override: { languageCode: { value: 'en' } } },
  ])('rejects $caseName at runtime before provider dispatch', async ({ override }) => {
    const provider = new SimulatorWhatsAppProvider();
    const send = vi.spyOn(provider, 'sendTemplate');
    const service = new WhatsAppNotificationService(provider);
    const input = {
      recipient: '+919999999999',
      template: 'ACCESS_APPROVAL_REQUESTED',
      parameters: { subjectName: 'Visitor A', subjectType: 'VISITOR' },
      idempotencyKey: 'access:runtime-invalid',
      ...override,
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
