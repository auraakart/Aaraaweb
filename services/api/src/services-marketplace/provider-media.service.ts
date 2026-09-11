import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';
import { OBJECT_STORAGE, ObjectStoragePort } from './object-storage.port';

export type ProviderMediaKind = 'LOGO' | 'GALLERY';
export type ProviderMediaStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED';
export type ProviderMediaReviewDecision = 'APPROVED' | 'REJECTED';

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const MAX_GALLERY_ITEMS = 8;
const ALLOWED_CONTENT_TYPES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

type ProviderMediaRow = {
  id: string;
  providerId: string;
  kind: ProviderMediaKind;
  publicUrl: string | null;
  altText: string | null;
  sortOrder: number;
  status: ProviderMediaStatus;
  contentType: string | null;
  contentLengthBytes: number | null;
  originalFileName: string | null;
  uploadedAt: Date | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProviderMediaPrivateRow = ProviderMediaRow & { storageKey: string };

@Injectable()
export class ProviderMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerOperators: ConsumerProviderOperatorService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async listMyMedia(userId: string) {
    const provider = await this.providerOperators.resolveProvider(userId);
    return this.prisma.$queryRaw<ProviderMediaRow[]>(Prisma.sql`
      SELECT "id", "providerId", "kind", "publicUrl", "altText", "sortOrder", "status",
             "contentType", "contentLengthBytes", "originalFileName", "uploadedAt",
             "reviewedAt", "reviewNote", "createdAt", "updatedAt"
      FROM "ServiceProviderMedia"
      WHERE "providerId" = ${provider.providerId}::uuid
        AND "status" <> 'REMOVED'::"ProviderMediaStatus"
      ORDER BY "kind" ASC, "sortOrder" ASC, "createdAt" ASC
    `);
  }

  async createMyUploadIntent(
    userId: string,
    input: {
      kind: ProviderMediaKind;
      contentType: string;
      contentLengthBytes: number;
      originalFileName?: string;
      altText?: string;
    },
  ) {
    const provider = await this.providerOperators.resolveProvider(userId);
    const contentType = input.contentType.trim().toLowerCase();
    const extension = ALLOWED_CONTENT_TYPES.get(contentType);
    if (!extension) {
      throw new BadRequestException('Only JPEG, PNG and WebP provider images are allowed');
    }
    if (!Number.isInteger(input.contentLengthBytes) || input.contentLengthBytes <= 0 || input.contentLengthBytes > MAX_MEDIA_BYTES) {
      throw new BadRequestException('Provider media must be between 1 byte and 5 MB');
    }

    await this.assertMediaCapacity(provider.providerId, input.kind);

    const storageKey = `providers/${provider.providerId}/media/${randomUUID()}.${extension}`;
    const upload = await this.storage.createUploadIntent({
      storageKey,
      contentType,
      contentLengthBytes: input.contentLengthBytes,
    });

    const rows = await this.prisma.$queryRaw<ProviderMediaRow[]>(Prisma.sql`
      INSERT INTO "ServiceProviderMedia" (
        "providerId", "kind", "storageKey", "publicUrl", "altText", "sortOrder", "status",
        "contentType", "contentLengthBytes", "originalFileName", "createdAt", "updatedAt"
      )
      VALUES (
        ${provider.providerId}::uuid,
        ${input.kind}::"ProviderMediaKind",
        ${storageKey},
        ${upload.publicUrl},
        ${this.cleanOptional(input.altText, 160)},
        0,
        'PENDING'::"ProviderMediaStatus",
        ${contentType},
        ${input.contentLengthBytes},
        ${this.cleanOptional(input.originalFileName, 180)},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING "id", "providerId", "kind", "publicUrl", "altText", "sortOrder", "status",
                "contentType", "contentLengthBytes", "originalFileName", "uploadedAt",
                "reviewedAt", "reviewNote", "createdAt", "updatedAt"
    `);

    return { media: rows[0], upload };
  }

  async confirmMyUpload(userId: string, mediaId: string) {
    const provider = await this.providerOperators.resolveProvider(userId);
    const media = await this.getPrivateMedia(provider.providerId, mediaId);
    if (media.status !== 'PENDING') throw new BadRequestException('Only pending media can be confirmed');
    if (media.uploadedAt) return this.toPublicRow(media);
    if (!media.contentType || !media.contentLengthBytes) {
      throw new BadRequestException('Media upload metadata is incomplete');
    }

    const object = await this.storage.headObject(media.storageKey);
    if (!object) throw new BadRequestException('Uploaded object was not found');
    const actualContentType = object.contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? null;
    const matches = actualContentType === media.contentType && object.contentLengthBytes === media.contentLengthBytes;
    if (!matches) {
      await this.rejectInvalidUpload(media, object);
      throw new BadRequestException('Uploaded object does not match the declared media metadata');
    }

    const rows = await this.prisma.$queryRaw<ProviderMediaRow[]>(Prisma.sql`
      UPDATE "ServiceProviderMedia"
      SET "uploadedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${mediaId}::uuid
        AND "providerId" = ${provider.providerId}::uuid
        AND "status" = 'PENDING'::"ProviderMediaStatus"
      RETURNING "id", "providerId", "kind", "publicUrl", "altText", "sortOrder", "status",
                "contentType", "contentLengthBytes", "originalFileName", "uploadedAt",
                "reviewedAt", "reviewNote", "createdAt", "updatedAt"
    `);
    if (!rows[0]) throw new NotFoundException('Provider media not found');
    return rows[0];
  }

  async removeMyMedia(userId: string, mediaId: string) {
    const provider = await this.providerOperators.resolveProvider(userId);
    const media = await this.getPrivateMedia(provider.providerId, mediaId);
    if (media.status === 'REMOVED') return { id: media.id, status: 'REMOVED' as const };

    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "ServiceProviderMedia"
      SET "status" = 'REMOVED'::"ProviderMediaStatus", "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${mediaId}::uuid AND "providerId" = ${provider.providerId}::uuid
    `);
    try {
      await this.storage.deleteObject(media.storageKey);
    } catch {
      // Visibility is revoked in the application even if physical object cleanup must be retried operationally.
    }
    return { id: media.id, status: 'REMOVED' as const };
  }

  async listForModeration(status: ProviderMediaStatus = 'PENDING') {
    return this.prisma.$queryRaw<Array<ProviderMediaRow & { providerName: string }>>(Prisma.sql`
      SELECT m."id", m."providerId", m."kind", m."publicUrl", m."altText", m."sortOrder", m."status",
             m."contentType", m."contentLengthBytes", m."originalFileName", m."uploadedAt",
             m."reviewedAt", m."reviewNote", m."createdAt", m."updatedAt",
             p."businessName" AS "providerName"
      FROM "ServiceProviderMedia" m
      JOIN "ServiceProvider" p ON p."id" = m."providerId"
      WHERE m."status" = ${status}::"ProviderMediaStatus"
        AND m."uploadedAt" IS NOT NULL
      ORDER BY m."createdAt" ASC
    `);
  }

  async reviewMedia(
    actorUserId: string,
    mediaId: string,
    decision: ProviderMediaReviewDecision,
    note?: string,
  ) {
    const existing = await this.getPrivateMediaById(mediaId);
    if (existing.status !== 'PENDING' || !existing.uploadedAt) {
      throw new BadRequestException('Only uploaded pending media can be reviewed');
    }

    return this.prisma.$transaction(async (tx) => {
      if (decision === 'APPROVED' && existing.kind === 'LOGO') {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "ServiceProviderMedia"
          SET "status" = 'REMOVED'::"ProviderMediaStatus", "updatedAt" = CURRENT_TIMESTAMP
          WHERE "providerId" = ${existing.providerId}::uuid
            AND "kind" = 'LOGO'::"ProviderMediaKind"
            AND "status" = 'APPROVED'::"ProviderMediaStatus"
            AND "id" <> ${mediaId}::uuid
        `);
      }
      const rows = await tx.$queryRaw<ProviderMediaRow[]>(Prisma.sql`
        UPDATE "ServiceProviderMedia"
        SET "status" = ${decision}::"ProviderMediaStatus",
            "reviewedByUserId" = ${actorUserId}::uuid,
            "reviewedAt" = CURRENT_TIMESTAMP,
            "reviewNote" = ${this.cleanOptional(note, 500)},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${mediaId}::uuid
          AND "status" = 'PENDING'::"ProviderMediaStatus"
          AND "uploadedAt" IS NOT NULL
        RETURNING "id", "providerId", "kind", "publicUrl", "altText", "sortOrder", "status",
                  "contentType", "contentLengthBytes", "originalFileName", "uploadedAt",
                  "reviewedAt", "reviewNote", "createdAt", "updatedAt"
      `);
      if (!rows[0]) throw new NotFoundException('Pending provider media not found');
      return rows[0];
    });
  }

  private async assertMediaCapacity(providerId: string, kind: ProviderMediaKind) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "ServiceProviderMedia"
      WHERE "providerId" = ${providerId}::uuid
        AND "kind" = ${kind}::"ProviderMediaKind"
        AND "status" IN ('PENDING'::"ProviderMediaStatus", 'APPROVED'::"ProviderMediaStatus")
    `);
    const count = Number(rows[0]?.count ?? 0n);
    const limit = kind === 'LOGO' ? 1 : MAX_GALLERY_ITEMS;
    if (count >= limit) {
      throw new BadRequestException(kind === 'LOGO' ? 'Only one active or pending logo is allowed' : `A maximum of ${MAX_GALLERY_ITEMS} gallery images is allowed`);
    }
  }

  private async getPrivateMedia(providerId: string, mediaId: string) {
    const rows = await this.prisma.$queryRaw<ProviderMediaPrivateRow[]>(Prisma.sql`
      SELECT "id", "providerId", "kind", "storageKey", "publicUrl", "altText", "sortOrder", "status",
             "contentType", "contentLengthBytes", "originalFileName", "uploadedAt",
             "reviewedAt", "reviewNote", "createdAt", "updatedAt"
      FROM "ServiceProviderMedia"
      WHERE "id" = ${mediaId}::uuid AND "providerId" = ${providerId}::uuid
      LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Provider media not found');
    return rows[0];
  }

  private async getPrivateMediaById(mediaId: string) {
    const rows = await this.prisma.$queryRaw<ProviderMediaPrivateRow[]>(Prisma.sql`
      SELECT "id", "providerId", "kind", "storageKey", "publicUrl", "altText", "sortOrder", "status",
             "contentType", "contentLengthBytes", "originalFileName", "uploadedAt",
             "reviewedAt", "reviewNote", "createdAt", "updatedAt"
      FROM "ServiceProviderMedia"
      WHERE "id" = ${mediaId}::uuid
      LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Provider media not found');
    return rows[0];
  }

  private async rejectInvalidUpload(
    media: ProviderMediaPrivateRow,
    actual: { contentType: string | null; contentLengthBytes: number | null },
  ) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "ServiceProviderMedia"
      SET "status" = 'REMOVED'::"ProviderMediaStatus",
          "reviewNote" = ${`Upload metadata mismatch: expected ${media.contentType}/${media.contentLengthBytes}, got ${actual.contentType}/${actual.contentLengthBytes}`},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${media.id}::uuid
    `);
    try {
      await this.storage.deleteObject(media.storageKey);
    } catch {
      // Object cleanup can be retried; the media is already application-invisible.
    }
  }

  private cleanOptional(value: string | undefined, maxLength: number) {
    const clean = value?.trim();
    return clean ? clean.slice(0, maxLength) : null;
  }

  private toPublicRow(media: ProviderMediaPrivateRow): ProviderMediaRow {
    return {
      id: media.id,
      providerId: media.providerId,
      kind: media.kind,
      publicUrl: media.publicUrl,
      altText: media.altText,
      sortOrder: media.sortOrder,
      status: media.status,
      contentType: media.contentType,
      contentLengthBytes: media.contentLengthBytes,
      originalFileName: media.originalFileName,
      uploadedAt: media.uploadedAt,
      reviewedAt: media.reviewedAt,
      reviewNote: media.reviewNote,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
    };
  }
}
