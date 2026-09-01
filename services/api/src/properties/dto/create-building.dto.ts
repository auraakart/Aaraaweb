import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateBuildingDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  name!: string;

  @IsString() @IsNotEmpty() @MaxLength(30)
  code!: string;
}
