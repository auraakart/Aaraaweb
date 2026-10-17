export type PartnerDomainCandidate = Readonly<{ hostname: string; partnerId: string; brandId: string }>;
export type PartnerDomainOptions = { reservedHostnames?: string[] };
export function loadPartnerDomainContract(): Promise<{
 normalizePartnerDomainHostname(value: unknown, options?: PartnerDomainOptions): string;
 resolveVerifiedPartnerDomainHost(value: unknown, registry: unknown, nowUtc: string, options?: PartnerDomainOptions): PartnerDomainCandidate | null;
}>;
