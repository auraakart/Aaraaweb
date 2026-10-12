import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

/**
 * V5.3 presentation-only society override. No HTML, CSS, URLs, secrets,
 * feature flags, roles, hostnames or financial/legal identifiers are accepted.
 */
export type SocietyBrandPresentation = {
  displayName?: string;
  colors?: { primary: string; primaryDeep: string };
};

const allowedRoot = new Set(['displayName', 'colors']);
const allowedColors = new Set(['primary', 'primaryDeep']);
const hexColor = /^#[0-9A-Fa-f]{6}$/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateSocietyBrandPresentation(value: unknown): SocietyBrandPresentation {
  if (!object(value) || !Object.keys(value).length || Object.keys(value).some(k => !allowedRoot.has(k))) {
    throw new BadRequestException('Unsupported society branding configuration');
  }
  const config: SocietyBrandPresentation = {};
  if ('displayName' in value) {
    if (typeof value.displayName !== 'string') throw new BadRequestException('Invalid branding display name');
    const name = value.displayName.trim();
    if (!name || name.length > 80 || /[<>\x00-\x1f\x7f]/.test(name)) {
      throw new BadRequestException('Invalid branding display name');
    }
    config.displayName = name;
  }
  if ('colors' in value) {
    if (!object(value.colors) || Object.keys(value.colors).length !== 2 ||
      Object.keys(value.colors).some(k => !allowedColors.has(k)) ||
      !hexColor.test(String(value.colors.primary)) || !hexColor.test(String(value.colors.primaryDeep))) {
      throw new BadRequestException('Invalid branding color tokens');
    }
    config.colors = {
      primary: String(value.colors.primary).toUpperCase(),
      primaryDeep: String(value.colors.primaryDeep).toUpperCase(),
    };
  }
  return config;
}

/** Canonical, input-order-independent digest, safe across PostgreSQL JSONB reads. */
export function societyBrandDigest(config: SocietyBrandPresentation): string {
  const normalized = validateSocietyBrandPresentation(config);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/** All approved primary colors receive accessible black/white foreground text. */
export function onBrandColor(hex: string): '#000000' | '#FFFFFF' {
  if (!hexColor.test(hex)) throw new BadRequestException('Invalid branding color token');
  const components = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 4.5 ? '#000000' : '#FFFFFF';
}
