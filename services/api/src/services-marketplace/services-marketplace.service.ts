import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessSubjectType, ProviderSocietyStatus, ProviderVerificationStatus, ServiceBookingStatus } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { ProductFeature } from '../entitlements/entitlement.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServicesMarketplaceService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementService, private readonly access: AccessService) {}

  private async assertEnabled(societyId: string) {
    if (!(await this.entitlements.isEnabled(societyId, ProductFeature.HOUSEHOLD_SERVICES))) throw new ForbiddenException('Household services marketplace is not enabled for this society');
  }

  private async assertResidentUnit(societyId: string, userId: string, unitId: string) {
    const link = await this.prisma.unitResident.findFirst({ where: { societyId, userId, unitId, active: true } });
    if (!link) throw new ForbiddenException('Unit does not belong to authenticated resident');
  }

  listCategories() { return this.prisma.serviceCategory.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }); }

  async listOfferings(societyId: string, categoryId?: string) {
    await this.assertEnabled(societyId);
    return this.prisma.serviceOffering.findMany({ where: { active: true, categoryId: categoryId || undefined, provider: { active: true, verification: ProviderVerificationStatus.VERIFIED, societies: { some: { societyId, status: ProviderSocietyStatus.APPROVED } } } }, include: { category: true, provider: { select: { id: true, businessName: true, description: true } } }, orderBy: { name: 'asc' } });
  }

  createCategory(name: string, slug: string, sortOrder = 0) { return this.prisma.serviceCategory.create({ data: { name: name.trim(), slug: slug.trim().toLowerCase(), sortOrder } }); }

  createProvider(input: { businessName: string; contactName?: string; phone: string; email?: string; description?: string }) {
    return this.prisma.serviceProvider.create({ data: { businessName: input.businessName.trim(), contactName: input.contactName?.trim() || null, phone: input.phone.trim(), email: input.email?.trim() || null, description: input.description?.trim() || null } });
  }

  verifyProvider(providerId: string) { return this.prisma.serviceProvider.update({ where: { id: providerId }, data: { verification: ProviderVerificationStatus.VERIFIED, active: true } }); }

  async approveProviderForSociety(societyId: string, providerId: string, commissionBps = 1000) {
    await this.assertEnabled(societyId);
    if (commissionBps < 0 || commissionBps > 10000) throw new BadRequestException('Commission must be between 0 and 10000 basis points');
    const provider = await this.prisma.serviceProvider.findFirst({ where: { id: providerId, active: true, verification: ProviderVerificationStatus.VERIFIED } });
    if (!provider) throw new BadRequestException('Provider must be verified before society approval');
    return this.prisma.serviceProviderSociety.upsert({ where: { societyId_providerId: { societyId, providerId } }, create: { societyId, providerId, status: ProviderSocietyStatus.APPROVED, commissionBps, approvedAt: new Date() }, update: { status: ProviderSocietyStatus.APPROVED, commissionBps, approvedAt: new Date() } });
  }

  async createOffering(providerId: string, categoryId: string, name: string, pricePaise: number, description?: string, durationMinutes?: number) {
    if (!Number.isInteger(pricePaise) || pricePaise < 0) throw new BadRequestException('Price must be a non-negative integer in paise');
    const provider = await this.prisma.serviceProvider.findFirst({ where: { id: providerId, active: true } });
    if (!provider) throw new NotFoundException('Service provider not found');
    const category = await this.prisma.serviceCategory.findFirst({ where: { id: categoryId, active: true } });
    if (!category) throw new NotFoundException('Service category not found');
    return this.prisma.serviceOffering.create({ data: { providerId, categoryId, name: name.trim(), description: description?.trim() || null, pricePaise, durationMinutes } });
  }

  async book(societyId: string, residentUserId: string, unitId: string, offeringId: string, scheduledFrom: Date, scheduledUntil: Date, notes?: string) {
    await this.assertEnabled(societyId);
    await this.assertResidentUnit(societyId, residentUserId, unitId);
    if (scheduledUntil <= scheduledFrom) throw new BadRequestException('Booking time window is invalid');
    const offering = await this.prisma.serviceOffering.findFirst({ where: { id: offeringId, active: true, provider: { active: true, verification: ProviderVerificationStatus.VERIFIED, societies: { some: { societyId, status: ProviderSocietyStatus.APPROVED } } } }, include: { provider: { include: { societies: { where: { societyId }, take: 1 } } } } });
    if (!offering) throw new NotFoundException('Service offering is unavailable for this society');
    const approval = offering.provider.societies[0];
    if (!approval) throw new NotFoundException('Service provider is not approved for this society');
    const commissionPaise = Math.round((offering.pricePaise * approval.commissionBps) / 10000);
    return this.prisma.serviceBooking.create({ data: { societyId, unitId, residentUserId, providerId: offering.providerId, offeringId: offering.id, scheduledFrom, scheduledUntil, servicePricePaise: offering.pricePaise, commissionBps: approval.commissionBps, commissionPaise, notes: notes?.trim() || null }, include: { offering: true, provider: true } });
  }

  listMine(societyId: string, residentUserId: string) { return this.prisma.serviceBooking.findMany({ where: { societyId, residentUserId }, include: { offering: { include: { category: true } }, provider: true, rating: true, accessRequest: true }, orderBy: { createdAt: 'desc' } }); }

  async confirm(societyId: string, bookingId: string) {
    await this.assertEnabled(societyId);
    const booking = await this.prisma.serviceBooking.findFirst({ where: { id: bookingId, societyId }, include: { provider: true, offering: true } });
    if (!booking) throw new NotFoundException('Service booking not found');
    if (booking.status !== ServiceBookingStatus.REQUESTED) throw new BadRequestException(`Booking is ${booking.status.toLowerCase()}`);
    const request = await this.access.create(societyId, booking.residentUserId, booking.unitId, AccessSubjectType.SERVICE_PROVIDER, booking.provider.businessName, booking.provider.phone, booking.offering.name, { bookingId: booking.id, providerId: booking.providerId, offeringId: booking.offeringId });
    const approved = await this.access.approve(societyId, booking.residentUserId, request.id, booking.scheduledFrom, booking.scheduledUntil);
    const updated = await this.prisma.serviceBooking.update({ where: { id: booking.id }, data: { status: ServiceBookingStatus.CONFIRMED, accessRequestId: approved.request.id }, include: { offering: true, provider: true, accessRequest: true } });
    return { booking: updated, accessCredential: approved.credential };
  }

  async cancelMine(societyId: string, residentUserId: string, bookingId: string) {
    const booking = await this.prisma.serviceBooking.findFirst({ where: { id: bookingId, societyId, residentUserId } });
    if (!booking) throw new NotFoundException('Service booking not found');
    if (booking.status !== ServiceBookingStatus.REQUESTED && booking.status !== ServiceBookingStatus.CONFIRMED) throw new BadRequestException(`Booking is ${booking.status.toLowerCase()}`);
    if (booking.accessRequestId) await this.access.cancel(societyId, residentUserId, booking.accessRequestId);
    return this.prisma.serviceBooking.update({ where: { id: booking.id }, data: { status: ServiceBookingStatus.CANCELLED } });
  }

  async complete(societyId: string, bookingId: string) {
    const booking = await this.prisma.serviceBooking.findFirst({ where: { id: bookingId, societyId } });
    if (!booking) throw new NotFoundException('Service booking not found');
    if (booking.status !== ServiceBookingStatus.CONFIRMED && booking.status !== ServiceBookingStatus.IN_PROGRESS) throw new BadRequestException(`Booking is ${booking.status.toLowerCase()}`);
    return this.prisma.serviceBooking.update({ where: { id: booking.id }, data: { status: ServiceBookingStatus.COMPLETED } });
  }

  async rate(societyId: string, residentUserId: string, bookingId: string, score: number, comment?: string) {
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new BadRequestException('Rating must be an integer from 1 to 5');
    const booking = await this.prisma.serviceBooking.findFirst({ where: { id: bookingId, societyId, residentUserId, status: ServiceBookingStatus.COMPLETED } });
    if (!booking) throw new NotFoundException('Completed booking not found');
    return this.prisma.serviceRating.create({ data: { societyId, bookingId, providerId: booking.providerId, residentUserId, score, comment: comment?.trim() || null } });
  }
}
