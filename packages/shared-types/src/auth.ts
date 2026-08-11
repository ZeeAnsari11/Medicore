import { AuthenticatedUser } from './user';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface AuthMeResponse extends AuthenticatedUser {
  permissions: string[];
}
