// reorderSpaces 회귀 테스트.
// spaces 도 phases 와 동일하게 UNIQUE (project_id, sort_order) + 2단계 update 패턴.
// 별도 함수라 phases 테스트와 별개로 회귀 보호.

import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  listSpacesByProject,
  reorderSpaces,
} from "../../repos/spaces.repo.js";
import { closeDatabase, resetDatabase } from "./helpers/db.js";
import { makeProject, makeSpace, makeUser } from "./helpers/factories.js";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

async function setupProjectWithSpaces(count: number) {
  const user = await makeUser();
  const project = await makeProject(user.id);
  const spaces = [];
  for (let i = 0; i < count; i++) {
    spaces.push(await makeSpace(project.id, { name: `공간-${i}` }));
  }
  return { user, project, spaces };
}

describe("reorderSpaces", () => {
  test("정상 재정렬: orderedIds 순서대로 sort_order 0..n-1", async () => {
    const { project, spaces } = await setupProjectWithSpaces(3);
    const reversed = [spaces[2]!.id, spaces[1]!.id, spaces[0]!.id];

    const result = await reorderSpaces(project.id, reversed);

    expect(result).not.toBeNull();
    expect(result!.map((s) => s.id)).toEqual(reversed);
    expect(result!.map((s) => s.sortOrder)).toEqual([0, 1, 2]);
  });

  test("부분 집합 (id 누락) 은 거부", async () => {
    const { project, spaces } = await setupProjectWithSpaces(3);

    expect(
      await reorderSpaces(project.id, [spaces[0]!.id, spaces[1]!.id]),
    ).toBeNull();
  });

  test("외부 id 포함은 거부", async () => {
    const { project, spaces } = await setupProjectWithSpaces(2);

    expect(
      await reorderSpaces(project.id, [spaces[0]!.id, spaces[1]!.id, "foreign"]),
    ).toBeNull();
  });

  test("swap: UNIQUE 충돌 회피 정상 동작", async () => {
    const { project, spaces } = await setupProjectWithSpaces(2);

    const result = await reorderSpaces(project.id, [spaces[1]!.id, spaces[0]!.id]);

    expect(result).not.toBeNull();
    expect(result!.map((s) => s.sortOrder)).toEqual([0, 1]);
  });

  test("재정렬 후 list 조회는 sort_order 오름차순", async () => {
    const { project, spaces } = await setupProjectWithSpaces(3);
    const newOrder = [spaces[2]!.id, spaces[0]!.id, spaces[1]!.id];

    await reorderSpaces(project.id, newOrder);
    const list = await listSpacesByProject(project.id);

    expect(list.map((s) => s.id)).toEqual(newOrder);
  });
});
