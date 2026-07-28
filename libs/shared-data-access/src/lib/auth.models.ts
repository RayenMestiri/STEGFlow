export type UserRole =
  | 'admin'
  | 'supervisor'
  | 'dispatcher'
  | 'technician'
  | 'citizen';

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

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RegisterCitizen {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  contractNumber?: string;
  address?: string;
  governorate?: string;
  delegation?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  /** Obligatoire côté API : l'acceptation est horodatée à la création. */
  acceptTerms: boolean;
}
