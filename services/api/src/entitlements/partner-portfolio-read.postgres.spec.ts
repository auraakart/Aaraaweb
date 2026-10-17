import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PartnerPortfolioReadService } from './partner-portfolio-read.service';
const database=process.env.DATABASE_URL?describe:describe.skip;
database('V5.4.8 partner workspace PostgreSQL authority',()=>{
 it('scopes discovery, denies foreign/revoked/suspended access and keeps brand manager member restriction',async()=>{
  const prisma=new PrismaService(),service=new PartnerPortfolioReadService(prisma);
  const user=randomUUID(),a=randomUUID(),b=randomUUID(),society=randomUUID();
  try{
   await prisma.user.create({data:{id:user,phone:'portal-'+user}});
   await prisma.partner.createMany({data:[{id:a,slug:'portal-'+a,displayName:'Partner A',status:'ACTIVE'},{id:b,slug:'portal-'+b,displayName:'Partner B',status:'ACTIVE'}]});
   await prisma.society.create({data:{id:society,code:'portal-'+society,name:'Society A',partnerId:a}});
   const m=await prisma.partnerMembership.create({data:{userId:user,partnerId:a,role:'BRAND_MANAGER'}});
   const discovery=await service.workspaces(user);expect(discovery.memberships).toHaveLength(1);expect(discovery.memberships[0].partner.id).toBe(a);
   expect(Object.keys(discovery.memberships[0]).sort()).toEqual(['id','partner','role']);
   expect((await service.portfolio(user,a)).societies).toEqual([{id:society,name:'Society A',status:'ACTIVE'}]);
   await expect(service.portfolio(user,b)).rejects.toBeInstanceOf(NotFoundException);
   await expect(service.members(user,a)).rejects.toBeInstanceOf(NotFoundException);
   await prisma.partnerMembership.update({where:{id:m.id},data:{role:'OWNER'}});
   expect((await service.members(user,a)).map(row=>Object.keys(row).sort())).toEqual([['createdAt','id','role']]);
   await prisma.partnerMembership.update({where:{id:m.id},data:{active:false}});
   expect((await service.workspaces(user)).memberships).toEqual([]);await expect(service.portfolio(user,a)).rejects.toBeInstanceOf(NotFoundException);
   await prisma.partnerMembership.update({where:{id:m.id},data:{active:true}});
   await prisma.partner.update({where:{id:a},data:{status:'RESTRICTED'}});
   expect((await service.workspaces(user)).memberships).toEqual([]);await expect(service.portfolio(user,a)).rejects.toBeInstanceOf(NotFoundException);
   await prisma.partner.update({where:{id:a},data:{status:'ACTIVE'}});
   await prisma.user.update({where:{id:user},data:{status:'SUSPENDED'}});
   expect((await service.workspaces(user)).memberships).toEqual([]);await expect(service.members(user,a)).rejects.toBeInstanceOf(NotFoundException);
  }finally{
   try{await prisma.partnerMembership.deleteMany({where:{userId:user}});await prisma.society.deleteMany({where:{id:society}});await prisma.partner.deleteMany({where:{id:{in:[a,b]}}});await prisma.user.deleteMany({where:{id:user}})}finally{await prisma.$disconnect()}
  }
 });
});
