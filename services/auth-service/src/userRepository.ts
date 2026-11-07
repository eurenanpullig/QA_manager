import { pool } from './db.js';

import type { ThemePreference, UserRecord, UserRole } from './db.js';

export class UserRepository {
  public async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await pool.query<UserRecord>(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL LIMIT 1',
      [email],
    );
    return result.rows[0] ?? null;
  }

  public async findById(id: string): Promise<UserRecord | null> {
    const result = await pool.query<UserRecord>(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [id],
    );
    return result.rows[0] ?? null;
  }

  public async listAll(): Promise<UserRecord[]> {
    const result = await pool.query<UserRecord>(
      'SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC',
    );
    return result.rows;
  }

  public async recordFailedAttempt(
    userId: string,
    failedAttempts: number,
    suspensionLevel: number,
    suspendedUntil: Date | null,
  ): Promise<UserRecord | null> {
    const result = await pool.query<UserRecord>(
      `UPDATE users
       SET failed_attempts = $2,
           suspension_level = $3,
           suspended_until = $4,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [userId, failedAttempts, suspensionLevel, suspendedUntil],
    );
    return result.rows[0] ?? null;
  }

  public async resetFailedAttempts(userId: string): Promise<void> {
    await pool.query(
      `UPDATE users
       SET failed_attempts = 0,
           suspension_level = 0,
           suspended_until = NULL,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
  }

  public async updatePreferences(
    userId: string,
    themePreference?: ThemePreference,
    fontScalePercent?: number,
  ): Promise<UserRecord | null> {
    const result = await pool.query<UserRecord>(
      `UPDATE users
       SET theme_preference = COALESCE($2, theme_preference),
           font_scale_percent = COALESCE($3, font_scale_percent),
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [userId, themePreference ?? null, fontScalePercent ?? null],
    );
    return result.rows[0] ?? null;
  }

  public async createUser(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    themePreference?: ThemePreference;
    fontScalePercent?: number;
  }): Promise<UserRecord> {
    const result = await pool.query<UserRecord>(
      `INSERT INTO users (name, email, password_hash, role, theme_preference, font_scale_percent)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.name,
        input.email,
        input.passwordHash,
        input.role,
        input.themePreference ?? 'DARK',
        input.fontScalePercent ?? 100,
      ],
    );
    const created = result.rows[0];
    if (!created) {
      throw new Error('Failed to insert user record.');
    }
    return created;
  }

  public async updateUserByAdmin(
    userId: string,
    input: {
      name?: string;
      role?: UserRole;
      isActive?: boolean;
      passwordHash?: string;
      unlockAccount?: boolean;
    },
  ): Promise<UserRecord | null> {
    const result = await pool.query<UserRecord>(
      `UPDATE users
       SET name = COALESCE($2, name),
           role = COALESCE($3, role),
           is_active = COALESCE($4, is_active),
           password_hash = COALESCE($5, password_hash),
           failed_attempts = CASE WHEN $6 = TRUE THEN 0 ELSE failed_attempts END,
           suspension_level = CASE WHEN $6 = TRUE THEN 0 ELSE suspension_level END,
           suspended_until = CASE WHEN $6 = TRUE THEN NULL ELSE suspended_until END,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [
        userId,
        input.name ?? null,
        input.role ?? null,
        input.isActive ?? null,
        input.passwordHash ?? null,
        input.unlockAccount ?? false,
      ],
    );
    return result.rows[0] ?? null;
  }

  public async softDeleteUser(userId: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE users
       SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
