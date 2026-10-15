import { describe, expect, it, vi } from 'vitest';
import { DocumentsService } from './documents.service';

describe('DocumentsService society knowledge relevance',()=>{
  it('filters generic intent terms, rejects weak long-query matches, and ranks by distinctive-term coverage',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([
      {
        id:'weak-newer',title:'Parking circular',description:null,category:'PARKING',version:2,
        publishedAt:new Date('2026-09-29T10:00:00Z'),
        contentText:'Parking arrangements are reviewed monthly.',contentHash:'weak',
      },
      {
        id:'strong-older',title:'Visitor parking handbook',description:'Overnight visitor parking',category:'PARKING',version:1,
        publishedAt:new Date('2026-09-20T10:00:00Z'),
        contentText:'Visitor parking requires an overnight permit issued under the published process.',contentHash:'strong',
      },
      {
        id:'partial',title:'Overnight vehicle access',description:'Parking permit instructions',category:'PARKING',version:1,
        publishedAt:new Date('2026-09-25T10:00:00Z'),
        contentText:'Use the parking permit process for overnight vehicle access.',contentHash:'partial',
      },
    ])};
    const service=new DocumentsService(prisma as never);

    const result=await service.searchKnowledgeForUser(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'Please show society policy for visitor parking overnight permit',
    );

    expect(result.map(item=>item.documentId)).toEqual(['strong-older','partial']);
    expect(result[0]).toEqual(expect.objectContaining({
      matchedTerms:['visitor','parking','overnight','permit'],
      queryTermCount:4,
      coveragePercent:100,
    }));
    expect(result[1].coveragePercent).toBe(75);

    const sql=prisma.$queryRaw.mock.calls[0][0] as {values?:unknown[]};
    const values=(sql.values??[]).filter((value):value is string=>typeof value==='string');
    expect(values).toEqual(expect.arrayContaining(['%visitor%','%parking%','%overnight%','%permit%']));
    expect(values).not.toContain('%society%');
    expect(values).not.toContain('%policy%');
    expect(values).not.toContain('%please%');
    expect(values).not.toContain('%show%');
  });

  it('falls back to generic terms when the query contains no distinctive term',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{
      id:'policy-1',title:'Society policy',description:'Community rules',category:'POLICY',version:1,
      publishedAt:new Date('2026-09-29T10:00:00Z'),
      contentText:'Society policy and community rules.',contentHash:'policy',
    }])};
    const service=new DocumentsService(prisma as never);

    const result=await service.searchKnowledgeForUser('society-1','user-1','society policy rules');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({documentId:'policy-1',queryTermCount:3}));
    const sql=prisma.$queryRaw.mock.calls[0][0] as {values?:unknown[]};
    const values=(sql.values??[]).filter((value):value is string=>typeof value==='string');
    expect(values).toEqual(expect.arrayContaining(['%society%','%policy%','%rules%']));
  });
});
