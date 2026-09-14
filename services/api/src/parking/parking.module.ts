import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ParkingController } from './parking.controller';
import { ParkingPermitService } from './parking-permit.service';
import { ParkingService } from './parking.service';

@Module({
  imports: [PrismaModule],
  controllers: [ParkingController],
  providers: [ParkingService, ParkingPermitService],
})
export class ParkingModule {}
