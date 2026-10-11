/** Public presentation only. These values never grant identity or permissions. */
export interface BrandBootstrap {
  schemaVersion: 1;
  revision: string;
  brand: {
    id: string;
    displayName: string;
    colors: { primary: string; primaryDeep: string };
  };
}

export interface BrandContextConfig {
  branding: BrandBootstrap;
  society: { id: string; name: string } | null;
  entitlements: { productTier: string; enabledFeatures: string[] } | null;
}
