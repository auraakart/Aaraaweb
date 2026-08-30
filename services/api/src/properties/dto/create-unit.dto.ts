import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateUnitDto {
  @IsString() @IsNotEmpty() @MaxLength(30)
  number!: string;
}
