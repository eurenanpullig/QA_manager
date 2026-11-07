import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://gt_admin:gt_secure_password@postgres-db:5432/gestor_testes';

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

export type UserRole = 'ADM' | 'LIDER_TESTES' | 'QA' | 'DEV';
export type ThemePreference = 'LIGHT' | 'DARK';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  theme_preference: ThemePreference;
  font_scale_percent: number;
  is_active: boolean;
  failed_attempts: number;
  suspended_until: Date | null;
  suspension_level: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface PublicUserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  theme_preference: ThemePreference;
  font_scale_percent: number;
  is_active: boolean;
  failed_attempts: number;
  suspended_until: Date | null;
  suspension_level: number;
  created_at: Date;
  updated_at: Date;
}

export function toPublicUser(user: UserRecord): PublicUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    theme_preference: user.theme_preference,
    font_scale_percent: user.font_scale_percent,
    is_active: user.is_active,
    failed_attempts: user.failed_attempts,
    suspended_until: user.suspended_until,
    suspension_level: user.suspension_level,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}
