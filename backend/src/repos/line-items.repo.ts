import { pool, query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { LineItem } from "../types/domain.js";

interface LineItemRow {
  id: string;
  phase_id: string;
  space_id: string | null;
  location_label: string | null;
  work_item_label: string | null;
  label: string;
  memo: string | null;
  selected_quote_id: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

const LI_COLS =
  "id, phase_id, space_id, location_label, work_item_label, label, memo, selected_quote_id, sort_order, created_at, updated_at";

function mapLineItem(row: LineItemRow): LineItem {
  return {
    id: row.id,
    phaseId: row.phase_id,
    spaceId: row.space_id,
    locationLabel: row.location_label,
    workItemLabel: row.work_item_label,
    label: row.label,
    memo: row.memo,
    selectedQuoteId: row.selected_quote_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listLineItemsByProject(projectId: string): Promise<LineItem[]> {
  const result = await query<LineItemRow>(
    `SELECT ${LI_COLS.split(", ").map((c) => `li.${c}`).join(", ")}
       FROM line_items li
       JOIN phases p ON p.id = li.phase_id
      WHERE p.project_id = $1
      ORDER BY p.sort_order ASC, li.sort_order ASC`,
    [projectId],
  );
  return result.rows.map(mapLineItem);
}

export async function getLineItemPhaseId(id: string): Promise<string | null> {
  const result = await query<{ phase_id: string }>(
    `SELECT phase_id FROM line_items WHERE id = $1`,
    [id],
  );
  return result.rows[0]?.phase_id ?? null;
}

export async function getLineItemById(id: string): Promise<LineItem | null> {
  const result = await query<LineItemRow>(
    `SELECT ${LI_COLS} FROM line_items WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapLineItem(row) : null;
}

export interface CreateLineItemInput {
  label: string;
  spaceId?: string | null;
  locationLabel?: string | null;
  workItemLabel?: string | null;
  memo?: string | null;
}

export async function createLineItem(
  phaseId: string,
  input: CreateLineItemInput,
): Promise<LineItem> {
  const id = newId();
  const nextOrder = await query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM line_items WHERE phase_id = $1`,
    [phaseId],
  );
  const result = await query<LineItemRow>(
    `INSERT INTO line_items
       (id, phase_id, space_id, location_label, work_item_label, label, memo, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${LI_COLS}`,
    [
      id,
      phaseId,
      input.spaceId ?? null,
      input.locationLabel ?? null,
      input.workItemLabel ?? null,
      input.label,
      input.memo ?? null,
      nextOrder.rows[0]!.next,
    ],
  );
  return mapLineItem(result.rows[0]!);
}

export interface UpdateLineItemInput {
  phaseId?: string;
  label?: string;
  spaceId?: string | null;
  locationLabel?: string | null;
  workItemLabel?: string | null;
  memo?: string | null;
  selectedQuoteId?: string | null;
}

export async function updateLineItem(
  id: string,
  input: UpdateLineItemInput,
): Promise<LineItem | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if ("phaseId" in input && input.phaseId) {
    const current = await getLineItemById(id);
    if (!current) return null;
    if (current.phaseId !== input.phaseId) {
      sets.push(`phase_id = $${i}`);
      sets.push(`sort_order = (
        SELECT COALESCE(MAX(sort_order), -1) + 1
          FROM line_items
         WHERE phase_id = $${i}
      )`);
      params.push(input.phaseId);
      i++;
    }
  }
  for (const [key, col] of [
    ["label", "label"],
    ["spaceId", "space_id"],
    ["locationLabel", "location_label"],
    ["workItemLabel", "work_item_label"],
    ["memo", "memo"],
    ["selectedQuoteId", "selected_quote_id"],
  ] as const) {
    if (key in input) {
      sets.push(`${col} = $${i++}`);
      params.push((input as Record<string, unknown>)[key] ?? null);
    }
  }
  if (sets.length === 0) {
    const cur = await query<LineItemRow>(
      `SELECT ${LI_COLS} FROM line_items WHERE id = $1`,
      [id],
    );
    const row = cur.rows[0];
    return row ? mapLineItem(row) : null;
  }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const result = await query<LineItemRow>(
    `UPDATE line_items SET ${sets.join(", ")} WHERE id = $${i} RETURNING ${LI_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapLineItem(row) : null;
}

export async function deleteLineItem(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM line_items WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listLineItemsByPhase(phaseId: string): Promise<LineItem[]> {
  const result = await query<LineItemRow>(
    `SELECT ${LI_COLS} FROM line_items WHERE phase_id = $1 ORDER BY sort_order ASC`,
    [phaseId],
  );
  return result.rows.map(mapLineItem);
}

export async function reorderLineItems(
  phaseId: string,
  orderedIds: string[],
): Promise<LineItem[] | null> {
  const current = await listLineItemsByPhase(phaseId);
  const currentIds = current.map((item) => item.id);
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
      `UPDATE line_items
          SET sort_order = -100000 - src.ordinal::integer,
              updated_at = NOW()
         FROM unnest($2::text[]) WITH ORDINALITY AS src(id, ordinal)
        WHERE line_items.phase_id = $1
          AND line_items.id = src.id`,
      [phaseId, orderedIds],
    );
    await client.query(
      `UPDATE line_items
          SET sort_order = src.ordinal::integer - 1,
              updated_at = NOW()
         FROM unnest($2::text[]) WITH ORDINALITY AS src(id, ordinal)
        WHERE line_items.phase_id = $1
          AND line_items.id = src.id`,
      [phaseId, orderedIds],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return listLineItemsByPhase(phaseId);
}
