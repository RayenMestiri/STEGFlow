import type { UserRole } from '../domain/constants.js';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  contractNumber: string | null;
  address: string | null;
  teamCode: string | null;
  phone: string | null;
  governorate: string | null;
  delegation: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  lastLoginAt: string | null;
}

export interface AuthContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
}
