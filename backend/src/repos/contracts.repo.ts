import { query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { Contract, ContractStatus, ContractType } from "../types/domain.js";

interface ContractRow {
  id: string;
  project_id: string;
  phase_id: string | null;
  vendor_id: string | null;
  parent_contract_id: string | null;
  type: ContractType;
  status: ContractStatus;
  title: string;
  amount: number;
  scheduled_start: Date | null;
  scheduled_end: Date | null;
  actual_start: Date | null;
  actual_end: Date | null;
  memo: string | null;
  created_at: Date;
  updated_at: Date;
}

const CONTRACT_COLS =
  "id, project_id, phase_id, vendor_id, parent_contract_id, type, status, title, amount, scheduled_start, scheduled_end, actual_start, actual_end, memo, created_at, updated_at";

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function mapContract(row: ContractRow): Contract {
  return {
    id: row.id,
    projectId: row.project_id,
    phaseId: row.phase_id,
    vendorId: row.vendor_id,
    parentContractId: row.parent_contract_id,
    type: row.type,
    status: row.status,
    title: row.title,
    amount: row.amount,
    scheduledStart: toIsoDate(row.scheduled_start),
    scheduledEnd: toIsoDate(row.scheduled_end),
    actualStart: toIsoDate(row.actual_start),
    actualEnd: toIsoDate(row.actual_end),
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listContractsByProject(projectId: string): Promise<Contract[]> {
  const result = await query<ContractRow>(
    `SELECT ${CONTRACT_COLS} FROM contracts
     WHERE project_id = $1
     ORDER BY created_at ASC`,
    [projectId],
  );
  return result.rows.map(mapContract);
}

export async function getContractProjectId(id: string): Promise<string | null> {
  const result = await query<{ project_id: string }>(
    `SELECT project_id FROM contracts WHERE id = $1`,
    [id],
  );
  return result.rows[0]?.project_id ?? null;
}

export interface CreateContractInput {
  phaseId?: string | null;
  vendorId?: string | null;
  parentContractId?: string | null;
  type?: ContractType;
  status?: ContractStatus;
  title: string;
  amount?: number;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  memo?: string | null;
}

export async function createContract(
  projectId: string,
  input: CreateContractInput,
): Promise<Contract> {
  const id = newId();
  const result = await query<ContractRow>(
    `INSERT INTO contracts
       (id, project_id, phase_id, vendor_id, parent_contract_id, type, status, title, amount,
        scheduled_start, scheduled_end, actual_start, actual_end, memo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING ${CONTRACT_COLS}`,
    [
      id,
      projectId,
      input.phaseId ?? null,
      input.vendorId ?? null,
      input.parentContractId ?? null,
      input.type ?? "standalone",
      input.status ?? "planned",
      input.title,
      input.amount ?? 0,
      input.scheduledStart ?? null,
      input.scheduledEnd ?? null,
      input.actualStart ?? null,
      input.actualEnd ?? null,
      input.memo ?? null,
    ],
  );
  return mapContract(result.rows[0]!);
}

export interface UpdateContractInput {
  phaseId?: string | null;
  vendorId?: string | null;
  parentContractId?: string | null;
  type?: ContractType;
  status?: ContractStatus;
  title?: string;
  amount?: number;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  memo?: string | null;
}

export async function updateContract(
  id: string,
  input: UpdateContractInput,
): Promise<Contract | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [key, col] of [
    ["phaseId", "phase_id"],
    ["vendorId", "vendor_id"],
    ["parentContractId", "parent_contract_id"],
    ["type", "type"],
    ["status", "status"],
    ["title", "title"],
    ["amount", "amount"],
    ["scheduledStart", "scheduled_start"],
    ["scheduledEnd", "scheduled_end"],
    ["actualStart", "actual_start"],
    ["actualEnd", "actual_end"],
    ["memo", "memo"],
  ] as const) {
    if (key in input) {
      sets.push(`${col} = $${i++}`);
      params.push((input as Record<string, unknown>)[key] ?? null);
    }
  }
  if (sets.length === 0) {
    const cur = await query<ContractRow>(
      `SELECT ${CONTRACT_COLS} FROM contracts WHERE id = $1`,
      [id],
    );
    const row = cur.rows[0];
    return row ? mapContract(row) : null;
  }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const result = await query<ContractRow>(
    `UPDATE contracts SET ${sets.join(", ")}
     WHERE id = $${i}
     RETURNING ${CONTRACT_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapContract(row) : null;
}

export async function deleteContract(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM contracts WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
