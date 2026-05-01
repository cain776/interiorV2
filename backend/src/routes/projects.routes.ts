import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import {
  createProject,
  deleteProject,
  getProjectByIdForOwner,
  listProjects,
  updateProject,
} from "../repos/projects.repo.js";
import { getWorkspaceBundle } from "../repos/workspace.repo.js";
import type { ProjectStatus } from "../types/domain.js";
import { STATUS_PROJECT, nullableIsoDate } from "../lib/schema.js";

const projectBodyProps = {
  name: { type: "string", minLength: 1, maxLength: 200 },
  address: { type: ["string", "null"], maxLength: 500 },
  sizeKr: { type: ["number", "null"] },
  startDate: nullableIsoDate,
  endDate: nullableIsoDate,
  totalBudget: { type: ["number", "null"] },
  status: { type: "string", enum: STATUS_PROJECT },
} as const;

const createProjectSchema = {
  body: {
    type: "object",
    required: ["name"],
    additionalProperties: false,
    properties: projectBodyProps,
  },
} as const;

const updateProjectSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: projectBodyProps,
  },
} as const;

interface ProjectBody {
  name?: string;
  address?: string | null;
  sizeKr?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  totalBudget?: number | null;
  status?: ProjectStatus;
}

export default async function projectsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get("/api/projects", async (req) => {
    const data = await listProjects(userId(req));
    return { ok: true, data };
  });

  app.post<{ Body: ProjectBody }>(
    "/api/projects",
    { schema: createProjectSchema },
    async (req) => {
      const body = req.body;
      const project = await createProject(userId(req), {
        name: body.name!.trim(),
        address: body.address ?? null,
        sizeKr: body.sizeKr ?? null,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        totalBudget: body.totalBudget ?? null,
        status: body.status,
      });
      return { ok: true, data: project };
    },
  );

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const project = await getProjectByIdForOwner(req.params.id, userId(req));
    if (!project) {
      return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
    }
    return { ok: true, data: project };
  });

  app.patch<{ Params: { id: string }; Body: ProjectBody }>(
    "/api/projects/:id",
    { schema: updateProjectSchema },
    async (req, reply) => {
      const updated = await updateProject(req.params.id, userId(req), req.body);
      if (!updated) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      return { ok: true, data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const ok = await deleteProject(req.params.id, userId(req));
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
    }
    await audit(req, "delete", "project", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });

  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/workspace",
    async (req, reply) => {
      const bundle = await getWorkspaceBundle(req.params.id, userId(req));
      if (!bundle) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      return { ok: true, data: bundle };
    },
  );
}
