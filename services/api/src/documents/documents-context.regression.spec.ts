import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsService } from './documents.service';

const scope='11111111-1111-4111-8111-111111111111';
function fixture() {
  const row={id:'document',societyId:scope,unitId:null,audience:'ALL_MEMBERS',status:'DRAFT',title:'Parking policy',category:'POLICY',version:1,description:null,storageKey:`societies/${scope}/documents/file.pdf`,contentText:'Parking policy for overnight visitor permits.',contentHash:'hash',publishedAt:new Date()};
  const tx={
    $queryRaw:vi.fn(async(sql:Prisma.Sql):Promise<unknown[]>=>{
      if(sql.text.includes('AND "supersedesDocumentId"='))return [];
      if(sql.text.includes('SELECT DISTINCT uo."unitId"'))return [{unitId:'unit'}];
      return [row];
    }),
    $executeRaw:vi.fn().mockResolvedValue(1),
    unit:{findFirst:vi.fn().mockResolvedValue({id:'unit'}),findMany:vi.fn().mockResolvedValue([])},
  };
  const withTenantContext=vi.fn(async(societyId:string,run:(client:typeof tx)=>Promise<unknown>)=>{expect(societyId).toBe(scope);return run(tx);});
  const prisma=new Proxy({withTenantContext},{get(target,key){if(key==='withTenantContext')return target.withTenantContext;throw new Error(`Root document access: ${String(key)}`);}});
  return{row,tx,withTenantContext,service:new DocumentsService(prisma as never)};
}
const input={category:'POLICY',audience:'ALL_MEMBERS' as const,title:'Parking policy',storageKey:`societies/${scope}/documents/file.pdf`,fileName:'file.pdf',mimeType:'application/pdf',sizeBytes:100};
describe('Private document tenant boundaries',()=>{
  it.each(['listManagement','managementContext','listPublishedForUser','searchKnowledgeForUser','getManagementDocument','getPublishedDocumentForUser','createDraft','createReplacementDraft','publish','archive','history'] as const)('uses only one selected client for %s',async method=>{
    const f=fixture();
    if(method==='listManagement'||method==='managementContext')await f.service[method](scope);
    else if(method==='listPublishedForUser')await f.service.listPublishedForUser(scope,'resident');
    else if(method==='searchKnowledgeForUser')await f.service.searchKnowledgeForUser(scope,'resident','parking');
    else if(method==='getPublishedDocumentForUser')await f.service.getPublishedDocumentForUser(scope,'resident','document');
    else if(method==='getManagementDocument'||method==='history')await f.service[method](scope,'document');
    else if(method==='createDraft')await f.service.createDraft(scope,'operator',input);
    else if(method==='createReplacementDraft'){f.row.status='PUBLISHED';await f.service.createReplacementDraft(scope,'operator','document',input);}
    else await f.service[method](scope,'operator','document');
    expect(f.withTenantContext).toHaveBeenCalledOnce();
  });
  it('requires verified effective ownership and matching parents in download and knowledge authorization',async()=>{
    const f=fixture();await f.service.getPublishedDocumentForUser(scope,'resident','document');
    const sql=f.tx.$queryRaw.mock.calls[0][0];
    expect(sql.text).toContain('uo."verified" = true');expect(sql.text).toContain('uo."effectiveFrom" <= CURRENT_TIMESTAMP');expect(sql.text).toContain('JOIN "Building" ob');expect(sql.values).toContain('resident');
    f.tx.$queryRaw.mockClear();await f.service.searchKnowledgeForUser(scope,'resident','parking');
    expect(f.tx.$queryRaw.mock.calls[0][0].text).toContain('uo."verified"=true');
  });
  it('does not return history or mutate after a denied scoped document lookup',async()=>{
    const f=fixture();f.tx.$queryRaw.mockResolvedValue([]);
    await expect(f.service.history(scope,'foreign')).rejects.toThrow('not found');
    expect(f.tx.$queryRaw).toHaveBeenCalledOnce();
    await expect(f.service.archive(scope,'operator','foreign')).rejects.toThrow('not found');
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('keeps property eligibility inside the draft transaction and rejects foreign units',async()=>{
    const f=fixture();f.tx.unit.findFirst.mockResolvedValue(null);
    await expect(f.service.createDraft(scope,'operator',{...input,audience:'PROPERTY_OWNER_ONLY',unitId:'foreign'})).rejects.toThrow('Unit is not in current society');
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('returns stored bigint file sizes as JSON-safe exact numbers',async()=>{
    const f=fixture();Object.assign(f.row,{sizeBytes:100n});
    const rows=await f.service.listManagement(scope) as Array<{sizeBytes:unknown}>;
    expect(rows[0].sizeBytes).toBe(100);
    expect(()=>JSON.stringify(rows)).not.toThrow();
    const document=await f.service.getPublishedDocumentForUser(scope,'resident','document');
    expect(document.sizeBytes).toBe(100);expect(()=>JSON.stringify(document)).not.toThrow();
  });

  it('rejects unsafe stored file sizes rather than silently rounding them',async()=>{
    const f=fixture();Object.assign(f.row,{sizeBytes:BigInt(Number.MAX_SAFE_INTEGER)+1n});
    await expect(f.service.getPublishedDocumentForUser(scope,'resident','document')).rejects.toThrow('supported range');
  });

});
