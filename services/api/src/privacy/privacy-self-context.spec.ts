import { describe, expect, it, vi } from 'vitest';
import { PrivacySelfController } from './privacy-self.controller';

describe('PrivacySelfController resident context', () => {
  it('returns only the active configured grievance contact for society sessions', async () => {
    const incidents={
      getGrievanceContact:vi.fn().mockResolvedValue([{
        displayName:'Privacy Officer',
        email:'privacy@example.com',
        phone:'+919000000000',
        instructions:'Email for privacy questions',
        active:true,
        internalField:'must-not-leak',
      }]),
    };
    const controller=new PrivacySelfController({} as never,{} as never,incidents as never);

    await expect(controller.context({userId:'user-1',societyId:'society-1'})).resolves.toEqual({
      grievanceContact:{
        displayName:'Privacy Officer',
        email:'privacy@example.com',
        phone:'+919000000000',
        instructions:'Email for privacy questions',
      },
    });
    expect(incidents.getGrievanceContact).toHaveBeenCalledWith('society-1');
  });

  it('returns no grievance contact outside society context', async () => {
    const incidents={getGrievanceContact:vi.fn()};
    const controller=new PrivacySelfController({} as never,{} as never,incidents as never);
    await expect(controller.context({userId:'user-1'})).resolves.toEqual({grievanceContact:null});
    expect(incidents.getGrievanceContact).not.toHaveBeenCalled();
  });

  it('hides inactive grievance contacts', async () => {
    const incidents={getGrievanceContact:vi.fn().mockResolvedValue([{displayName:'Old contact',active:false}])};
    const controller=new PrivacySelfController({} as never,{} as never,incidents as never);
    await expect(controller.context({userId:'user-1',societyId:'society-1'})).resolves.toEqual({grievanceContact:null});
  });
});
