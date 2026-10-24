import { Controller,Get,Header,Param,ParseUUIDPipe,Req,UseGuards } from '@nestjs/common';
import { PartnerBearerGuard } from '../auth/partner-bearer.guard';
import { AuthenticatedRequest } from '../auth/bearer.guard';
import { PartnerReadinessService } from './partner-readiness.service';
@Controller('partners/:partnerId/readiness')
@UseGuards(PartnerBearerGuard)
export class PartnerReadinessController {
 constructor(private readonly readiness:PartnerReadinessService){}
 @Get() @Header('Cache-Control','no-store')
 read(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string){return this.readiness.read(req.auth!.userId,partnerId);}
}
