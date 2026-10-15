export const AARAAGATE_API_PREFIX = '/api/v1' as const;
export const AARAAGATE_ADMIN_SESSION_KEY = 'aaraagate.admin.session' as const;

export function requiredEnvironment(name: string, value?: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing required environment value: ${name}`);
  return normalized;
}
