import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { ensureChildAccess, projectExistsForOwner } from "../lib/access.js";
import {
  createSpace,
  deleteSpace,
  getSpaceProjectId,
  reorderSpaces,
  updateSpace,
} from "../repos/spaces.repo.js";
import { orderedIdsBody } from "../lib/schema.js";

const spaceBodyProps = {
  name: { type: "string", minLength: 1, maxLength: 100 },
  areaSqm: { type: ["number", "null"] },
} as const;

const createSpaceSchema = {
  body: {
    type: "object",
    required: ["name"],
    additionalProperties: false,
    properties: spaceBodyProps,
  },
} as const;

const updateSpaceSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: spaceBodyProps,
  },
} as const;

const reorderSchema = { body: orderedIdsBody } as const;

interface SpaceBody {
  name?: string;
  areaSqm?: number | null;
}

interface ReorderBody {
  orderedIds: string[];
}

const spaceAccess = (id: string, ownerId: string) =>
  ensureChildAccess(getSpaceProjectId, id, ownerId, "공간을 찾을 수 없습니다.");

export default async function spacesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.post<{ Params: { projectId: string }; Body: SpaceBody }>(
    "/api/projects/:projectId/spaces",
    { schema: createSpaceSchema },
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const space = await createSpace(req.params.projectId, {
        name: req.body.name!.trim(),
        areaSqm: req.body.areaSqm ?? null,
      });
      return { ok: true, data: space };
    },
  );

  app.patch<{ Params: { projectId: string }; Body: ReorderBody }>(
    "/api/projects/:projectId/spaces/reorder",
    { schema: reorderSchema },
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const spaces = await reorderSpaces(req.params.projectId, req.body.orderedIds);
      if (!spaces) {
        return reply.code(400).send({ ok: false, error: "공간 순서가 현재 목록과 일치하지 않습니다." });
      }
      return { ok: true, data: spaces };
    },
  );

  app.patch<{ Params: { id: string }; Body: SpaceBody }>(
    "/api/spaces/:id",
    { schema: updateSpaceSchema },
    async (req, reply) => {
      const access = await spaceAccess(req.params.id, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      const updated = await updateSpace(req.params.id, req.body);
      if (!updated) {
        return reply.code(404).send({ ok: false, error: "공간을 찾을 수 없습니다." });
      }
      return { ok: true, data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/spaces/:id", async (req, reply) => {
    const access = await spaceAccess(req.params.id, userId(req));
    if (!access.ok) {
      return reply.code(access.status).send({ ok: false, error: access.message });
    }
    const ok = await deleteSpace(req.params.id);
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "공간을 찾을 수 없습니다." });
    }
    await audit(req, "delete", "space", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });
}
