import { Injectable, Optional } from '@nestjs/common';
import { integrationContractMetadata, integrationOperationContracts, IntegrationContractMetadata, IntegrationOperationContract } from './integration-provider.contract';
import { IntegrationConfigurationService } from './integration-configuration.service';

export type IntegrationFamily =
  | 'OTP'
  | 'WHATSAPP'
  | 'PUSH'
  | 'TELEPHONY_IVR'
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
  operations: readonly IntegrationOperationContract[];
  boundary: string;
};

const SOCIETY_SELECTABLE_FAMILIES: readonly IntegrationFamily[] = ['OTP','WHATSAPP','PUSH','PAYMENT_GATEWAY','ACCESS_CONTROL','OBJECT_STORAGE','SMART_METER','ACCOUNTING_CONNECTOR'];

type IntegrationBaseCapability=Omit<IntegrationCapabilityView,keyof IntegrationContractMetadata|'operations'>;

@Injectable()
export class IntegrationRegistryService {
  constructor(@Optional() private readonly configuration?: IntegrationConfigurationService) {}

  list(societyId: string): IntegrationCapabilityView[] {
    void societyId;
    return [
      this.otp(),
      this.whatsApp(),
      this.push(),
      this.telephonyIvr(),
      this.paymentGateway(),
      this.accessControl(),
      this.objectStorage(),
      this.smartMeter(),
      this.accountingConnector(),
    ].map((item) => ({ ...item, ...integrationContractMetadata(item.family), operations:integrationOperationContracts(item.family) }));
  }

