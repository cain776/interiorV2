import { query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { User } from "../types/domain.js";

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: Date;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await query<UserRow>(
    "SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1",
    [email],
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await query<UserRow>(
    "SELECT id, email, name, password_hash, created_at FROM users WHERE id = $1",
    [id],
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<User> {
  const id = newId();
  const result = await query<UserRow>(
    `INSERT INTO users (id, email, name, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, password_hash, created_at`,
    [id, input.email, input.name, input.passwordHash],
  );
  return mapUser(result.rows[0]!);
}
