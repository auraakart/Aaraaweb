import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsString } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { validationPipeOptions } from './validation-pipe.options';

class StrictPayloadDto {
  @IsString()
  name!: string;
}

describe('global validation pipe options', () => {
  it('rejects unexpected request payload fields instead of silently dropping them', async () => {
    const pipe = new ValidationPipe(validationPipeOptions);

    await expect(pipe.transform(
      { name: 'Aaraagate', unexpected: 'must-fail' },
      { type: 'body', metatype: StrictPayloadDto },
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts valid DTO payloads', async () => {
    const pipe = new ValidationPipe(validationPipeOptions);

    await expect(pipe.transform(
      { name: 'Aaraagate' },
      { type: 'body', metatype: StrictPayloadDto },
    )).resolves.toMatchObject({ name: 'Aaraagate' });
  });
});
