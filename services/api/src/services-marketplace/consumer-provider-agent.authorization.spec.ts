import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('provider agent authorization boundary', () => {
  it('uses Bearer auth without society TenantGuard', () => {
    const source = readFileSync(join(__dirname, 'consumer-provider-agent.controller.ts'), 'utf8');
    expect(source).toContain('@UseGuards(BearerGuard)');
    expect(source).not.toContain('TenantGuard');
  });

  it('keeps platform identity linking permission-gated', () => {
    const source = readFileSync(join(__dirname, 'consumer-provider-agent-platform.controller.ts'), 'utf8');
    expect(source).toContain('PermissionsGuard');
    expect(source).toContain('AppPermission.PLATFORM_PROVIDER_VERIFY');
  });
});
