import { pool, query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { Vendor } from "../types/domain.js";

interface VendorRow {
  id: string;
  owner_id: string;
  name: string;
  ceo: string | null;
  phone: string | null;
  office_address: string | null;
  company_phone: string | null;
  mobile_phone: string | null;
  photo_url: string | null;
  email: string | null;
  specialty: string | null;
  rating: number | null;
  sort_order: number;
  is_active: boolean;
  memo: string | null;
  created_at: Date;
  updated_at: Date;
}

const VENDOR_COLS =
  "id, owner_id, name, ceo, phone, office_address, company_phone, mobile_phone, photo_url, email, specialty, rating, sort_order, is_active, memo, created_at, updated_at";

function mapVendor(row: VendorRow): Vendor {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    ceo: row.ceo,
    phone: row.phone,
    officeAddress: row.office_address,
    companyPhone: row.company_phone,
    mobilePhone: row.mobile_phone,
    photoUrl: row.photo_url,
    email: row.email,
    specialty: row.specialty,
    rating: row.rating,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listVendors(ownerId: string): Promise<Vendor[]> {
  const result = await query<VendorRow>(
    `SELECT ${VENDOR_COLS}
       FROM vendors
      WHERE owner_id = $1
      ORDER BY sort_order ASC, name ASC`,
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
  officeAddress?: string | null;
  companyPhone?: string | null;
  mobilePhone?: string | null;
  photoUrl?: string | null;
  email?: string | null;
  specialty?: string | null;
  rating?: number | null;
  isActive?: boolean;
  memo?: string | null;
}

export async function createVendor(
  ownerId: string,
  input: CreateVendorInput,
): Promise<Vendor> {
  const id = newId();
  const nextOrder = await query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM vendors WHERE owner_id = $1`,
    [ownerId],
  );
  const result = await query<VendorRow>(
    `INSERT INTO vendors (id, owner_id, name, ceo, phone, office_address, company_phone, mobile_phone, photo_url, email, specialty, rating, sort_order, is_active, memo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING ${VENDOR_COLS}`,
    [
      id,
      ownerId,
      input.name,
      input.ceo ?? null,
      input.phone ?? null,
      input.officeAddress ?? null,
      input.companyPhone ?? null,
      input.mobilePhone ?? null,
      input.photoUrl ?? null,
      input.email ?? null,
      input.specialty ?? null,
      input.rating ?? null,
      nextOrder.rows[0]!.next,
      input.isActive ?? true,
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
    ["officeAddress", "office_address"],
    ["companyPhone", "company_phone"],
    ["mobilePhone", "mobile_phone"],
    ["photoUrl", "photo_url"],
    ["email", "email"],
    ["specialty", "specialty"],
    ["rating", "rating"],
    ["isActive", "is_active"],
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

export async function reorderVendors(
  ownerId: string,
  orderedIds: string[],
): Promise<Vendor[] | null> {
  const current = await listVendors(ownerId);
  const currentIds = current.map((vendor) => vendor.id);
  if (
    currentIds.length !== orderedIds.length ||
    currentIds.some((id) => !orderedIds.includes(id))
  ) {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE vendors
          SET sort_order = src.ordinal::integer - 1,
              updated_at = NOW()
         FROM unnest($2::text[]) WITH ORDINALITY AS src(id, ordinal)
        WHERE vendors.owner_id = $1
          AND vendors.id = src.id`,
      [ownerId, orderedIds],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return listVendors(ownerId);
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
