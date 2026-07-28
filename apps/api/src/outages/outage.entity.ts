import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum OutageStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  SCHEDULED = 'scheduled',
  NOTIFIED = 'notified',
  ACTIVE = 'active',
  RESTORED = 'restored',
  CLOSED = 'closed',
}

@Entity('outages')
export class OutageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  reference!: string;

  @Column()
  zoneId!: string;

  @Column()
  zoneLabel!: string;

  @Column()
  reason!: string;

  @Column({ type: 'enum', enum: OutageStatus, default: OutageStatus.DRAFT })
  status!: OutageStatus;

  @Column({ type: 'timestamptz' })
  startsAt!: Date;

  @Column({ type: 'integer' })
  durationMinutes!: number;

  @Column({ type: 'integer', default: 0 })
  affectedCustomers!: number;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
    nullable: true,
  })
  perimeter!: object | null;

  @Column({ default: false })
  supervisorApprovalRequired!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
