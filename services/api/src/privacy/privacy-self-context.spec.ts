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
    const privacy={selfContext:vi.fn().mockResolvedValue({categories:[{code:'VISITOR',name:'Visitor activity'}],consents:[],activeConsentCount:0,boundary:'evidence only'})};
    const controller=new PrivacySelfController(privacy as never,{} as never,incidents as never);

    await expect(controller.context({userId:'user-1',societyId:'society-1'})).resolves.toEqual({
      grievanceContact:{
        displayName:'Privacy Officer',
        email:'privacy@example.com',
        phone:'+919000000000',
        instructions:'Email for privacy questions',
      },
      privacyProgram:{categories:[{code:'VISITOR',name:'Visitor activity'}],consents:[],activeConsentCount:0,boundary:'evidence only'},
    });
    expect(incidents.getGrievanceContact).toHaveBeenCalledWith('society-1');
    expect(privacy.selfContext).toHaveBeenCalledWith('user-1','society-1');
  });

  it('returns no grievance contact outside society context', async () => {
    const incidents={getGrievanceContact:vi.fn()};
    const privacy={selfContext:vi.fn()};
    const controller=new PrivacySelfController(privacy as never,{} as never,incidents as never);
    await expect(controller.context({userId:'user-1'})).resolves.toEqual({grievanceContact:null,privacyProgram:null});
    expect(incidents.getGrievanceContact).not.toHaveBeenCalled();
    expect(privacy.selfContext).not.toHaveBeenCalled();
  });

  it('hides inactive grievance contacts', async () => {
    const incidents={getGrievanceContact:vi.fn().mockResolvedValue([{displayName:'Old contact',active:false}])};
    const privacy={selfContext:vi.fn().mockResolvedValue({categories:[],consents:[],activeConsentCount:0,boundary:'evidence only'})};
    const controller=new PrivacySelfController(privacy as never,{} as never,incidents as never);
    await expect(controller.context({userId:'user-1',societyId:'society-1'})).resolves.toEqual({grievanceContact:null,privacyProgram:{categories:[],consents:[],activeConsentCount:0,boundary:'evidence only'}});
  });
});
