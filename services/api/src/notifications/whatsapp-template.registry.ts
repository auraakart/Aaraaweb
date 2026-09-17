export type WhatsAppTemplateKey =
  | 'ACCESS_APPROVAL_REQUESTED'
  | 'MAINTENANCE_DUE_ISSUED'
  | 'SERVICE_BOOKING_STATUS';

export type ApprovedWhatsAppTemplate = {
  name: string;
  requiredParameters: readonly string[];
  authenticatedAppPath?: string;
};

export const APPROVED_WHATSAPP_TEMPLATES: Record<WhatsAppTemplateKey, ApprovedWhatsAppTemplate> = {
  ACCESS_APPROVAL_REQUESTED: {
    name: 'aaraagate_access_approval_v1',
    requiredParameters: ['subjectName', 'subjectType'],
    authenticatedAppPath: '/gate',
  },
  MAINTENANCE_DUE_ISSUED: {
    name: 'aaraagate_maintenance_due_v1',
    requiredParameters: ['amount', 'dueDate'],
    authenticatedAppPath: '/billing',
  },
  SERVICE_BOOKING_STATUS: {
    name: 'aaraagate_service_booking_status_v1',
    requiredParameters: ['offeringName', 'status'],
    authenticatedAppPath: '/services',
  },
};
