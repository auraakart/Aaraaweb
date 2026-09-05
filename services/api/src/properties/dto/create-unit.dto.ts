import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateUnitDto {
  @IsString() @IsNotEmpty() @MaxLength(30)
  number!: string;

  @IsOptional()
  @IsUUID()
  floorId?: string;
}
