import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CitizenConfirmationKind } from './citizen-confirmation.entity';

export class CreateCitizenConfirmationDto {
  @ApiProperty({ enum: CitizenConfirmationKind })
  @IsEnum(CitizenConfirmationKind)
  kind!: CitizenConfirmationKind;

  @ApiProperty({ example: 'zone-el-menzah-6-a3' })
  @IsString()
  @MaxLength(120)
  zoneId!: string;

  @IsUUID()
  @IsOptional()
  outageId?: string;

  @IsUUID()
  @IsOptional()
  incidentId?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
}
