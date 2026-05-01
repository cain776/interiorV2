import { query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type {
  ChangeOrder,
  ChangeOrderReason,
  ChangeOrderStatus,
} from "../types/domain.js";

interface ChangeOrderRow {
  id: string;
  project_id: string;
  contract_id: string | null;
  reason: ChangeOrderReason;
  status: ChangeOrderStatus;
  title: string;
  amount_delta: number;
  approved_at: Date | null;
  memo: string | null;
  created_at: Date;
  updated_at: Date;
}

const CHANGE_ORDER_COLS =
  "id, project_id, contract_id, reason, status, title, amount_delta, approved_at, memo, created_at, updated_at";

function mapChangeOrder(row: ChangeOrderRow): ChangeOrder {
  return {
    id: row.id,
    projectId: row.project_id,
    contractId: row.contract_id,
    reason: row.reason,
    status: row.status,
    title: row.title,
    amountDelta: row.amount_delta,
    approvedAt: row.approved_at,
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listChangeOrdersByProject(projectId: string): Promise<ChangeOrder[]> {
  const result = await query<ChangeOrderRow>(
    `SELECT ${CHANGE_ORDER_COLS} FROM change_orders
     WHERE project_id = $1
     ORDER BY created_at ASC`,
    [projectId],
  );
  return result.rows.map(mapChangeOrder);
}

export async function getChangeOrderProjectId(id: string): Promise<string | null> {
  const result = await query<{ project_id: string }>(
    `SELECT project_id FROM change_orders WHERE id = $1`,
    [id],
  );
  return result.rows[0]?.project_id ?? null;
}

export interface CreateChangeOrderInput {
  contractId?: string | null;
  reason?: ChangeOrderReason;
  status?: ChangeOrderStatus;
  title: string;
  amountDelta?: number;
  approvedAt?: string | null;
  memo?: string | null;
}

export async function createChangeOrder(
  projectId: string,
  input: CreateChangeOrderInput,
): Promise<ChangeOrder> {
  const id = newId();
  const result = await query<ChangeOrderRow>(
    `INSERT INTO change_orders
       (id, project_id, contract_id, reason, status, title, amount_delta, approved_at, memo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${CHANGE_ORDER_COLS}`,
    [
      id,
      projectId,
      input.contractId ?? null,
      input.reason ?? "other",
      input.status ?? "requested",
      input.title,
      input.amountDelta ?? 0,
      input.approvedAt ?? null,
      input.memo ?? null,
    ],
  );
  return mapChangeOrder(result.rows[0]!);
}

export interface UpdateChangeOrderInput {
  contractId?: string | null;
  reason?: ChangeOrderReason;
  status?: ChangeOrderStatus;
  title?: string;
  amountDelta?: number;
  approvedAt?: string | null;
  memo?: string | null;
}

export async function updateChangeOrder(
  id: string,
  input: UpdateChangeOrderInput,
): Promise<ChangeOrder | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [key, col] of [
    ["contractId", "contract_id"],
    ["reason", "reason"],
    ["status", "status"],
    ["title", "title"],
    ["amountDelta", "amount_delta"],
    ["approvedAt", "approved_at"],
    ["memo", "memo"],
  ] as const) {
    if (key in input) {
      sets.push(`${col} = $${i++}`);
      params.push((input as Record<string, unknown>)[key] ?? null);
    }
  }
  if (sets.length === 0) {
    const cur = await query<ChangeOrderRow>(
      `SELECT ${CHANGE_ORDER_COLS} FROM change_orders WHERE id = $1`,
      [id],
    );
    const row = cur.rows[0];
    return row ? mapChangeOrder(row) : null;
  }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const result = await query<ChangeOrderRow>(
    `UPDATE change_orders SET ${sets.join(", ")}
     WHERE id = $${i}
     RETURNING ${CHANGE_ORDER_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapChangeOrder(row) : null;
}

export async function deleteChangeOrder(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM change_orders WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
