import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IncidentSeverity, IncidentStatus } from '../incidents/incident.entity';
import { NotificationChannel } from '../notifications/notifications.service';
import { OutageStatus } from '../outages/outage.entity';
import { FieldTeamStatus } from './admin.entity';

export class UpdateOutageStatusDto {
  @IsEnum(OutageStatus)
  status!: OutageStatus;
}

export class UpdateIncidentDto {
  @IsEnum(IncidentStatus)
  @IsOptional()
  status?: IncidentStatus;

  @IsEnum(IncidentSeverity)
  @IsOptional()
  severity?: IncidentSeverity;
}

export class AssignIncidentDto {
  @IsString()
  teamId!: string;
}

export class UpdateFieldTeamDto {
  @IsEnum(FieldTeamStatus)
  status!: FieldTeamStatus;
}

export class SendNotificationDto {
  @IsString()
  title!: string;

  @IsString()
  body!: string;

  @IsString()
  audienceLabel!: string;

  @IsString()
  @IsOptional()
  zoneId?: string;

  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels!: NotificationChannel[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  recipients!: number;
}

export class SettingValueDto {
  @IsString()
  key!: string;

  @IsBoolean()
  @IsOptional()
  booleanValue?: boolean;

  @IsString()
  @IsOptional()
  stringValue?: string;

  @IsInt()
  @IsOptional()
  numberValue?: number;

  @IsObject()
  @IsOptional()
  objectValue?: Record<string, unknown>;
}

export class UpdateSettingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingValueDto)
  settings!: SettingValueDto[];
}
