import { UserRole } from './user.entity';

export interface AuthenticatedUser {
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

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
}
