import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { ensureChildAccess, projectExistsForOwner } from "../lib/access.js";
import {
  createReviewMaterial,
  deleteReviewMaterial,
  getReviewMaterialProjectId,
  listReviewMaterialsByProject,
  reorderReviewMaterials,
  updateReviewMaterial,
} from "../repos/review-materials.repo.js";
import { orderedIdsBody } from "../lib/schema.js";

const reviewMaterialCreateBody = {
  type: "object",
  required: ["title", "url"],
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 300 },
    url: { type: "string", minLength: 1, maxLength: 2000 },
    source: { type: ["string", "null"], maxLength: 100 },
    memo: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

const reviewMaterialPatchBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 300 },
    url: { type: "string", minLength: 1, maxLength: 2000 },
    source: { type: ["string", "null"], maxLength: 100 },
    memo: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

const reorderSchema = { body: orderedIdsBody } as const;

interface ReviewMaterialCreateBody {
  title: string;
  url: string;
  source?: string | null;
  memo?: string | null;
}

interface ReviewMaterialPatchBody {
  title?: string;
  url?: string;
  source?: string | null;
  memo?: string | null;
}

interface ReorderBody {
  orderedIds: string[];
}

const reviewMaterialAccess = (id: string, ownerId: string) =>
  ensureChildAccess(getReviewMaterialProjectId, id, ownerId, "검토자료를 찾을 수 없습니다.");

function isUniqueError(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "23505";
}

export default async function reviewMaterialsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/review-materials",
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const data = await listReviewMaterialsByProject(req.params.projectId);
      return { ok: true, data };
    },
  );

  app.post<{ Params: { projectId: string }; Body: ReviewMaterialCreateBody }>(
    "/api/projects/:projectId/review-materials",
    { schema: { body: reviewMaterialCreateBody } },
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      try {
        const data = await createReviewMaterial(req.params.projectId, {
          ...req.body,
          title: req.body.title.trim(),
          url: req.body.url.trim(),
        });
        return { ok: true, data };
      } catch (err) {
        if (isUniqueError(err)) {
          return reply.code(400).send({ ok: false, error: "이미 등록된 URL 입니다." });
        }
        throw err;
      }
    },
  );

  app.patch<{ Params: { projectId: string }; Body: ReorderBody }>(
    "/api/projects/:projectId/review-materials/reorder",
    { schema: reorderSchema },
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const data = await reorderReviewMaterials(req.params.projectId, req.body.orderedIds);
      if (!data) {
        return reply.code(404).send({ ok: false, error: "검토자료를 찾을 수 없습니다." });
      }
      return { ok: true, data };
    },
  );

  app.patch<{ Params: { id: string }; Body: ReviewMaterialPatchBody }>(
    "/api/review-materials/:id",
    { schema: { body: reviewMaterialPatchBody } },
    async (req, reply) => {
      const access = await reviewMaterialAccess(req.params.id, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      const patch = { ...req.body };
      if (patch.title) patch.title = patch.title.trim();
      if (patch.url) patch.url = patch.url.trim();
      try {
        const updated = await updateReviewMaterial(req.params.id, patch);
        if (!updated) {
          return reply.code(404).send({ ok: false, error: "검토자료를 찾을 수 없습니다." });
        }
        return { ok: true, data: updated };
      } catch (err) {
        if (isUniqueError(err)) {
          return reply.code(400).send({ ok: false, error: "이미 등록된 URL 입니다." });
        }
        throw err;
      }
    },
  );

  app.delete<{ Params: { id: string } }>("/api/review-materials/:id", async (req, reply) => {
    const access = await reviewMaterialAccess(req.params.id, userId(req));
    if (!access.ok) {
      return reply.code(access.status).send({ ok: false, error: access.message });
    }
    const ok = await deleteReviewMaterial(req.params.id);
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "검토자료를 찾을 수 없습니다." });
    }
    await audit(req, "delete", "reviewMaterial", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });
}
