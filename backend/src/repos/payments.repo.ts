import { query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { Payment, PaymentKind, PaymentStatus } from "../types/domain.js";

interface PaymentRow {
  id: string;
  project_id: string;
  contract_id: string | null;
  kind: PaymentKind;
  status: PaymentStatus;
  amount: number;
  due_date: Date | null;
  paid_at: Date | null;
  memo: string | null;
  created_at: Date;
  updated_at: Date;
}

const PAYMENT_COLS =
  "id, project_id, contract_id, kind, status, amount, due_date, paid_at, memo, created_at, updated_at";

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    projectId: row.project_id,
    contractId: row.contract_id,
    kind: row.kind,
    status: row.status,
    amount: row.amount,
    dueDate: toIsoDate(row.due_date),
    paidAt: row.paid_at,
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPaymentsByProject(projectId: string): Promise<Payment[]> {
  const result = await query<PaymentRow>(
    `SELECT ${PAYMENT_COLS} FROM payments
     WHERE project_id = $1
     ORDER BY due_date ASC NULLS LAST, created_at ASC`,
    [projectId],
  );
  return result.rows.map(mapPayment);
}

export async function getPaymentProjectId(id: string): Promise<string | null> {
  const result = await query<{ project_id: string }>(
    `SELECT project_id FROM payments WHERE id = $1`,
    [id],
  );
  return result.rows[0]?.project_id ?? null;
}

export interface CreatePaymentInput {
  contractId?: string | null;
  kind: PaymentKind;
  status?: PaymentStatus;
  amount: number;
  dueDate?: string | null;
  paidAt?: string | null;
  memo?: string | null;
}

export async function createPayment(
  projectId: string,
  input: CreatePaymentInput,
): Promise<Payment> {
  const id = newId();
  const result = await query<PaymentRow>(
    `INSERT INTO payments
       (id, project_id, contract_id, kind, status, amount, due_date, paid_at, memo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${PAYMENT_COLS}`,
    [
      id,
      projectId,
      input.contractId ?? null,
      input.kind,
      input.status ?? "pending",
      input.amount,
      input.dueDate ?? null,
      input.paidAt ?? null,
      input.memo ?? null,
    ],
  );
  return mapPayment(result.rows[0]!);
}

export interface UpdatePaymentInput {
  contractId?: string | null;
  kind?: PaymentKind;
  status?: PaymentStatus;
  amount?: number;
  dueDate?: string | null;
  paidAt?: string | null;
  memo?: string | null;
}

export async function updatePayment(
  id: string,
  input: UpdatePaymentInput,
): Promise<Payment | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [key, col] of [
    ["contractId", "contract_id"],
    ["kind", "kind"],
    ["status", "status"],
    ["amount", "amount"],
    ["dueDate", "due_date"],
    ["paidAt", "paid_at"],
    ["memo", "memo"],
  ] as const) {
    if (key in input) {
      sets.push(`${col} = $${i++}`);
      params.push((input as Record<string, unknown>)[key] ?? null);
    }
  }
  if (sets.length === 0) {
    const cur = await query<PaymentRow>(
      `SELECT ${PAYMENT_COLS} FROM payments WHERE id = $1`,
      [id],
    );
    const row = cur.rows[0];
    return row ? mapPayment(row) : null;
  }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const result = await query<PaymentRow>(
    `UPDATE payments SET ${sets.join(", ")}
     WHERE id = $${i}
     RETURNING ${PAYMENT_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapPayment(row) : null;
}

export async function deletePayment(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM payments WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
