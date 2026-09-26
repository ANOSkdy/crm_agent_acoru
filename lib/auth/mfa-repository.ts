import 'server-only'
import { randomBytes } from 'node:crypto'
import {
  CHALLENGE_SECONDS,
  SESSION_SECONDS,
  tokenHash,
  type AuthEnvironment,
} from './mfa-crypto'

type Database = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<Record<string, unknown>[]>
}
export type Challenge = {
  token_hash: string
  user_id: string
  credential_version: string
  purpose: 'enroll' | 'verify'
  return_to: string
  secret_encrypted: string
  login_id: string
}

export class MfaRepository {
  constructor(
    private db: Database,
    readonly environment: AuthEnvironment,
  ) {}

  async otpCredential(userId: string) {
    const rows = await this.db.query(
      `SELECT m.user_id, m.version, m.secret_encrypted
      FROM auth_mfa_credentials m JOIN users u ON u.id=m.user_id
      WHERE m.user_id=$1 AND m.environment=$2 AND u.is_active=true`,
      [userId, this.environment],
    )
    return rows[0] as
      { user_id: string; version: string; secret_encrypted: string } | undefined
  }

  async completeOtp(
    userId: string,
    version: string,
    step: number,
    sessionHash: string,
    userAgent: string | null,
    ip: string | null,
  ) {
    const rows = await this.db.query(
      `WITH accepted AS (
      UPDATE auth_mfa_credentials m SET last_used_step=$4, confirmed_at=COALESCE(confirmed_at,now())
      WHERE user_id=$1 AND environment=$2 AND version=$3 AND last_used_step<$4
        AND EXISTS(SELECT 1 FROM users WHERE id=$1 AND is_active=true)
      RETURNING user_id,version
    ), session AS (
      INSERT INTO user_sessions(user_id,token_hash,expires_at,user_agent,ip_address,mfa_version,auth_environment)
      SELECT user_id,$5,now()+make_interval(secs=>$6),$7,$8,version,$2 FROM accepted RETURNING user_id
    ), logged AS (
      INSERT INTO audit_logs(user_id,action,target_type,after_json)
      SELECT user_id,'login_success_otp','auth',jsonb_build_object('environment',$2::text) FROM session
    ) SELECT user_id FROM session`,
      [
        userId,
        this.environment,
        version,
        step,
        sessionHash,
        SESSION_SECONDS,
        userAgent?.slice(0, 512) ?? null,
        ip?.slice(0, 128) ?? null,
      ],
    )
    return rows.length === 1
  }

  async rateLimit(
    scope: string,
    identifier: string,
    limit: number,
    seconds = 900,
  ) {
    const key = `${this.environment}:${scope}:${tokenHash(identifier)}`
    const [row] = await this.db.query(
      `
      INSERT INTO auth_login_limits(key, attempts, expires_at)
      VALUES ($1, 1, now() + make_interval(secs => $2))
      ON CONFLICT (key) DO UPDATE SET
        attempts = CASE WHEN auth_login_limits.expires_at <= now() THEN 1 ELSE auth_login_limits.attempts + 1 END,
        expires_at = CASE WHEN auth_login_limits.expires_at <= now() THEN excluded.expires_at ELSE auth_login_limits.expires_at END
      RETURNING attempts`,
      [key, seconds],
    )
    return Number(row.attempts) <= limit
  }

  async begin(userId: string, encryptedSecret: string, returnTo: string) {
    const token = randomBytes(32).toString('base64url')
    await this.db.query(
      `
      WITH credential AS (
        INSERT INTO auth_mfa_credentials(user_id, environment, secret_encrypted)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, environment) DO UPDATE SET user_id = excluded.user_id
        RETURNING *
      )
      INSERT INTO auth_login_challenges(token_hash, user_id, environment, credential_version, purpose, return_to, expires_at)
      SELECT $4, user_id, environment, version, CASE WHEN confirmed_at IS NULL THEN 'enroll' ELSE 'verify' END,
        $5, now() + make_interval(secs => $6) FROM credential`,
      [
        userId,
        this.environment,
        encryptedSecret,
        tokenHash(token),
        returnTo,
        CHALLENGE_SECONDS,
      ],
    )
    return token
  }

