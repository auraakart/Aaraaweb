import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe,expect,it } from 'vitest';

describe('V4.7 manual gate fallback isolation',()=>{
  it('keeps manual access processing independent of hardware integration module',()=>{
    const root=process.cwd();
    const moduleSource=readFileSync(join(root,'src/access/access.module.ts'),'utf8');
    const serviceSource=readFileSync(join(root,'src/access/access.service.ts'),'utf8');
    expect(moduleSource).not.toContain('access-integration');
    expect(serviceSource).not.toContain('access-integration');
    expect(serviceSource).toContain('gateMutation');
  });
});
