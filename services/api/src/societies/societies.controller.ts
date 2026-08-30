import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

class CreateSocietyDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 32)
  code!: string;
}

@Controller('societies')
export class SocietiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.society.findMany({ orderBy: { name: 'asc' } });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prisma.society.findUniqueOrThrow({
      where: { id },
      include: { buildings: true, gates: true },
    });
  }

  @Post()
  create(@Body() dto: CreateSocietyDto) {
    return this.prisma.society.create({ data: { name: dto.name.trim(), code: dto.code.trim().toUpperCase() } });
  }
}
