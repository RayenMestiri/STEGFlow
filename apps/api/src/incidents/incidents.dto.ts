import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsLatitude, IsLongitude, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateIncidentDto {
  @ApiProperty({ example: 'fire' })
  @IsIn(['outage', 'voltage', 'fire', 'wire', 'meter', 'other'])
  type!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  address!: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  photos?: string[];

  @IsString()
  @IsOptional()
  contractNumber?: string;
}
