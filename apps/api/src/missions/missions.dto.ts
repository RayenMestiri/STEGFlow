import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { MissionStatus } from './mission.entity';

export class UpdatePositionDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;
}

export class UpdateMissionStatusDto {
  @IsEnum(MissionStatus)
  status!: MissionStatus;

  @IsString()
  @IsOptional()
  diagnosis?: string;
}

export class UpdateMissionReportDto {
  @IsString()
  @IsOptional()
  diagnosis?: string;

  @IsInt()
  @Min(5)
  @Max(720)
  @IsOptional()
  estimatedRepairMinutes?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @IsOptional()
  requestedResources?: string[];
}

export class AddMissionPhotosDto {
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  urls!: string[];
}

export class CreateMissionEmergencyDto {
  @IsIn(['accident', 'electrical', 'security'])
  type!: 'accident' | 'electrical' | 'security';

  @IsString()
  @IsOptional()
  note?: string;

  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @IsLongitude()
  @IsOptional()
  longitude?: number;
}
