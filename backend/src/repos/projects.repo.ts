import { query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { Project, ProjectStatus } from "../types/domain.js";

interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  size_kr: number | null;
  start_date: Date | null;
  end_date: Date | null;
  total_budget: number | null;
  status: ProjectStatus;
  created_at: Date;
  updated_at: Date;
}

const PROJECT_COLS =
  "id, owner_id, name, address, size_kr, start_date, end_date, total_budget, status, created_at, updated_at";

function toIsoDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    address: row.address,
    sizeKr: row.size_kr,
    startDate: toIsoDate(row.start_date),
    endDate: toIsoDate(row.end_date),
    totalBudget: row.total_budget,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProjects(ownerId: string): Promise<Project[]> {
  const result = await query<ProjectRow>(
    `SELECT ${PROJECT_COLS} FROM projects
     WHERE owner_id = $1
     ORDER BY created_at ASC`,
    [ownerId],
  );
  return result.rows.map(mapProject);
}

export async function getProjectByIdForOwner(
  id: string,
  ownerId: string,
): Promise<Project | null> {
  const result = await query<ProjectRow>(
    `SELECT ${PROJECT_COLS} FROM projects WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  const row = result.rows[0];
  return row ? mapProject(row) : null;
}

/**
 * 프로젝트가 해당 사용자 소유인지만 확인 (row 안 가져옴).
 * Boolean(await getProjectByIdForOwner(...)) 보다 가볍다.
 */
export async function projectExistsForOwner(
  projectId: string,
  ownerId: string,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `SELECT id FROM projects WHERE id = $1 AND owner_id = $2`,
    [projectId, ownerId],
  );
  return result.rows.length > 0;
}

export interface CreateProjectInput {
  name: string;
  address?: string | null;
  sizeKr?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  totalBudget?: number | null;
  status?: ProjectStatus;
}

export async function createProject(
  ownerId: string,
  input: CreateProjectInput,
): Promise<Project> {
  const id = newId();
  const result = await query<ProjectRow>(
    `INSERT INTO projects
       (id, owner_id, name, address, size_kr, start_date, end_date, total_budget, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${PROJECT_COLS}`,
    [
      id,
      ownerId,
      input.name,
      input.address ?? null,
      input.sizeKr ?? null,
      input.startDate ?? null,
      input.endDate ?? null,
      input.totalBudget ?? null,
      input.status ?? "planning",
    ],
  );
  return mapProject(result.rows[0]!);
}

export interface UpdateProjectInput {
  name?: string;
  address?: string | null;
  sizeKr?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  totalBudget?: number | null;
  status?: ProjectStatus;
}

export async function updateProject(
  id: string,
  ownerId: string,
  input: UpdateProjectInput,
): Promise<Project | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [key, col] of [
    ["name", "name"],
    ["address", "address"],
    ["sizeKr", "size_kr"],
    ["startDate", "start_date"],
    ["endDate", "end_date"],
    ["totalBudget", "total_budget"],
    ["status", "status"],
  ] as const) {
    if (key in input) {
      sets.push(`${col} = $${i++}`);
      params.push((input as Record<string, unknown>)[key] ?? null);
    }
  }
  if (sets.length === 0) {
    return getProjectByIdForOwner(id, ownerId);
  }
  sets.push(`updated_at = NOW()`);
  params.push(id, ownerId);
  const result = await query<ProjectRow>(
    `UPDATE projects SET ${sets.join(", ")}
     WHERE id = $${i++} AND owner_id = $${i++}
     RETURNING ${PROJECT_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapProject(row) : null;
}

export async function deleteProject(id: string, ownerId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM projects WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (result.rowCount ?? 0) > 0;
}
