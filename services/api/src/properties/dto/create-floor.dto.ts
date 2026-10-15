import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateFloorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(-20)
  sortOrder?: number;
}
