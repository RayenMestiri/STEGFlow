import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateOutageDto {
  @ApiProperty({ example: 'zone-el-menzah-6-a3' })
  @IsString()
  zoneId!: string;

  @ApiProperty({ example: 'El Menzah 6' })
  @IsString()
  zoneLabel!: string;

  @ApiProperty({ example: 'Maintenance préventive' })
  @IsString()
  reason!: string;

  @ApiProperty({ example: '2026-07-27T16:30:00+01:00' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ example: 90 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes!: number;

  @ApiProperty({ default: true, required: false })
  @IsBoolean()
  @IsOptional()
  supervisorApprovalRequired?: boolean;
}
