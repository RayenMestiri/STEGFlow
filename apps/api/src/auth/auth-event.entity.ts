import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AuthEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  ACCOUNT_LOCKED = 'account_locked',
  REGISTER = 'register',
  REFRESH_REUSE = 'refresh_reuse',
  LOGOUT = 'logout',
}

/**
 * Journal d'audit des accès. Alimente le « journal d'audit » du poste agent et
 * permet de détecter une attaque par force brute sur un compte donné.
 */
@Entity('auth_events')
@Index(['email', 'createdAt'])
export class AuthEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: AuthEventType })
  type!: AuthEventType;

  /** Conservé même quand aucun compte ne correspond, pour tracer les tentatives. */
  @Column({ type: 'varchar' })
  email!: string;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', nullable: true })
  reason!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
