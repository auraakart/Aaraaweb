import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateFileSafetyModule } from '../storage/private-file-safety.module';
import { PrivateObjectStorageModule } from '../storage/private-object-storage.module';
import { DocumentsController } from './documents.controller';
import { DocumentsStorageService } from './documents-storage.service';
import { DocumentsService } from './documents.service';

@Module({
  imports: [PrivateObjectStorageModule, PrivateFileSafetyModule],
  controllers: [DocumentsController],
  providers: [PrismaService, DocumentsService, DocumentsStorageService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
