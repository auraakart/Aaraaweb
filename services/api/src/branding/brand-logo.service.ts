import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { PRIVATE_OBJECT_STORAGE, ObjectStoragePort } from '../services-marketplace/object-storage.port';
import { MediaSafetyScannerPort } from '../services-marketplace/media-safety-scanner.port';
import { MAX_SOCIETY_LOGO_BYTES, validateSocietyLogoPng } from './society-logo-validation';

export const SOCIETY_LOGO_SCANNER = Symbol('SOCIETY_LOGO_SCANNER');
const MAX_PENDING = 4;

@Injectable()
export class BrandLogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: PrismaMembershipRepository,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(SOCIETY_LOGO_SCANNER) private readonly scanner: MediaSafetyScannerPort,
  ) {}

  private async authorize(societyId: string, userId: string, tx: Prisma.TransactionClient) {
    const rows = await this.memberships.findActiveByUserAndSociety(userId, societyId, tx);
    if (!hasPermission(rows.map(row => row.role), AppPermission.SOCIETY_CONFIGURATION_MANAGE)) {
      throw new ForbiddenException('Society branding management permission required');
    }
    if (!await tx.society.findFirst({ where: { id: societyId, status: 'ACTIVE' }, select: { id: true } })) {
      throw new NotFoundException('Active society not found');
    }
  }

  // No storage key, URL or object bytes are returned from ordinary metadata APIs.
  private present(asset: {
    id: string; status: string; contentType: string; contentLengthBytes: number;
    sha256: string | null; createdAt: Date; verifiedAt: Date | null;
  }) {
    return {
      id: asset.id, status: asset.status, contentType: asset.contentType,
      contentLengthBytes: asset.contentLengthBytes, sha256: asset.sha256,
      createdAt: asset.createdAt, verifiedAt: asset.verifiedAt,
    };
  }

  async list(societyId: string, userId: string) {
    return this.prisma.withTenantContext(societyId, async tx => {
      await this.authorize(societyId,userId,tx);
      const rows = await tx.societyBrandLogoAsset.findMany({
        where: { societyId }, orderBy: { createdAt: 'desc' }, take: 30,
      });
      return rows.map(row => this.present(row));
    });
  }

  async createUpload(societyId: string, userId: string, input: {
    contentType: string; contentLengthBytes: number;
  }) {
    if (input.contentType !== 'image/png' || !Number.isSafeInteger(input.contentLengthBytes) ||
        input.contentLengthBytes < 57 || input.contentLengthBytes > MAX_SOCIETY_LOGO_BYTES) {
      throw new BadRequestException('Only PNG society logos up to 512 KiB are accepted');
    }
    return this.prisma.withTenantContext(societyId, async tx => {
      await this.authorize(societyId,userId,tx);
      // Society-row lock serializes pending quota reservations.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Society" WHERE "id"=${societyId}::uuid FOR UPDATE`);
      // Preserve a full day after PUT expiry for confirmation/retry. Abandoned
      // reservations no longer consume the four-slot quota indefinitely.
      await tx.societyBrandLogoAsset.updateMany({
        where: { societyId, status: 'PENDING', uploadExpiresAt: { lt: new Date(Date.now() - 86400000) } },
        data: { status: 'REJECTED' },
      });
      const pending = await tx.societyBrandLogoAsset.count({
        where: { societyId, status: 'PENDING' },
      });
      if (pending >= MAX_PENDING) throw new ConflictException('Society has too many pending logos');
      const storageKey = 'societies/' + societyId + '/branding/logos/' + randomUUID() + '.png';
      const upload = await this.storage.createUploadIntent({
        storageKey, contentType: 'image/png', contentLengthBytes: input.contentLengthBytes,
      });
      if (upload.publicUrl !== null) throw new ConflictException('Logo upload did not use private storage');
      const asset = await tx.societyBrandLogoAsset.create({
        data: {
          societyId, createdById: userId, storageKey, contentType: 'image/png',
          contentLengthBytes: input.contentLengthBytes, uploadExpiresAt: new Date(upload.expiresAt),
        },
      });
      return {
        asset: this.present(asset),
        upload: { method: upload.method, url: upload.uploadUrl,
          headers: upload.headers, expiresAt: upload.expiresAt },
      };
    });
  }

  async cancelUpload(societyId: string, userId: string, id: string) {
    return this.prisma.withTenantContext(societyId, async tx => {
      await this.authorize(societyId, userId, tx);
      const asset = await tx.societyBrandLogoAsset.findFirst({ where: { id, societyId } });
      if (!asset) throw new NotFoundException('Society logo not found');
      if (asset.status === 'VERIFIED') throw new ConflictException('A verified logo cannot be cancelled');
      await tx.societyBrandLogoAsset.updateMany({ where: { id, societyId, status: 'PENDING' }, data: { status: 'REJECTED' } });
      // Never delete potentially writable objects before their PUT expires.
      return { id, status: 'REJECTED' as const };
    });
  }

  async confirmUpload(societyId: string, userId: string, id: string) {
    const asset = await this.prisma.withTenantContext(societyId, async tx => {
      await this.authorize(societyId,userId,tx);
      return tx.societyBrandLogoAsset.findFirst({ where: { id, societyId } });
    });
    if (!asset) throw new NotFoundException('Society logo not found');
    if (asset.status !== 'PENDING') throw new ConflictException('Society logo is no longer pending');
    // Do not mark bytes immutable while a valid presigned PUT can replace them.
    if (asset.uploadExpiresAt.getTime() > Date.now()) {
      throw new ConflictException('Logo upload URL must expire before confirmation');
    }
    let digest: ReturnType<typeof validateSocietyLogoPng>;
    try {
      const metadata = await this.storage.headObject(asset.storageKey);
      if (!metadata || metadata.contentType?.split(';',1)[0]?.trim().toLowerCase() !== 'image/png' ||
          metadata.contentLengthBytes !== asset.contentLengthBytes) {
        throw new BadRequestException('Society logo object metadata mismatch');
      }
      const data = await this.storage.getObjectBytes(asset.storageKey, MAX_SOCIETY_LOGO_BYTES);
      if (!data || data.byteLength !== asset.contentLengthBytes) {
        throw new BadRequestException('Society logo object was missing or changed');
      }
      digest = validateSocietyLogoPng(data);
      const scan = await this.scanner.scanObject({
        storageKey: asset.storageKey, contentType: 'image/png',
        contentLengthBytes: asset.contentLengthBytes,
      });
      if (scan.status !== 'CLEAN') throw new BadRequestException('Society logo failed malware scan');
    } catch (error) {
      if (error instanceof BadRequestException) {
        await this.prisma.withTenantContext(societyId, async tx => {
          await this.authorize(societyId,userId,tx);
          await tx.societyBrandLogoAsset.updateMany({
            where: { societyId, id, status: 'PENDING' }, data: { status: 'REJECTED' },
          });
        });
      }
      throw error;
    }
    return this.prisma.withTenantContext(societyId, async tx => {
      await this.authorize(societyId,userId,tx);
      const change = await tx.societyBrandLogoAsset.updateMany({
        where: { societyId, id, status: 'PENDING' },
        data: { status: 'VERIFIED', sha256: digest.sha256, verifiedAt: new Date() },
      });
      if (change.count !== 1) throw new ConflictException('Society logo already processed');
      const verified = await tx.societyBrandLogoAsset.findFirst({ where: { id, societyId } });
      if (!verified) throw new NotFoundException('Society logo not found after verification');
      return this.present(verified);
    });
  }
}
