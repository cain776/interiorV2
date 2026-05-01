import { pool, query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type { ReviewMaterial } from "../types/domain.js";

interface ReviewMaterialRow {
  id: string;
  project_id: string;
  title: string;
  url: string;
  source: string | null;
  memo: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

const REVIEW_MATERIAL_COLS =
  "id, project_id, title, url, source, memo, sort_order, created_at, updated_at";

function mapReviewMaterial(row: ReviewMaterialRow): ReviewMaterial {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    url: row.url,
    source: row.source,
    memo: row.memo,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listReviewMaterialsByProject(
  projectId: string,
): Promise<ReviewMaterial[]> {
  const result = await query<ReviewMaterialRow>(
    `SELECT ${REVIEW_MATERIAL_COLS} FROM review_materials
     WHERE project_id = $1
     ORDER BY sort_order ASC`,
    [projectId],
  );
  return result.rows.map(mapReviewMaterial);
}

export async function getReviewMaterialProjectId(id: string): Promise<string | null> {
  const result = await query<{ project_id: string }>(
    `SELECT project_id FROM review_materials WHERE id = $1`,
    [id],
  );
  return result.rows[0]?.project_id ?? null;
}

export interface CreateReviewMaterialInput {
  title: string;
  url: string;
  source?: string | null;
  memo?: string | null;
}

export async function createReviewMaterial(
  projectId: string,
  input: CreateReviewMaterialInput,
): Promise<ReviewMaterial> {
  const id = newId();
  const nextOrder = await query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM review_materials
      WHERE project_id = $1`,
    [projectId],
  );
  const result = await query<ReviewMaterialRow>(
    `INSERT INTO review_materials (id, project_id, title, url, source, memo, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${REVIEW_MATERIAL_COLS}`,
    [
      id,
      projectId,
      input.title,
      input.url,
      input.source ?? null,
      input.memo ?? null,
      nextOrder.rows[0]!.next,
    ],
  );
  return mapReviewMaterial(result.rows[0]!);
}

export interface UpdateReviewMaterialInput {
  title?: string;
  url?: string;
  source?: string | null;
  memo?: string | null;
}

export async function updateReviewMaterial(
  id: string,
  input: UpdateReviewMaterialInput,
): Promise<ReviewMaterial | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [key, col] of [
    ["title", "title"],
    ["url", "url"],
    ["source", "source"],
    ["memo", "memo"],
  ] as const) {
    if (key in input) {
      sets.push(`${col} = $${i++}`);
      params.push((input as Record<string, unknown>)[key] ?? null);
    }
  }
  if (sets.length === 0) {
    const cur = await query<ReviewMaterialRow>(
      `SELECT ${REVIEW_MATERIAL_COLS} FROM review_materials WHERE id = $1`,
      [id],
    );
    const row = cur.rows[0];
    return row ? mapReviewMaterial(row) : null;
  }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const result = await query<ReviewMaterialRow>(
    `UPDATE review_materials SET ${sets.join(", ")}
     WHERE id = $${i}
     RETURNING ${REVIEW_MATERIAL_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapReviewMaterial(row) : null;
}

export async function deleteReviewMaterial(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM review_materials WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function reorderReviewMaterials(
  projectId: string,
  orderedIds: string[],
): Promise<ReviewMaterial[] | null> {
  const current = await listReviewMaterialsByProject(projectId);
  const currentIds = current.map((material) => material.id);
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
      `UPDATE review_materials
          SET sort_order = -100000 - src.ordinal::integer,
              updated_at = NOW()
         FROM unnest($2::text[]) WITH ORDINALITY AS src(id, ordinal)
        WHERE review_materials.project_id = $1
          AND review_materials.id = src.id`,
      [projectId, orderedIds],
    );
    await client.query(
      `UPDATE review_materials
          SET sort_order = src.ordinal::integer - 1,
              updated_at = NOW()
         FROM unnest($2::text[]) WITH ORDINALITY AS src(id, ordinal)
        WHERE review_materials.project_id = $1
          AND review_materials.id = src.id`,
      [projectId, orderedIds],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return listReviewMaterialsByProject(projectId);
}
