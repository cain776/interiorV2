import { pool, query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { Quote, QuoteMode, QuoteStatus } from "../types/domain.js";

interface QuoteRow {
  id: string;
  line_item_id: string;
  vendor_id: string;
  mode: QuoteMode;
  price: number;
  status: QuoteStatus;
  meta: Record<string, unknown>;
  memo: string | null;
  selected_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const Q_COLS =
  "id, line_item_id, vendor_id, mode, price, status, meta, memo, selected_at, created_at, updated_at";

function mapQuote(row: QuoteRow): Quote {
  return {
    id: row.id,
    lineItemId: row.line_item_id,
    vendorId: row.vendor_id,
    mode: row.mode,
    price: row.price,
    status: row.status,
    meta: row.meta ?? {},
    memo: row.memo,
    selectedAt: row.selected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listQuotesByProject(projectId: string): Promise<Quote[]> {
  const result = await query<QuoteRow>(
    `SELECT ${Q_COLS.split(", ").map((c) => `q.${c}`).join(", ")}
       FROM quotes q
       JOIN line_items li ON li.id = q.line_item_id
       JOIN phases p ON p.id = li.phase_id
      WHERE p.project_id = $1
      ORDER BY q.created_at ASC`,
    [projectId],
  );
  return result.rows.map(mapQuote);
}

export async function getQuoteLineItemId(id: string): Promise<string | null> {
  const result = await query<{ line_item_id: string }>(
    `SELECT line_item_id FROM quotes WHERE id = $1`,
    [id],
  );
  return result.rows[0]?.line_item_id ?? null;
}

export interface CreateQuoteInput {
  vendorId: string;
  mode: QuoteMode;
  price: number;
  status?: QuoteStatus;
  meta?: Record<string, unknown>;
  memo?: string | null;
}

export async function createQuote(
  lineItemId: string,
  input: CreateQuoteInput,
): Promise<Quote> {
  const id = newId();
  const result = await query<QuoteRow>(
    `INSERT INTO quotes (id, line_item_id, vendor_id, mode, price, status, meta, memo)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     RETURNING ${Q_COLS}`,
    [
      id,
      lineItemId,
      input.vendorId,
      input.mode,
      input.price,
      input.status ?? "candidate",
      JSON.stringify(input.meta ?? {}),
      input.memo ?? null,
    ],
  );
  return mapQuote(result.rows[0]!);
}

export interface UpdateQuoteInput {
  vendorId?: string;
  mode?: QuoteMode;
  price?: number;
  status?: QuoteStatus;
  meta?: Record<string, unknown>;
  memo?: string | null;
}

export async function updateQuote(
  id: string,
  input: UpdateQuoteInput,
): Promise<Quote | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if ("vendorId" in input) {
    sets.push(`vendor_id = $${i++}`);
    params.push(input.vendorId);
  }
  if ("mode" in input) {
    sets.push(`mode = $${i++}`);
    params.push(input.mode);
  }
  if ("price" in input) {
    sets.push(`price = $${i++}`);
    params.push(input.price);
  }
  if ("status" in input) {
    sets.push(`status = $${i++}`);
    params.push(input.status);
  }
  if ("meta" in input) {
    sets.push(`meta = $${i++}::jsonb`);
    params.push(JSON.stringify(input.meta ?? {}));
  }
  if ("memo" in input) {
    sets.push(`memo = $${i++}`);
    params.push(input.memo ?? null);
  }
  if (sets.length === 0) {
    const cur = await query<QuoteRow>(
      `SELECT ${Q_COLS} FROM quotes WHERE id = $1`,
      [id],
    );
    const row = cur.rows[0];
    return row ? mapQuote(row) : null;
  }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const result = await query<QuoteRow>(
    `UPDATE quotes SET ${sets.join(", ")} WHERE id = $${i} RETURNING ${Q_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapQuote(row) : null;
}

export async function deleteQuote(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM quotes WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/** 견적을 채택: 해당 견적의 line_item.selected_quote_id 갱신 + selected_at 기록. 같은 항목의 다른 견적은 selected_at 해제. */
export async function selectQuote(id: string): Promise<{ lineItemId: string } | null> {
  const lineItemId = await getQuoteLineItemId(id);
  if (!lineItemId) return null;

  // 한 connection 내에서 BEGIN/COMMIT 묶기 — pool.connect() 가 아니면 BEGIN 만 다른 connection 으로 가서 트랜잭션 안 됨.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE quotes SET selected_at = NULL
        WHERE line_item_id = $1 AND id <> $2`,
      [lineItemId, id],
    );
    await client.query(
      `UPDATE quotes SET selected_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id],
    );
    await client.query(
      `UPDATE line_items SET selected_quote_id = $1, updated_at = NOW() WHERE id = $2`,
      [id, lineItemId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { lineItemId };
}
