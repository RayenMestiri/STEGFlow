import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum MissionStatus {
  ASSIGNED = 'assigned',
  ACCEPTED = 'accepted',
  EN_ROUTE = 'en_route',
  ON_SITE = 'on_site',
  DIAGNOSING = 'diagnosing',
  REPAIRING = 'repairing',
  TESTING = 'testing',
  RESTORED = 'restored',
  CLOSED = 'closed',
}

@Entity('missions')
export class MissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  reference!: string;

  @Column()
  teamCode!: string;

  @Column()
  incidentId!: string;

  @Column({ type: 'enum', enum: MissionStatus, default: MissionStatus.ASSIGNED })
  status!: MissionStatus;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  lastPosition!: object | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastPositionAt!: Date | null;

  @Column({ type: 'integer', nullable: true })
  etaMinutes!: number | null;

  @Column({ type: 'text', nullable: true })
  diagnosis!: string | null;

  @Column({ type: 'integer', nullable: true })
  estimatedRepairMinutes!: number | null;

  @Column({ type: 'text', nullable: true })
  reportNotes!: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  photoUrls!: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  requestedResources!: string[];

  @Column({ type: 'jsonb', default: [] })
  statusHistory!: Array<{
    status: MissionStatus;
    at: string;
    source: string;
  }>;

  @Column({ type: 'jsonb', default: [] })
  emergencyEvents!: Array<{
    type: string;
    note: string | null;
    latitude: number | null;
    longitude: number | null;
    createdAt: string;
  }>;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  enRouteAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  onSiteAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  restoredAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
