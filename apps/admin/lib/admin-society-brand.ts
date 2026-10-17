/** Presentation data only. Authorization and entitlements are always server-side. */
export type AdminSocietyBrand = Readonly<{
  displayName: string;
  primary: string;
  primaryDeep: string;
  onPrimaryDeep: '#000000' | '#FFFFFF';
  navigationInk: string;
}>;

const hex = /^#[0-9a-fA-F]{6}$/;
function luminance(color: string): number {
  const parts = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255);
  const linear = parts.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
/** Match the native app/server contrast policy: choose a readable foreground. */
function onPrimary(color: string): '#000000' | '#FFFFFF' {
  return (luminance(color) + 0.05) / 0.05 >= 4.5 ? '#000000' : '#FFFFFF';
}
function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x,y)+0.05) / (Math.min(x,y)+0.05);
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
  // Semantic danger/success colors stay untouched. Choose a foreground for
  // branded buttons and an independently readable ink for pale nav surfaces.
  const navigationInk = contrast(primaryDeep,'#E6F3EC') >= 4.5 ? primaryDeep : '#17323A';
  return {
    displayName:name,
    primary:primary.toUpperCase(),
    primaryDeep:primaryDeep.toUpperCase(),
    onPrimaryDeep:onPrimary(primaryDeep),
    navigationInk:navigationInk.toUpperCase(),
  };
}
