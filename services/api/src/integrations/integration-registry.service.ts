import { Injectable } from '@nestjs/common';
import { integrationContractMetadata, IntegrationContractMetadata } from './integration-provider.contract';

export type IntegrationFamily =
  | 'OTP'
  | 'WHATSAPP'
  | 'PUSH'
  | 'PAYMENT_GATEWAY'
  | 'ACCESS_CONTROL'
  | 'OBJECT_STORAGE'
  | 'SMART_METER'
  | 'ACCOUNTING_CONNECTOR';

export type IntegrationHealth = 'READY' | 'DEGRADED' | 'UNCONFIGURED';
export type IntegrationConfigurationScope = 'DEPLOYMENT' | 'SOCIETY';

export type IntegrationCapabilityView = IntegrationContractMetadata & {
  family: IntegrationFamily;
  provider: string;
  configurationScope: IntegrationConfigurationScope;
  configured: boolean;
  health: IntegrationHealth;
  capabilities: readonly string[];
  boundary: string;
};

@Injectable()
export class IntegrationRegistryService {
  list(societyId: string): IntegrationCapabilityView[] {
    void societyId;
    return [
      this.otp(),
      this.whatsApp(),
      this.push(),
      this.paymentGateway(),
      this.accessControl(),
      this.objectStorage(),
      this.smartMeter(),
      this.accountingConnector(),
    ].map((item) => ({ ...item, ...integrationContractMetadata(item.family) }));
  }

  private otp(): Omit<IntegrationCapabilityView, keyof IntegrationContractMetadata> {
    const environment = process.env.NODE_ENV ?? 'development';
    const provider = (process.env.OTP_DELIVERY_PROVIDER ?? '').trim().toLowerCase();
    const testFallback = environment === 'test' || (!provider && environment !== 'production');
    const msg91Configured =
      provider === 'msg91' &&
      this.present('MSG91_AUTH_KEY') &&
      this.present('MSG91_OTP_TEMPLATE_ID');
    const configured = testFallback || msg91Configured;
    return {
      family: 'OTP',
      provider: testFallback ? 'test' : provider || 'unconfigured',
      configurationScope: 'DEPLOYMENT',
      configured,
      health: configured ? 'READY' : 'UNCONFIGURED',
      capabilities: ['SMS_OTP', 'WHATSAPP_OTP_CONTRACT'],
      boundary: 'OTP credentials and provider templates are deployment configuration; no secret values are exposed.',
    };
  }

  private whatsApp(): Omit<IntegrationCapabilityView, keyof IntegrationContractMetadata> {
    return {
      family: 'WHATSAPP',
      provider: (process.env.WHATSAPP_DELIVERY_PROVIDER ?? 'unconfigured').trim().toLowerCase() || 'unconfigured',
      configurationScope: 'DEPLOYMENT',
      configured: false,
      health: 'UNCONFIGURED',
      capabilities: ['TEMPLATE_MESSAGE', 'OTP_DELIVERY_CONTRACT'],
      boundary: 'WhatsApp remains a versioned provider contract until an approved transport/template configuration is wired; no fallback bypass is allowed.',
    };
  }

