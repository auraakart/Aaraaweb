export type AaraagateRole =
  | 'SUPER_ADMIN'
  | 'SOCIETY_ADMIN'
  | 'COMMITTEE_MEMBER'
  | 'FACILITY_MANAGER'
  | 'ACCOUNTANT'
  | 'OWNER'
  | 'TENANT'
  | 'FAMILY_MEMBER'
  | 'SECURITY_SUPERVISOR'
  | 'SECURITY_GUARD'
  | 'STAFF'
  | 'VENDOR';

export type AdminSession = {
  accessToken: string;
  role: AaraagateRole | string;
  societyName?: string;
};

export type ApiErrorBody = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type AttentionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AttentionItem = {
  id: string;
  domain: 'GATE' | 'FINANCE' | 'HELPDESK' | 'FACILITIES' | 'GOVERNANCE' | 'PRIVACY' | 'INTEGRATIONS' | 'PARKING';
  title: string;
  detail?: string;
  severity: AttentionSeverity;
  href: string;
  count?: number;
};
