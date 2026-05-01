import { pool, query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { Space } from "../types/domain.js";

interface SpaceRow {
  id: string;
  project_id: string;
  name: string;
  area_sqm: number | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

const SPACE_COLS =
  "id, project_id, name, area_sqm, sort_order, created_at, updated_at";

function mapSpace(row: SpaceRow): Space {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    areaSqm: row.area_sqm,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSpacesByProject(projectId: string): Promise<Space[]> {
  const result = await query<SpaceRow>(
    `SELECT ${SPACE_COLS} FROM spaces WHERE project_id = $1 ORDER BY sort_order ASC`,
    [projectId],
  );
  return result.rows.map(mapSpace);
}

export async function getSpaceProjectId(id: string): Promise<string | null> {
  const result = await query<{ project_id: string }>(
    `SELECT project_id FROM spaces WHERE id = $1`,
    [id],
  );
  return result.rows[0]?.project_id ?? null;
}

export interface CreateSpaceInput {
  name: string;
  areaSqm?: number | null;
}

export async function createSpace(
  projectId: string,
  input: CreateSpaceInput,
): Promise<Space> {
  const id = newId();
  const nextOrder = await query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM spaces WHERE project_id = $1`,
    [projectId],
  );
  const result = await query<SpaceRow>(
    `INSERT INTO spaces (id, project_id, name, area_sqm, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SPACE_COLS}`,
    [id, projectId, input.name, input.areaSqm ?? null, nextOrder.rows[0]!.next],
  );
  return mapSpace(result.rows[0]!);
}

export interface UpdateSpaceInput {
  name?: string;
  areaSqm?: number | null;
}

export async function updateSpace(
  id: string,
  input: UpdateSpaceInput,
): Promise<Space | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if ("name" in input) {
    sets.push(`name = $${i++}`);
    params.push(input.name);
  }
  if ("areaSqm" in input) {
    sets.push(`area_sqm = $${i++}`);
    params.push(input.areaSqm ?? null);
  }
  if (sets.length === 0) {
    const cur = await query<SpaceRow>(
      `SELECT ${SPACE_COLS} FROM spaces WHERE id = $1`,
      [id],
    );
    const row = cur.rows[0];
    return row ? mapSpace(row) : null;
  }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const result = await query<SpaceRow>(
    `UPDATE spaces SET ${sets.join(", ")} WHERE id = $${i} RETURNING ${SPACE_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapSpace(row) : null;
}

export async function deleteSpace(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM spaces WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function reorderSpaces(
  projectId: string,
  orderedIds: string[],
): Promise<Space[] | null> {
  const current = await listSpacesByProject(projectId);
  const currentIds = current.map((space) => space.id);
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
      `UPDATE spaces
          SET sort_order = -100000 - src.ordinal::integer,
              updated_at = NOW()
         FROM unnest($2::text[]) WITH ORDINALITY AS src(id, ordinal)
        WHERE spaces.project_id = $1
          AND spaces.id = src.id`,
      [projectId, orderedIds],
    );
    await client.query(
      `UPDATE spaces
          SET sort_order = src.ordinal::integer - 1,
              updated_at = NOW()
         FROM unnest($2::text[]) WITH ORDINALITY AS src(id, ordinal)
        WHERE spaces.project_id = $1
          AND spaces.id = src.id`,
      [projectId, orderedIds],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return listSpacesByProject(projectId);
}
