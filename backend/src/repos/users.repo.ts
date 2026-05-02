import { pool, query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { User, UserRole } from "../types/domain.js";

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  can_login: boolean;
  created_at: Date;
  updated_at: Date;
}

const USER_COLS = "id, email, name, password_hash, role, can_login, created_at, updated_at";

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    role: row.role,
    canLogin: row.can_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await query<UserRow>(
    `SELECT ${USER_COLS} FROM users WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await query<UserRow>(
    `SELECT ${USER_COLS} FROM users WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  role?: UserRole;
  canLogin?: boolean;
}): Promise<User> {
  const id = newId();
  const result = await query<UserRow>(
    `INSERT INTO users (id, email, name, password_hash, role, can_login)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${USER_COLS}`,
    [
      id,
      input.email,
      input.name,
      input.passwordHash,
      input.role ?? "customer",
      input.canLogin ?? true,
    ],
  );
  return mapUser(result.rows[0]!);
}

export async function countUsers(): Promise<number> {
  const result = await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
  return Number(result.rows[0]?.count ?? 0);
}

export async function countLoginAdmins(): Promise<number> {
  const result = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin' AND can_login = TRUE",
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function listUsers(): Promise<User[]> {
  const result = await query<UserRow>(
    `SELECT ${USER_COLS}
      FROM users
      ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'customer' THEN 1 ELSE 2 END, name ASC, email ASC`,
  );
  return result.rows.map(mapUser);
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  passwordHash?: string;
  role?: UserRole;
  canLogin?: boolean;
}

export type UserMutationResult =
  | { ok: true; user: User }
  | { ok: false; reason: "not_found" | "last_login_admin" };

function wouldRemoveLoginAdmin(existing: User, input: UpdateUserInput): boolean {
  const nextRole = input.role ?? existing.role;
  const nextCanLogin = input.canLogin ?? existing.canLogin;
  return existing.role === "admin"
    && existing.canLogin
    && (nextRole !== "admin" || !nextCanLogin);
}

function buildUpdateParts(input: UpdateUserInput): {
  sets: string[];
  params: unknown[];
  nextIndex: number;
} {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [key, col] of [
    ["email", "email"],
    ["name", "name"],
    ["passwordHash", "password_hash"],
    ["role", "role"],
    ["canLogin", "can_login"],
  ] as const) {
    if (key in input) {
      sets.push(`${col} = $${i++}`);
      params.push(input[key]);
    }
  }
  return { sets, params, nextIndex: i };
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User | null> {
  const { sets, params, nextIndex } = buildUpdateParts(input);
  let i = nextIndex;
  if (sets.length === 0) return findUserById(id);
  sets.push("updated_at = NOW()");
  params.push(id);
  const result = await query<UserRow>(
    `UPDATE users
        SET ${sets.join(", ")}
      WHERE id = $${i}
      RETURNING ${USER_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function updateUserGuardingLastLoginAdmin(
  id: string,
  input: UpdateUserInput,
): Promise<UserMutationResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingResult = await client.query<UserRow>(
      `SELECT ${USER_COLS} FROM users WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const existingRow = existingResult.rows[0];
    if (!existingRow) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "not_found" };
    }
    const existing = mapUser(existingRow);
    if (wouldRemoveLoginAdmin(existing, input)) {
      const admins = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE role = 'admin' AND can_login = TRUE FOR UPDATE",
      );
      if (admins.rows.length <= 1) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "last_login_admin" };
      }
    }

    const { sets, params, nextIndex } = buildUpdateParts(input);
    if (sets.length === 0) {
      await client.query("COMMIT");
      return { ok: true, user: existing };
    }
    let i = nextIndex;
    sets.push("updated_at = NOW()");
    params.push(id);
    const updated = await client.query<UserRow>(
      `UPDATE users
          SET ${sets.join(", ")}
        WHERE id = $${i}
        RETURNING ${USER_COLS}`,
      params,
    );
    await client.query("COMMIT");
    const row = updated.rows[0];
    return row ? { ok: true, user: mapUser(row) } : { ok: false, reason: "not_found" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteUser(id: string): Promise<boolean> {
  const result = await query("DELETE FROM users WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteUserGuardingLastLoginAdmin(id: string): Promise<UserMutationResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingResult = await client.query<UserRow>(
      `SELECT ${USER_COLS} FROM users WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const existingRow = existingResult.rows[0];
    if (!existingRow) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "not_found" };
    }
    const existing = mapUser(existingRow);
    if (existing.role === "admin" && existing.canLogin) {
      const admins = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE role = 'admin' AND can_login = TRUE FOR UPDATE",
      );
      if (admins.rows.length <= 1) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "last_login_admin" };
      }
    }
    await client.query("DELETE FROM users WHERE id = $1", [id]);
    await client.query("COMMIT");
    return { ok: true, user: existing };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
