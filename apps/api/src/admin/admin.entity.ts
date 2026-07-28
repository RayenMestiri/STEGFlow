import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum FieldTeamStatus {
  AVAILABLE = 'available',
  ON_MISSION = 'on_mission',
  RETURNING = 'returning',
  OFFLINE = 'offline',
}

@Entity('field_teams')
export class FieldTeamEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  code!: string;

  @Column()
  name!: string;

  @Column()
  leadName!: string;

  @Column({ type: 'varchar', length: 24 })
  phone!: string;

  @Column()
  vehicle!: string;

  @Column({ type: 'enum', enum: FieldTeamStatus, default: FieldTeamStatus.AVAILABLE })
  status!: FieldTeamStatus;

  @Column({ type: 'integer', default: 2 })
  members!: number;

  @Column()
  base!: string;

  @Column({ type: 'text', array: true, default: '{}' })
  skills!: string[];

  @Column({ type: 'uuid', nullable: true })
  currentMissionId!: string | null;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location!: object | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

export enum NotificationCampaignStatus {
  QUEUED = 'queued',
  SENDING = 'sending',
  DELIVERED = 'delivered',
  PARTIAL = 'partial',
  FAILED = 'failed',
}

@Entity('notification_campaigns')
export class NotificationCampaignEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  reference!: string;

  @Column({ unique: true })
  eventId!: string;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column()
  audienceLabel!: string;

  @Column({ type: 'varchar', nullable: true })
  zoneId!: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  channels!: string[];

  @Column({
    type: 'enum',
    enum: NotificationCampaignStatus,
    default: NotificationCampaignStatus.QUEUED,
  })
  status!: NotificationCampaignStatus;

  @Column({ type: 'integer', default: 0 })
  recipients!: number;

  @Column({ type: 'integer', default: 0 })
  delivered!: number;

  @Column({ type: 'integer', default: 0 })
  failed!: number;

  @Column({ default: 'Système STEGFlow' })
  createdBy!: string;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

export enum AuditSeverity {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

@Entity('operational_audit_logs')
export class OperationalAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  action!: string;

  @Column()
  category!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  details!: string | null;

  @Column({ type: 'enum', enum: AuditSeverity, default: AuditSeverity.INFO })
  severity!: AuditSeverity;

  @Column({ type: 'varchar', nullable: true })
  entityType!: string | null;

  @Column({ type: 'varchar', nullable: true })
  entityId!: string | null;

  @Column()
  actorEmail!: string;

  @Column()
  actorName!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('system_settings')
export class SystemSettingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  key!: string;

  @Column()
  group!: string;

  @Column()
  label!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb' })
  value!: boolean | number | string | string[];

  @Column({ default: 'system' })
  updatedBy!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
