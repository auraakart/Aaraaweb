import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { AppPermission, ROLE_PERMISSIONS } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { GovernanceArtifactsController } from './governance-artifacts.controller';
import { GovernancePollParticipationController } from './governance-poll-participation.controller';
import { GovernanceController } from './governance.controller';

const permissions=(controller:object,method:string)=>Reflect.getMetadata(PERMISSIONS_KEY,(controller as Record<string,unknown>)[method] as object) as AppPermission[]|undefined;
const core=GovernanceController.prototype;
const artifacts=GovernanceArtifactsController.prototype;
const polls=GovernancePollParticipationController.prototype;

function roleHas(role:AppRole,permission:AppPermission){return ROLE_PERMISSIONS[role].includes(permission);}

describe('V2.1C governance security closure',()=>{
  it('keeps resident participation separate from governance administration',()=>{
    for(const role of [AppRole.OWNER,AppRole.TENANT,AppRole.FAMILY_MEMBER]){
      expect(roleHas(role,AppPermission.NOTICE_READ)).toBe(true);
      expect(roleHas(role,AppPermission.GOVERNANCE_READ)).toBe(false);
      expect(roleHas(role,AppPermission.GOVERNANCE_MANAGE)).toBe(false);
    }
    expect(permissions(polls,'listAvailable')).toEqual([AppPermission.NOTICE_READ]);
    expect(permissions(polls,'respond')).toEqual([AppPermission.NOTICE_READ]);
    expect(permissions(polls,'setStatus')).toEqual([AppPermission.GOVERNANCE_MANAGE]);
  });

  it('keeps governance evidence and core mutations behind governance permissions',()=>{
    expect(permissions(artifacts,'listDocuments')).toEqual([AppPermission.GOVERNANCE_READ]);
    expect(permissions(artifacts,'addDocument')).toEqual([AppPermission.GOVERNANCE_MANAGE]);
    expect(permissions(artifacts,'verifyDocument')).toEqual([AppPermission.GOVERNANCE_MANAGE]);
    expect(permissions(artifacts,'listPolls')).toEqual([AppPermission.GOVERNANCE_READ]);
    expect(permissions(artifacts,'createPoll')).toEqual([AppPermission.GOVERNANCE_MANAGE]);
    expect(permissions(core,'listCommittee')).toEqual([AppPermission.GOVERNANCE_READ]);
    expect(permissions(core,'createMeeting')).toEqual([AppPermission.GOVERNANCE_MANAGE]);
    expect(permissions(core,'resolution')).toEqual([AppPermission.GOVERNANCE_MANAGE]);
  });

  it('preserves the database one-response and option-to-poll integrity boundaries',()=>{
    const sql=readFileSync(new URL('../../prisma/migrations/20260913053000_governance_poll_participation/migration.sql',import.meta.url),'utf8');
    expect(sql).toContain('UNIQUE ("pollId", "userId")');
    expect(sql).toContain('FOREIGN KEY ("optionId", "pollId") REFERENCES "GovernancePollOption"("id", "pollId")');
    expect(sql).toContain('FOREIGN KEY ("userId") REFERENCES "User"("id")');
  });

  it('preserves the non-statutory poll boundary in persistence',()=>{
    const sql=readFileSync(new URL('../../prisma/migrations/20260913050500_governance_documents_polls/migration.sql',import.meta.url),'utf8');
    expect(sql).toContain('CHECK ("statutoryUseProhibited" = TRUE)');
    expect(sql).toContain("CHECK (\"pollType\" IN ('ADVISORY','SURVEY'))");
  });
});
