import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { AiOperationsController } from './ai-operations.controller';

describe('V4.6 AI operations authorization',()=>{
  it('requires the AI assistant entitlement across the controller',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,AiOperationsController)).toBe(ProductFeature.AI_ASSISTANT);
    expect((Reflect.getMetadata(GUARDS_METADATA,AiOperationsController)??[]) as unknown[]).toContain(FeatureGuard);
  });

  it('keeps free-form assistant query dynamically permission checked rather than granting a broad static permission',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype.assistantQuery)).toBeUndefined();
  });

  it('requires helpdesk mutation permission for natural-language complaint proposals',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype.helpdeskFromText)).toEqual([AppPermission.HELPDESK_MANAGE_OWN]);
  });

  it('requires notice management for AI notice drafts and audit read for AI action history',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype.noticeDraft)).toEqual([AppPermission.NOTICE_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype.audit)).toEqual([AppPermission.AUDIT_READ]);
  });
  it('summary requires the resident helpdesk read boundary',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype.summary)).toEqual([AppPermission.HELPDESK_READ_OWN]);
  });

  it('finance summary requires owner finance visibility',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype.financeSummary)).toEqual([AppPermission.PROPERTY_FINANCE_READ]);
  });

  it('operations summary requires the existing helpdesk review boundary',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype.operationsSummary)).toEqual([AppPermission.HELPDESK_REVIEW]);
  });

  it('overdue finance summary requires the society finance read boundary',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype.overdueFinanceSummary)).toEqual([AppPermission.FINANCE_READ]);
  });

  for(const method of ['proposeHelpdesk','confirm','cancel'] as const){
    it(`${method} requires the resident helpdesk mutation permission`,()=>{
      expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype[method])).toEqual([AppPermission.HELPDESK_MANAGE_OWN]);
    });
  }

  for(const method of ['proposeAmenityBooking','confirmAmenity','cancelAmenity'] as const){
    it(`${method} requires the resident amenity booking permission`,()=>{
      expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype[method])).toEqual([AppPermission.AMENITY_BOOK_OWN]);
    });
  }

  for(const method of ['proposeVisitorPass','confirmVisitor','cancelVisitor'] as const){
    it(`${method} requires the resident visitor mutation permission`,()=>{
      expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype[method])).toEqual([AppPermission.VISITOR_MANAGE_OWN]);
    });
  }
});
