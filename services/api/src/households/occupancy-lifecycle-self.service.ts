import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';

@Injectable()
export class OccupancyLifecycleSelfService {
  constructor(private readonly prisma: PrismaService, private readonly lifecycle: OccupancyLifecycleService) {}

  async requestTenantMoveInByPhone(societyId:string,ownerUserId:string,input:{unitId:string;tenantPhone:string;effectiveAt:Date;reason?:string}){
    const phone=this.normalizePhone(input.tenantPhone);
    if(!phone)throw new BadRequestException('Tenant mobile number is required');
    const owner=await this.prisma.unitOwnership.findFirst({where:{societyId,unitId:input.unitId,userId:ownerUserId,active:true,verified:true},select:{id:true}});
    if(!owner)throw new BadRequestException('Verified active ownership is required to initiate tenant move-in');
    const tenant=await this.prisma.user.findUnique({where:{phone},select:{id:true}});
    if(!tenant)throw new BadRequestException('Tenant must register with this mobile number before move-in can be requested');
    if(tenant.id===ownerUserId)throw new BadRequestException('Use the owner move-in flow for your own occupancy');
    return this.lifecycle.requestOwnerMoveIn(societyId,ownerUserId,{unitId:input.unitId,userId:tenant.id,relation:'TENANT' as never,effectiveAt:input.effectiveAt,reason:input.reason});
  }

  private normalizePhone(phone:string){return phone.trim().replace(/[\s()-]+/g,'');}
}
