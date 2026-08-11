import { AuthenticatedUser } from './user';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterTenantRequest {
  tenantName: string;
  fullName: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthenticatedUser;
}
