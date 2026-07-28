import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  SUPERVISOR = 'supervisor',
  DISPATCHER = 'dispatcher',
  TECHNICIAN = 'technician',
  CITIZEN = 'citizen',
}

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CITIZEN })
  role!: UserRole;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'text', nullable: true })
  refreshTokenHash!: string | null;

  @Column({ type: 'varchar', nullable: true })
  contractNumber!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', nullable: true })
  teamCode!: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  phone!: string | null;

  // --- Rattachement géographique ------------------------------------------
  // Le GPS localise le signalement ; le couple gouvernorat/délégation reste la
  // clé de rapprochement avec le réseau (poste, transformateur, départ).
  @Column({ type: 'varchar', nullable: true })
  governorate!: string | null;

  @Column({ type: 'varchar', nullable: true })
  delegation!: string | null;

  @Column({ type: 'varchar', nullable: true })
  district!: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  // --- Sécurité du compte --------------------------------------------------
  @Column({ type: 'int', default: 0 })
  failedLoginAttempts!: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  lastLoginIp!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  termsAcceptedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
