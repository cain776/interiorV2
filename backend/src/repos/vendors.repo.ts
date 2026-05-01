import { query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { Vendor } from "../types/domain.js";

interface VendorRow {
  id: string;
  owner_id: string;
  name: string;
  ceo: string | null;
  phone: string | null;
  email: string | null;
  specialty: string | null;
  rating: number | null;
  memo: string | null;
  created_at: Date;
  updated_at: Date;
}

const VENDOR_COLS =
  "id, owner_id, name, ceo, phone, email, specialty, rating, memo, created_at, updated_at";

function mapVendor(row: VendorRow): Vendor {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    ceo: row.ceo,
    phone: row.phone,
    email: row.email,
    specialty: row.specialty,
    rating: row.rating,
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listVendors(ownerId: string): Promise<Vendor[]> {
  const result = await query<VendorRow>(
    `SELECT ${VENDOR_COLS} FROM vendors WHERE owner_id = $1 ORDER BY name ASC`,
    [ownerId],
  );
  return result.rows.map(mapVendor);
}

export async function getVendorById(id: string, ownerId: string): Promise<Vendor | null> {
  const result = await query<VendorRow>(
    `SELECT ${VENDOR_COLS} FROM vendors WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  const row = result.rows[0];
  return row ? mapVendor(row) : null;
}

export interface CreateVendorInput {
  name: string;
  ceo?: string | null;
  phone?: string | null;
  email?: string | null;
  specialty?: string | null;
  rating?: number | null;
  memo?: string | null;
}

export async function createVendor(
  ownerId: string,
  input: CreateVendorInput,
): Promise<Vendor> {
  const id = newId();
  const result = await query<VendorRow>(
    `INSERT INTO vendors (id, owner_id, name, ceo, phone, email, specialty, rating, memo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${VENDOR_COLS}`,
    [
      id,
      ownerId,
      input.name,
      input.ceo ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.specialty ?? null,
      input.rating ?? null,
      input.memo ?? null,
    ],
  );
  return mapVendor(result.rows[0]!);
}

export type UpdateVendorInput = Partial<CreateVendorInput>;

export async function updateVendor(
  id: string,
  ownerId: string,
  input: UpdateVendorInput,
): Promise<Vendor | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [key, col] of [
    ["name", "name"],
    ["ceo", "ceo"],
    ["phone", "phone"],
    ["email", "email"],
    ["specialty", "specialty"],
    ["rating", "rating"],
    ["memo", "memo"],
  ] as const) {
    if (key in input) {
      sets.push(`${col} = $${i++}`);
      params.push((input as Record<string, unknown>)[key] ?? null);
    }
  }
  if (sets.length === 0) return getVendorById(id, ownerId);
  sets.push(`updated_at = NOW()`);
  params.push(id, ownerId);
  const result = await query<VendorRow>(
    `UPDATE vendors SET ${sets.join(", ")}
     WHERE id = $${i++} AND owner_id = $${i++}
     RETURNING ${VENDOR_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapVendor(row) : null;
}

export async function deleteVendor(id: string, ownerId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM vendors WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function vendorBelongsToOwner(
  id: string,
  ownerId: string,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `SELECT id FROM vendors WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return result.rows.length > 0;
}