  private push(): Omit<IntegrationCapabilityView, keyof IntegrationContractMetadata> {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    let valid = false;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        valid = Boolean(parsed.project_id && parsed.client_email && parsed.private_key);
      } catch {
        valid = false;
      }
    }
    return {
      family: 'PUSH',
      provider: 'firebase',
      configurationScope: 'DEPLOYMENT',
      configured: valid,
      health: valid ? 'READY' : raw ? 'DEGRADED' : 'UNCONFIGURED',
      capabilities: ['FCM_PUSH', 'APNS_VIA_FCM', 'DURABLE_RETRY'],
      boundary: 'Push health here reflects configuration readiness, not proof of device delivery or provider uptime.',
    };
  }

  private paymentGateway(): Omit<IntegrationCapabilityView, keyof IntegrationContractMetadata> {
    const environment = (process.env.PAYMENT_GATEWAY_RECONCILIATION_ENVIRONMENT ?? 'sandbox').trim().toLowerCase();
    const provider = (process.env.PAYMENT_GATEWAY_RECONCILIATION_PROVIDER ?? 'configured-http').trim() || 'configured-http';
    const live = environment === 'live';
    const sandbox = environment === 'sandbox';
    const baseUrl = (
      live
        ? process.env.PAYMENT_GATEWAY_RECONCILIATION_LIVE_BASE_URL
        : process.env.PAYMENT_GATEWAY_RECONCILIATION_SANDBOX_BASE_URL ?? process.env.PAYMENT_GATEWAY_RECONCILIATION_BASE_URL
    )?.trim();
    const apiKey = (
      live
        ? process.env.PAYMENT_GATEWAY_RECONCILIATION_LIVE_API_KEY
        : process.env.PAYMENT_GATEWAY_RECONCILIATION_SANDBOX_API_KEY ?? process.env.PAYMENT_GATEWAY_RECONCILIATION_API_KEY
    )?.trim();
    const configured = (sandbox && Boolean(baseUrl)) || (live && Boolean(baseUrl) && Boolean(apiKey));
    const health: IntegrationHealth = !sandbox && !live ? 'DEGRADED' : configured ? 'READY' : 'UNCONFIGURED';
    return {
      family: 'PAYMENT_GATEWAY',
      provider,
      configurationScope: 'DEPLOYMENT',
      configured,
      health,
      capabilities: ['PAYMENT_STATUS_QUERY', 'REFUND_REQUEST', 'IDEMPOTENT_OPERATION', 'RECONCILIATION_EVIDENCE'],
      boundary: 'Gateway state is transport evidence only; Aaraagate accounting truth remains authoritative.',
    };
  }

  private accessControl(): Omit<IntegrationCapabilityView, keyof IntegrationContractMetadata> {
    return {
      family: 'ACCESS_CONTROL',
      provider: 'reference-adapters',
      configurationScope: 'SOCIETY',
      configured: true,
      health: 'READY',
      capabilities: ['ANPR', 'RFID', 'BOOM_BARRIER', 'HEALTH_CHECK', 'IDEMPOTENT_COMMAND', 'MANUAL_FALLBACK'],
      boundary: 'Reference adapters prove the contract only; real vendor protocols, credentials and field-device health remain external.',
    };
  }

  private objectStorage(): Omit<IntegrationCapabilityView, keyof IntegrationContractMetadata> {
    const driver = (process.env.OBJECT_STORAGE_DRIVER ?? '').trim().toLowerCase();
    const configured =
      driver === 's3' &&
      this.present('OBJECT_STORAGE_S3_ENDPOINT') &&
      this.present('OBJECT_STORAGE_S3_BUCKET') &&
      this.present('OBJECT_STORAGE_S3_REGION') &&
      this.present('OBJECT_STORAGE_S3_ACCESS_KEY_ID') &&
      this.present('OBJECT_STORAGE_S3_SECRET_ACCESS_KEY') &&
      this.present('OBJECT_STORAGE_PUBLIC_BASE_URL');
    const health: IntegrationHealth = !driver ? 'UNCONFIGURED' : driver === 's3' && configured ? 'READY' : 'DEGRADED';
    return {
      family: 'OBJECT_STORAGE',
      provider: driver || 'unconfigured',
      configurationScope: 'DEPLOYMENT',
      configured,
      health,
      capabilities: ['SIGNED_UPLOAD', 'SIGNED_DOWNLOAD', 'HEAD_OBJECT', 'BOUNDED_READ'],
      boundary: 'Storage credentials remain deployment secrets; this registry exposes configuration state only.',
    };
  }

  private smartMeter(): Omit<IntegrationCapabilityView, keyof IntegrationContractMetadata> {
    return {
      family: 'SMART_METER',
      provider: 'utility-integration-v2',
      configurationScope: 'SOCIETY',
      configured: true,
      health: 'READY',
      capabilities: ['METER_READING_INGESTION', 'IDEMPOTENT_INGESTION', 'QUARANTINE', 'METER_MAPPING', 'KEY_ROTATION'],
      boundary: 'Smart-meter providers submit through the existing utility integration boundary; raw provider credentials remain isolated from utility billing state.',
    };
  }

  private accountingConnector(): Omit<IntegrationCapabilityView, keyof IntegrationContractMetadata> {
    const provider = (process.env.ACCOUNTING_CONNECTOR_PROVIDER ?? 'configured-http').trim() || 'configured-http';
    const configured = this.present('ACCOUNTING_CONNECTOR_BASE_URL');
    return {
      family: 'ACCOUNTING_CONNECTOR',
      provider,
      configurationScope: 'DEPLOYMENT',
      configured,
      health: configured ? 'READY' : 'UNCONFIGURED',
      capabilities: ['IMMUTABLE_EXPORT_DELIVERY', 'IDEMPOTENT_DELIVERY', 'PROVIDER_RECEIPT'],
      boundary: 'Connectors transport immutable exports and cannot rewrite Aaraagate journals or payment history.',
    };
  }

  private present(name: string) {
    return Boolean(process.env[name]?.trim());
  }
}
