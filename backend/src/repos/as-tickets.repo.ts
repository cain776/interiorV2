import { query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { AsTicket, AsTicketPriority, AsTicketStatus } from "../types/domain.js";

interface AsTicketRow {
  id: string;
  project_id: string;
  contract_id: string | null;
  phase_id: string | null;
  line_item_id: string | null;
  status: AsTicketStatus;
  priority: AsTicketPriority;
  title: string;
  content: string | null;
  occurred_at: Date | null;
  resolved_at: Date | null;
  warranty_expires_at: Date | null;
  memo: string | null;
  created_at: Date;
  updated_at: Date;
}

const AS_TICKET_COLS =
  "id, project_id, contract_id, phase_id, line_item_id, status, priority, title, content, occurred_at, resolved_at, warranty_expires_at, memo, created_at, updated_at";

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function mapAsTicket(row: AsTicketRow): AsTicket {
  return {
    id: row.id,
    projectId: row.project_id,
    contractId: row.contract_id,
    phaseId: row.phase_id,
    lineItemId: row.line_item_id,
    status: row.status,
    priority: row.priority,
    title: row.title,
    content: row.content,
    occurredAt: toIsoDate(row.occurred_at),
    resolvedAt: toIsoDate(row.resolved_at),
    warrantyExpiresAt: toIsoDate(row.warranty_expires_at),
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAsTicketsByProject(projectId: string): Promise<AsTicket[]> {
  const result = await query<AsTicketRow>(
    `SELECT ${AS_TICKET_COLS} FROM as_tickets
     WHERE project_id = $1
     ORDER BY created_at ASC`,
    [projectId],
  );
  return result.rows.map(mapAsTicket);
}

export async function getAsTicketProjectId(id: string): Promise<string | null> {
  const result = await query<{ project_id: string }>(
    `SELECT project_id FROM as_tickets WHERE id = $1`,
    [id],
  );
  return result.rows[0]?.project_id ?? null;
}

export interface CreateAsTicketInput {
  contractId?: string | null;
  phaseId?: string | null;
  lineItemId?: string | null;
  status?: AsTicketStatus;
  priority?: AsTicketPriority;
  title: string;
  content?: string | null;
  occurredAt?: string | null;
  resolvedAt?: string | null;
  warrantyExpiresAt?: string | null;
  memo?: string | null;
}

export async function createAsTicket(
  projectId: string,
  input: CreateAsTicketInput,
): Promise<AsTicket> {
  const id = newId();
  const result = await query<AsTicketRow>(
    `INSERT INTO as_tickets
       (id, project_id, contract_id, phase_id, line_item_id, status, priority, title, content,
        occurred_at, resolved_at, warranty_expires_at, memo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${AS_TICKET_COLS}`,
    [
      id,
      projectId,
      input.contractId ?? null,
      input.phaseId ?? null,
      input.lineItemId ?? null,
      input.status ?? "received",
      input.priority ?? "normal",
      input.title,
      input.content ?? null,
      input.occurredAt ?? null,
      input.resolvedAt ?? null,
      input.warrantyExpiresAt ?? null,
      input.memo ?? null,
    ],
  );
  return mapAsTicket(result.rows[0]!);
}

export interface UpdateAsTicketInput {
  contractId?: string | null;
  phaseId?: string | null;
  lineItemId?: string | null;
  status?: AsTicketStatus;
  priority?: AsTicketPriority;
  title?: string;
  content?: string | null;
  occurredAt?: string | null;
  resolvedAt?: string | null;
  warrantyExpiresAt?: string | null;
  memo?: string | null;
}

export async function updateAsTicket(
  id: string,
  input: UpdateAsTicketInput,
): Promise<AsTicket | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [key, col] of [
    ["contractId", "contract_id"],
    ["phaseId", "phase_id"],
    ["lineItemId", "line_item_id"],
    ["status", "status"],
    ["priority", "priority"],
    ["title", "title"],
    ["content", "content"],
    ["occurredAt", "occurred_at"],
    ["resolvedAt", "resolved_at"],
    ["warrantyExpiresAt", "warranty_expires_at"],
    ["memo", "memo"],
  ] as const) {
    if (key in input) {
      sets.push(`${col} = $${i++}`);
      params.push((input as Record<string, unknown>)[key] ?? null);
    }
  }
  if (sets.length === 0) {
    const cur = await query<AsTicketRow>(
      `SELECT ${AS_TICKET_COLS} FROM as_tickets WHERE id = $1`,
      [id],
    );
    const row = cur.rows[0];
    return row ? mapAsTicket(row) : null;
  }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const result = await query<AsTicketRow>(
    `UPDATE as_tickets SET ${sets.join(", ")}
     WHERE id = $${i}
     RETURNING ${AS_TICKET_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapAsTicket(row) : null;
}

export async function deleteAsTicket(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM as_tickets WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
