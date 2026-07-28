import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum IncidentSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum IncidentStatus {
  REPORTED = 'reported',
  VERIFIED = 'verified',
  DISPATCHED = 'dispatched',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

@Entity('incidents')
export class IncidentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  reference!: string;

  @Column()
  type!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column()
  address!: string;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  location!: object;

  @Column({ type: 'enum', enum: IncidentSeverity, default: IncidentSeverity.MEDIUM })
  severity!: IncidentSeverity;

  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.REPORTED })
  status!: IncidentStatus;

  @Column({ type: 'text', array: true, default: '{}' })
  photos!: string[];

  @Column({ type: 'integer', default: 1 })
  communityConfirmations!: number;

  @Column({ type: 'varchar', nullable: true })
  contractNumber!: string | null;

  @Column({ type: 'varchar', nullable: true })
  assignedTeamCode!: string | null;

  @Column({ type: 'jsonb', default: [] })
  activity!: Array<{
    at: string;
    label: string;
    actor: string;
  }>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
