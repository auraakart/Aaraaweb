/** Presentation data only. Authorization and entitlements are always server-side. */
export type AdminSocietyBrand = Readonly<{
  displayName: string;
  primary: string;
  primaryDeep: string;
}>;

const hex = /^#[0-9a-fA-F]{6}$/;
function luminance(color: string): number {
  const parts = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255);
  const linear = parts.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
/** Admin nav/primary controls currently use white text on the brand background. */
function supportsWhiteText(color: string): boolean {
  return (1.05 / (luminance(color) + 0.05)) >= 4.5;
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function parseAdminSocietyBrand(payload: unknown, expectedSocietyId: string): AdminSocietyBrand | null {
  const root = object(payload);
  const society = object(root?.society);
  const branding = object(root?.branding);
  const brand = object(branding?.brand);
  const colors = object(brand?.colors);
  if (society?.id !== expectedSocietyId || branding?.schemaVersion !== 1) return null;
  if (brand?.id !== 'aaraagate' || typeof branding?.revision !== 'string') return null;
  const name = typeof brand.displayName === 'string' ? brand.displayName.trim() : '';
  const primary = colors?.primary;
  const primaryDeep = colors?.primaryDeep;
  if (!name || name.length > 80 || typeof primary !== 'string' || typeof primaryDeep !== 'string') return null;
  if (!hex.test(primary) || !hex.test(primaryDeep)) return null;
  // Never inject arbitrary CSS. Reject colors that would hide primary-button
  // text rather than modifying control/status semantics to fit a bad palette.
  if (!supportsWhiteText(primary) || !supportsWhiteText(primaryDeep)) return null;
  return {displayName:name,primary:primary.toUpperCase(),primaryDeep:primaryDeep.toUpperCase()};
}
