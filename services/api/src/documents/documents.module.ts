import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [DocumentsController],
  providers: [PrismaService, DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
