import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServiceBookingRatingService {
  constructor(private readonly prisma: PrismaService) {}

  async rateMine(societyId: string, residentUserId: string, bookingId: string, score: number, comment?: string) {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new BadRequestException('Rating must be an integer from 1 to 5');
    }
    const normalizedComment = comment?.trim() || null;
    if (normalizedComment && normalizedComment.length > 1000) {
      throw new BadRequestException('Rating comment must be 1000 characters or fewer');
    }

    return this.prisma.$transaction(async (tx) => {
      // Serialize rating creation on the booking so retries/double-submits cannot
      // race into the database-level one-rating-per-booking constraint.
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtext(${societyId}), hashtext(${bookingId}))
      `);
      const booking = await tx.serviceBooking.findFirst({
        where: {
          id: bookingId,
          societyId,
          residentUserId,
        },
        select: {
          id: true,
          providerId: true,
          status: true,
        },
      });
      if (!booking) throw new NotFoundException('Service booking not found');
      if (booking.status !== ServiceBookingStatus.COMPLETED) {
        throw new BadRequestException('Only completed services can be rated');
      }

      const existing = await tx.serviceRating.findUnique({ where: { bookingId } });
      if (existing) return existing;

      return tx.serviceRating.create({
        data: {
          societyId,
          bookingId,
          providerId: booking.providerId,
          residentUserId,
          score,
          comment: normalizedComment,
        },
      });
    });
  }
}