  async conformance(societyId:string){
    const selections=await this.configuration?.list(societyId)??[];
    return this.list(societyId).map(item=>{
      const simulatorOrReference=item.provider==='simulator'||item.provider==='reference-adapters'||item.provider==='utility-integration-v2';
      const operationIds=item.operations.map(operation=>operation.operationId);
      const checks={
        versionedContract:Boolean(item.contractVersion),
        explicitRetryPolicy:Boolean(item.retryDisposition&&item.retryOwner),
        explicitDegradationMode:Boolean(item.degradationMode),
        domainTruthIsolation:['PAYMENT_GATEWAY','ACCOUNTING_CONNECTOR','SMART_METER','ACCESS_CONTROL','OTP'].includes(item.family)?true:Boolean(item.boundary),
        simulatorOrConfiguredEvidence:simulatorOrReference||item.configured,
        operationContractsPresent:item.operations.length>0,
        operationContractsUnique:new Set(operationIds).size===operationIds.length,
        boundedOperationTimeouts:item.operations.every(operation=>operation.timeoutMs>=1000&&operation.timeoutMs<=120000),
        providerNeverAuthoritative:item.operations.every(operation=>operation.providerAuthority==='NONE'||operation.providerAuthority==='QUARANTINED_INPUT'),
        mutationIdempotencyExplicit:item.operations
          .filter(operation=>operation.direction!=='PROVIDER_TO_AARAAGATE'||operation.reconciliationRequired)
          .every(operation=>operation.idempotency!=='NOT_APPLICABLE'||operation.operationId==='HEALTH_CHECK'||operation.operationId==='CREATE_SIGNED_DOWNLOAD'),
      };
      const missing=Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key);
      const fieldEvidenceRequired=item.operations.some(operation=>operation.fieldEvidenceRequired);
      const selectionRequired=SOCIETY_SELECTABLE_FAMILIES.includes(item.family);
      const selection=selectionRequired?selections.find(row=>row.family===item.family):undefined;
      const societySelectionReady=!selectionRequired||Boolean(selection?.enabled&&selection.providerKey===item.provider);
      const adapterConfigurationReady=item.configured;
      const configurationReady=adapterConfigurationReady&&societySelectionReady;
      const configurationBlockers:string[]=[];
      if(!adapterConfigurationReady)configurationBlockers.push('ADAPTER_CONFIGURATION_NOT_READY');
      if(selectionRequired&&!selection)configurationBlockers.push('SOCIETY_SELECTION_MISSING');
      else if(selectionRequired&&!selection?.enabled)configurationBlockers.push('SOCIETY_SELECTION_DISABLED');
      else if(selectionRequired&&selection?.providerKey!==item.provider)configurationBlockers.push('SOCIETY_PROVIDER_MISMATCH');
      const contractReady=missing.length===0;
      const productionActivationApproved=configurationReady&&contractReady&&!fieldEvidenceRequired&&item.health==='READY';
      return {
        family:item.family,provider:item.provider,health:item.health,checks,missing,configurationBlockers,
        status:missing.length?'CONTRACT_GAP':!configurationReady?'CONFIGURATION_REQUIRED':fieldEvidenceRequired?'FIELD_EVIDENCE_REQUIRED':'CONTRACT_READY',
        certificationClaim:false,adapterConfigurationReady,selectionRequired,societySelectionReady,
        selectedProviderKey:selection?.providerKey??null,societyEnabled:selection?.enabled??null,
        configurationReady,contractReady,fieldEvidenceRequired,productionActivationApproved,
        boundary:'Conformance combines adapter/deployment readiness with the society provider selection. Production activation stays false when the society selection is missing, disabled or points to another provider. Production activation stays false when external field evidence is required; this does not certify live provider acceptance, credentials, SLA, hardware compatibility or field deployment.',
      };
    });
  }

  async activationPlan(societyId:string){
    const conformance=await this.conformance(societyId);
    const items=conformance.map(item=>{
      const nextActions:string[]=[];
      if(item.status==='CONTRACT_GAP'){
        nextActions.push('Close the versioned adapter contract gaps before enabling this provider family.');
      }
      if(item.configurationBlockers.includes('ADAPTER_CONFIGURATION_NOT_READY')){
        nextActions.push('Complete deployment adapter configuration and validate health without exposing credentials.');
      }
      if(item.configurationBlockers.includes('SOCIETY_SELECTION_MISSING')){
        nextActions.push('Select the approved provider for this society.');
      }
      if(item.configurationBlockers.includes('SOCIETY_SELECTION_DISABLED')){
        nextActions.push('Enable the society provider selection after operator review.');
      }
      if(item.configurationBlockers.includes('SOCIETY_PROVIDER_MISMATCH')){
        nextActions.push('Align the society provider selection with the configured adapter.');
      }
      if(item.status==='FIELD_EVIDENCE_REQUIRED'){
        nextActions.push('Capture real provider or hardware field-acceptance evidence before production activation.');
      }
      if(item.productionActivationApproved){
        nextActions.push('Keep configuration evidence current and monitor provider health.');
      }
      return {
        family:item.family,
        provider:item.provider,
        status:item.status,
        productionActivationApproved:item.productionActivationApproved,
        fieldEvidenceRequired:item.fieldEvidenceRequired,
        blockers:[...item.missing,...item.configurationBlockers],
        nextActions,
      };
    });
    const summary={
      total:items.length,
      activationReady:items.filter(item=>item.productionActivationApproved).length,
      contractGaps:items.filter(item=>item.status==='CONTRACT_GAP').length,
      configurationRequired:items.filter(item=>item.status==='CONFIGURATION_REQUIRED').length,
      fieldEvidenceRequired:items.filter(item=>item.status==='FIELD_EVIDENCE_REQUIRED').length,
    };
    const status=
      summary.contractGaps>0?'BLOCKED_CONTRACT':
      summary.configurationRequired>0?'CONFIGURATION_REQUIRED':
      summary.fieldEvidenceRequired>0?'FIELD_EVIDENCE_REQUIRED':
      'READY_FOR_INTERNAL_ENABLEMENT';
    return {
      status,
      summary,
      items,
      generatedAt:new Date().toISOString(),
      certificationClaim:false,
      mutationPerformed:false,
      boundary:'Activation planning is repository/configuration evidence only. It does not certify provider credentials, SLA, payment acceptance, physical-device compatibility, legal acceptance or field deployment.',
    };
  }

  private otp(): IntegrationBaseCapability {
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

  private whatsApp(): IntegrationBaseCapability {
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

  private push(): IntegrationBaseCapability {
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

  private telephonyIvr(): IntegrationBaseCapability {
    const environment=process.env.NODE_ENV??'development';
    const provider=(process.env.GATE_IVR_PROVIDER??'').trim().toLowerCase();
    const simulator=environment!=='production'&&(!provider||provider==='simulator');
    return {
      family:'TELEPHONY_IVR',
      provider:simulator?'simulator':provider||'unconfigured',
      configurationScope:'DEPLOYMENT',
      configured:simulator,
      health:simulator?'READY':'UNCONFIGURED',
      capabilities:['GATE_APPROVAL_FALLBACK','DELIVERY_EVIDENCE','MANUAL_FALLBACK','SIMULATOR_CONTRACT'],
      boundary:'The non-production simulator proves escalation semantics only. No live telephony provider is claimed until a production adapter and credentials are explicitly wired.',
    };
  }

  private paymentGateway(): IntegrationBaseCapability {
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

  private accessControl(): IntegrationBaseCapability {
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

  private objectStorage(): IntegrationBaseCapability {
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

  private smartMeter(): IntegrationBaseCapability {
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

  private accountingConnector(): IntegrationBaseCapability {
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
