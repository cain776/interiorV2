import { pool, query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { Consideration, Phase, PhaseStatus } from "../types/domain.js";

interface PhaseRow {
  id: string;
  project_id: string;
  name: string;
  template_key: string | null;
  scheduled_start: Date | null;
  scheduled_end: Date | null;
  status: PhaseStatus;
  sort_order: number;
  considerations: Consideration[];
  created_at: Date;
  updated_at: Date;
}

const PHASE_COLS =
  "id, project_id, name, template_key, scheduled_start, scheduled_end, status, sort_order, considerations, created_at, updated_at";

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function mapPhase(row: PhaseRow): Phase {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    templateKey: row.template_key,
    scheduledStart: toIsoDate(row.scheduled_start),
    scheduledEnd: toIsoDate(row.scheduled_end),
    status: row.status,
    sortOrder: row.sort_order,
    considerations: row.considerations ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPhasesByProject(projectId: string): Promise<Phase[]> {
  const result = await query<PhaseRow>(
    `SELECT ${PHASE_COLS} FROM phases WHERE project_id = $1 ORDER BY sort_order ASC`,
    [projectId],
  );
  return result.rows.map(mapPhase);
}

export async function getPhaseProjectId(id: string): Promise<string | null> {
  const result = await query<{ project_id: string }>(
    `SELECT project_id FROM phases WHERE id = $1`,
    [id],
  );
  return result.rows[0]?.project_id ?? null;
}

export interface CreatePhaseInput {
  name: string;
  templateKey?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  status?: PhaseStatus;
  considerations?: Consideration[];
}

export async function createPhase(
  projectId: string,
  input: CreatePhaseInput,
): Promise<Phase> {
  const id = newId();
  const nextOrder = await query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM phases WHERE project_id = $1`,
    [projectId],
  );
  const result = await query<PhaseRow>(
    `INSERT INTO phases
       (id, project_id, name, template_key, scheduled_start, scheduled_end, status, sort_order, considerations)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING ${PHASE_COLS}`,
    [
      id,
      projectId,
      input.name,
      input.templateKey ?? null,
      input.scheduledStart ?? null,
      input.scheduledEnd ?? null,
      input.status ?? "planned",
      nextOrder.rows[0]!.next,
      JSON.stringify(input.considerations ?? []),
    ],
  );
  return mapPhase(result.rows[0]!);
}

export interface UpdatePhaseInput {
  name?: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  status?: PhaseStatus;
  considerations?: Consideration[];
}

export async function updatePhase(
  id: string,
  input: UpdatePhaseInput,
): Promise<Phase | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if ("name" in input) {
    sets.push(`name = $${i++}`);
    params.push(input.name);
  }
  if ("scheduledStart" in input) {
    sets.push(`scheduled_start = $${i++}`);
    params.push(input.scheduledStart ?? null);
  }
  if ("scheduledEnd" in input) {
    sets.push(`scheduled_end = $${i++}`);
    params.push(input.scheduledEnd ?? null);
  }
  if ("status" in input) {
    sets.push(`status = $${i++}`);
    params.push(input.status);
  }
  if ("considerations" in input) {
    sets.push(`considerations = $${i++}::jsonb`);
    params.push(JSON.stringify(input.considerations ?? []));
  }
  if (sets.length === 0) {
    const cur = await query<PhaseRow>(
      `SELECT ${PHASE_COLS} FROM phases WHERE id = $1`,
      [id],
    );
    const row = cur.rows[0];
    return row ? mapPhase(row) : null;
  }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const result = await query<PhaseRow>(
    `UPDATE phases SET ${sets.join(", ")} WHERE id = $${i} RETURNING ${PHASE_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapPhase(row) : null;
}

export async function deletePhase(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM phases WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function reorderPhases(
  projectId: string,
  orderedIds: string[],
): Promise<Phase[] | null> {
  const current = await listPhasesByProject(projectId);
  const currentIds = current.map((phase) => phase.id);
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
      `UPDATE phases
          SET sort_order = -100000 - src.ordinal::integer,
              updated_at = NOW()
         FROM unnest($2::text[]) WITH ORDINALITY AS src(id, ordinal)
        WHERE phases.project_id = $1
          AND phases.id = src.id`,
      [projectId, orderedIds],
    );
    await client.query(
      `UPDATE phases
          SET sort_order = src.ordinal::integer - 1,
              updated_at = NOW()
         FROM unnest($2::text[]) WITH ORDINALITY AS src(id, ordinal)
        WHERE phases.project_id = $1
          AND phases.id = src.id`,
      [projectId, orderedIds],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return listPhasesByProject(projectId);
}
