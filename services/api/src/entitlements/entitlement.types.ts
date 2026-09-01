export enum ProductTier {
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  PREMIUM = 'PREMIUM',
  ENTERPRISE = 'ENTERPRISE',
}

export enum ProductFeature {
  VISITOR_MANAGEMENT = 'VISITOR_MANAGEMENT',
  DELIVERY_MANAGEMENT = 'DELIVERY_MANAGEMENT',
  DOMESTIC_HELP = 'DOMESTIC_HELP',
  NOTICES = 'NOTICES',
  HELPDESK = 'HELPDESK',
  SOS = 'SOS',
  HOUSEHOLD_SERVICES = 'HOUSEHOLD_SERVICES',
  MAINTENANCE_BILLING = 'MAINTENANCE_BILLING',
  PAYMENTS = 'PAYMENTS',
  AMENITIES = 'AMENITIES',
  ADVANCED_REPORTS = 'ADVANCED_REPORTS',
  WHATSAPP_AUTOMATION = 'WHATSAPP_AUTOMATION',
  AI_ASSISTANT = 'AI_ASSISTANT',
  CUSTOM_INTEGRATIONS = 'CUSTOM_INTEGRATIONS',
}

export const TIER_FEATURES: Readonly<Record<ProductTier, readonly ProductFeature[]>> = {
  [ProductTier.STARTER]: [
    ProductFeature.VISITOR_MANAGEMENT,
    ProductFeature.NOTICES,
    ProductFeature.SOS,
  ],
  [ProductTier.PROFESSIONAL]: [
    ProductFeature.VISITOR_MANAGEMENT,
    ProductFeature.DELIVERY_MANAGEMENT,
    ProductFeature.DOMESTIC_HELP,
    ProductFeature.NOTICES,
    ProductFeature.HELPDESK,
    ProductFeature.SOS,
    ProductFeature.HOUSEHOLD_SERVICES,
  ],
  [ProductTier.PREMIUM]: [
    ProductFeature.VISITOR_MANAGEMENT,
    ProductFeature.DELIVERY_MANAGEMENT,
    ProductFeature.DOMESTIC_HELP,
    ProductFeature.NOTICES,
    ProductFeature.HELPDESK,
    ProductFeature.SOS,
    ProductFeature.HOUSEHOLD_SERVICES,
    ProductFeature.MAINTENANCE_BILLING,
    ProductFeature.PAYMENTS,
    ProductFeature.AMENITIES,
    ProductFeature.ADVANCED_REPORTS,
    ProductFeature.WHATSAPP_AUTOMATION,
  ],
  [ProductTier.ENTERPRISE]: Object.values(ProductFeature),
};
