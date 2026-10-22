import { BadRequestException } from '@nestjs/common';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ResidentHistoryQuery {
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsDateString() beforeDate?: string;
  @IsOptional() @IsUUID() beforeId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) status?: string;
}

export function validateHistory(query: ResidentHistoryQuery) {
  if (!!query.beforeDate !== !!query.beforeId) throw new BadRequestException('Both cursor fields are required');
  if (query.beforeDate && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(query.beforeDate) || !Number.isFinite(Date.parse(query.beforeDate)))) {
    throw new BadRequestException('Invalid history cursor');
  }
  if (query.beforeId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.beforeId)) throw new BadRequestException('Invalid history cursor');
  if ((query.search?.length ?? 0) > 120) throw new BadRequestException('Search is too long');
  return `%${(query.search ?? '').trim().replace(/[\\%_]/g, '\\$&')}%`;
}