  async challenge(
    token: string,
    reserveAttempt = false,
  ): Promise<Challenge | null> {
    if (!/^[\w-]{43}$/.test(token)) return null
    const query = reserveAttempt
      ? `
      WITH challenge AS (
        UPDATE auth_login_challenges SET attempts = attempts + 1
        WHERE token_hash = $1 AND environment = $2 AND consumed_at IS NULL AND expires_at > now() AND attempts < 5
        RETURNING *
      )`
      : `WITH challenge AS (
        SELECT * FROM auth_login_challenges WHERE token_hash = $1 AND environment = $2
          AND consumed_at IS NULL AND expires_at > now() AND attempts < 5
      )`
    const rows = await this.db.query(
      `${query}
      SELECT c.token_hash, c.user_id, c.credential_version, c.purpose, c.return_to, m.secret_encrypted, u.login_id
      FROM challenge c JOIN auth_mfa_credentials m
        ON m.user_id = c.user_id AND m.environment = c.environment AND m.version = c.credential_version
      JOIN users u ON u.id = c.user_id
      WHERE u.is_active = true AND (u.locked_until IS NULL OR u.locked_until <= now())
        AND ((c.purpose = 'enroll' AND m.confirmed_at IS NULL) OR (c.purpose = 'verify' AND m.confirmed_at IS NOT NULL))`,
      [tokenHash(token), this.environment],
    )
    return (rows[0] as Challenge | undefined) ?? null
  }

  async complete(
    challenge: Challenge,
    step: number,
    sessionHash: string,
    userAgent: string | null,
    ip: string | null,
  ) {
    // Credential row serializes competing OTP attempts. The session, consumed challenge,
    // replay counter, and audit record commit together or not at all.
    const rows = await this.db.query(
      `
      WITH credential AS (
        UPDATE auth_mfa_credentials m SET last_used_step = $4, confirmed_at = COALESCE(m.confirmed_at, now())
        WHERE m.user_id = $1 AND m.environment = $2 AND m.version = $3 AND m.last_used_step < $4
          AND (( $8 = 'enroll' AND m.confirmed_at IS NULL) OR ($8 = 'verify' AND m.confirmed_at IS NOT NULL))
          AND EXISTS (SELECT 1 FROM auth_login_challenges c JOIN users u ON u.id = c.user_id
            WHERE c.token_hash = $5 AND c.user_id = m.user_id AND c.environment = m.environment
              AND c.credential_version = m.version AND c.purpose = $8
              AND c.consumed_at IS NULL AND c.expires_at > now() AND c.attempts BETWEEN 1 AND 5
              AND u.is_active = true AND (u.locked_until IS NULL OR u.locked_until <= now()))
        RETURNING user_id, version
      ), consumed AS (
        UPDATE auth_login_challenges SET consumed_at = now()
        WHERE token_hash = $5 AND consumed_at IS NULL AND EXISTS (SELECT 1 FROM credential)
        RETURNING user_id
      ), session AS (
        INSERT INTO user_sessions(user_id, token_hash, expires_at, user_agent, ip_address, mfa_version, auth_environment)
        SELECT user_id, $6, now() + make_interval(secs => $7), $9, $10, $3, $2 FROM consumed
        RETURNING user_id
      ), updated_user AS (
        UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now(), updated_at = now()
        WHERE id IN (SELECT user_id FROM session) RETURNING id
      ), audit AS (
        INSERT INTO audit_logs(user_id, action, target_type, after_json)
        SELECT user_id, 'login_success_mfa', 'auth', jsonb_build_object('environment', $2::text, 'enrollment', $8 = 'enroll') FROM session
      ) SELECT user_id FROM session`,
      [
        challenge.user_id,
        this.environment,
        challenge.credential_version,
        step,
        challenge.token_hash,
        sessionHash,
        SESSION_SECONDS,
        challenge.purpose,
        userAgent?.slice(0, 512) ?? null,
        ip?.slice(0, 128) ?? null,
      ],
    )
    return rows.length === 1
  }

  async cleanup() {
    await this.db.query(
      "DELETE FROM auth_login_challenges WHERE expires_at < now() - interval '1 day'",
    )
    await this.db.query(
      "DELETE FROM auth_login_limits WHERE expires_at < now() - interval '1 day'",
    )
  }
}
