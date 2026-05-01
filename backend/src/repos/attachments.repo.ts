import { query } from "../lib/db.js";
import { newId } from "../lib/id.js";
import type {
  Attachment,
  AttachmentKind,
  AttachmentOwnerType,
  PhotoKind,
} from "../types/domain.js";

interface AttachmentRow {
  id: string;
  project_id: string;
  owner_type: AttachmentOwnerType;
  owner_id: string;
  kind: AttachmentKind;
  photo_kind: PhotoKind | null;
  filename: string;
  content_type: string | null;
  byte_size: number | null;
  blob_url: string;
  blob_pathname: string | null;
  caption: string | null;
  taken_at: Date | null;
  link_url: string | null;
  sort_order: number;
  uploaded_by_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const ATTACHMENT_COLS =
  "id, project_id, owner_type, owner_id, kind, photo_kind, filename, content_type, byte_size, blob_url, blob_pathname, caption, taken_at, link_url, sort_order, uploaded_by_id, created_at, updated_at";
const ATTACHMENT_COLS_A =
  "a.id, a.project_id, a.owner_type, a.owner_id, a.kind, a.photo_kind, a.filename, a.content_type, a.byte_size, a.blob_url, a.blob_pathname, a.caption, a.taken_at, a.link_url, a.sort_order, a.uploaded_by_id, a.created_at, a.updated_at";

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    kind: row.kind,
    photoKind: row.photo_kind,
    filename: row.filename,
    contentType: row.content_type,
    byteSize: row.byte_size,
    blobUrl: row.blob_url,
    blobPathname: row.blob_pathname,
    caption: row.caption,
    takenAt: toIsoDate(row.taken_at),
    linkUrl: row.link_url,
    sortOrder: row.sort_order,
    uploadedById: row.uploaded_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAttachmentsByProject(projectId: string): Promise<Attachment[]> {
  const result = await query<AttachmentRow>(
    `SELECT ${ATTACHMENT_COLS} FROM attachments
     WHERE project_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [projectId],
  );
  return result.rows.map(mapAttachment);
}

export async function getAttachmentProjectId(id: string): Promise<string | null> {
  const result = await query<{ project_id: string }>(
    `SELECT project_id FROM attachments WHERE id = $1`,
    [id],
  );
  return result.rows[0]?.project_id ?? null;
}

export interface CreateAttachmentInput {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  kind?: AttachmentKind;
  photoKind?: PhotoKind | null;
  filename: string;
  contentType?: string | null;
  byteSize?: number | null;
  blobUrl: string;
  blobPathname?: string | null;
  caption?: string | null;
  takenAt?: string | null;
  linkUrl?: string | null;
  sortOrder?: number | null;
  uploadedById?: string | null;
}

export async function createAttachment(
  projectId: string,
  input: CreateAttachmentInput,
): Promise<Attachment> {
  const id = newId();
  const result = await query<AttachmentRow>(
    `INSERT INTO attachments
       (id, project_id, owner_type, owner_id, kind, photo_kind, filename, content_type,
        byte_size, blob_url, blob_pathname, caption, taken_at, link_url, sort_order, uploaded_by_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       COALESCE($15, (
         SELECT COALESCE(MAX(sort_order), 0) + 1
           FROM attachments
          WHERE project_id = $2
            AND owner_type = $3
            AND owner_id = $4
            AND kind = $5
       )),
       $16)
     RETURNING ${ATTACHMENT_COLS}`,
    [
      id,
      projectId,
      input.ownerType,
      input.ownerId,
      input.kind ?? "photo",
      input.photoKind ?? null,
      input.filename,
      input.contentType ?? null,
      input.byteSize ?? null,
      input.blobUrl,
      input.blobPathname ?? null,
      input.caption ?? null,
      input.takenAt ?? null,
      input.linkUrl ?? null,
      input.sortOrder ?? null,
      input.uploadedById ?? null,
    ],
  );
  return mapAttachment(result.rows[0]!);
}

export interface UpdateAttachmentInput {
  kind?: AttachmentKind;
  photoKind?: PhotoKind | null;
  filename?: string;
  contentType?: string | null;
  byteSize?: number | null;
  blobUrl?: string;
  blobPathname?: string | null;
  caption?: string | null;
  takenAt?: string | null;
  linkUrl?: string | null;
  sortOrder?: number | null;
}

export async function updateAttachment(
  id: string,
  input: UpdateAttachmentInput,
): Promise<Attachment | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [key, col] of [
    ["kind", "kind"],
    ["photoKind", "photo_kind"],
    ["filename", "filename"],
    ["contentType", "content_type"],
    ["byteSize", "byte_size"],
    ["blobUrl", "blob_url"],
    ["blobPathname", "blob_pathname"],
    ["caption", "caption"],
    ["takenAt", "taken_at"],
    ["linkUrl", "link_url"],
    ["sortOrder", "sort_order"],
  ] as const) {
    if (key in input) {
      sets.push(`${col} = $${i++}`);
      params.push((input as Record<string, unknown>)[key] ?? null);
    }
  }
  if (sets.length === 0) {
    const cur = await query<AttachmentRow>(
      `SELECT ${ATTACHMENT_COLS} FROM attachments WHERE id = $1`,
      [id],
    );
    const row = cur.rows[0];
    return row ? mapAttachment(row) : null;
  }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const result = await query<AttachmentRow>(
    `UPDATE attachments SET ${sets.join(", ")}
     WHERE id = $${i}
     RETURNING ${ATTACHMENT_COLS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapAttachment(row) : null;
}

export async function reorderAttachments(
  projectId: string,
  orderedIds: string[],
): Promise<Attachment[] | null> {
  if (orderedIds.length === 0) return [];
  const existing = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM attachments
      WHERE project_id = $1
        AND id = ANY($2::text[])`,
    [projectId, orderedIds],
  );
  if (existing.rows[0]?.count !== orderedIds.length) return null;

  const result = await query<AttachmentRow>(
    `WITH ordered AS (
       SELECT id, ord::int AS sort_order
         FROM unnest($2::text[]) WITH ORDINALITY AS item(id, ord)
     )
     UPDATE attachments a
        SET sort_order = ordered.sort_order,
            updated_at = NOW()
       FROM ordered
      WHERE a.project_id = $1
        AND a.id = ordered.id
      RETURNING ${ATTACHMENT_COLS_A}`,
    [projectId, orderedIds],
  );
  return result.rows.map(mapAttachment).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function deleteAttachment(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM attachments WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
