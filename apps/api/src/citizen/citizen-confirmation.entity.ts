import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum CitizenConfirmationKind {
  OUTAGE_CONFIRMED = 'outage_confirmed',
  POWER_RESTORED = 'power_restored',
}

@Entity('citizen_confirmations')
export class CitizenConfirmationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar', nullable: true })
  contractNumber!: string | null;

  @Column({ type: 'varchar' })
  zoneId!: string;

  @Column({ type: 'enum', enum: CitizenConfirmationKind })
  kind!: CitizenConfirmationKind;

  @Column({ type: 'varchar', nullable: true })
  outageId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  incidentId!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
