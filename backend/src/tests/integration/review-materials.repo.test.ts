// reorderReviewMaterials + URL UNIQUE 제약 회귀 테스트.
// review_materials 는 UNIQUE (project_id, sort_order) 와 UNIQUE (project_id, url) 두 개.
// 재정렬 동작은 동일 패턴이라 핵심 케이스만 + URL 중복 INSERT 시 23505 발생도 검증.

import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  createReviewMaterial,
  listReviewMaterialsByProject,
  reorderReviewMaterials,
} from "../../repos/review-materials.repo.js";
import { closeDatabase, resetDatabase } from "./helpers/db.js";
import { makeProject, makeUser } from "./helpers/factories.js";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

async function setupProjectWithMaterials(count: number) {
  const user = await makeUser();
  const project = await makeProject(user.id);
  const materials = [];
  for (let i = 0; i < count; i++) {
    materials.push(
      await createReviewMaterial(project.id, {
        title: `자료-${i}`,
        url: `https://example.com/r-${Date.now()}-${i}`,
      }),
    );
  }
  return { user, project, materials };
}

describe("reorderReviewMaterials", () => {
  test("정상 재정렬: sort_order 0..n-1", async () => {
    const { project, materials } = await setupProjectWithMaterials(3);
    const reversed = [materials[2]!.id, materials[1]!.id, materials[0]!.id];

    const result = await reorderReviewMaterials(project.id, reversed);

    expect(result).not.toBeNull();
    expect(result!.map((m) => m.id)).toEqual(reversed);
    expect(result!.map((m) => m.sortOrder)).toEqual([0, 1, 2]);
  });

  test("부분 집합 거부", async () => {
    const { project, materials } = await setupProjectWithMaterials(3);

    expect(
      await reorderReviewMaterials(project.id, [materials[0]!.id, materials[1]!.id]),
    ).toBeNull();
  });

  test("외부 id 포함 거부", async () => {
    const { project, materials } = await setupProjectWithMaterials(2);

    expect(
      await reorderReviewMaterials(project.id, [
        materials[0]!.id,
        materials[1]!.id,
        "foreign",
      ]),
    ).toBeNull();
  });

  test("swap: UNIQUE 충돌 회피", async () => {
    const { project, materials } = await setupProjectWithMaterials(2);

    const result = await reorderReviewMaterials(project.id, [
      materials[1]!.id,
      materials[0]!.id,
    ]);

    expect(result).not.toBeNull();
    expect(result!.map((m) => m.sortOrder)).toEqual([0, 1]);
  });

  test("재정렬 후 list 는 sort_order 오름차순", async () => {
    const { project, materials } = await setupProjectWithMaterials(3);
    const newOrder = [materials[1]!.id, materials[2]!.id, materials[0]!.id];

    await reorderReviewMaterials(project.id, newOrder);
    const list = await listReviewMaterialsByProject(project.id);

    expect(list.map((m) => m.id)).toEqual(newOrder);
  });
});

describe("createReviewMaterial URL UNIQUE", () => {
  test("같은 프로젝트 내 동일 URL 두 번 INSERT → PostgreSQL 23505 unique_violation", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);
    const url = "https://example.com/dup";

    await createReviewMaterial(project.id, { title: "첫번째", url });

    await expect(
      createReviewMaterial(project.id, { title: "중복", url }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  test("다른 프로젝트끼리는 같은 URL 허용 (UNIQUE 는 project_id 와 합성)", async () => {
    const user = await makeUser();
    const p1 = await makeProject(user.id);
    const p2 = await makeProject(user.id);
    const url = "https://example.com/shared";

    await createReviewMaterial(p1.id, { title: "p1", url });
    // p2 에서는 같은 url 이라도 OK.
    const m2 = await createReviewMaterial(p2.id, { title: "p2", url });

    expect(m2.url).toBe(url);
  });
});
