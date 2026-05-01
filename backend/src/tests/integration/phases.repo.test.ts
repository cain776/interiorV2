// reorderPhases 회귀 테스트.
//
// phases 테이블 UNIQUE (project_id, sort_order) 제약 때문에 1단계 직접 UPDATE 면
// 충돌 발생. repo 는 두 단계로 우회: ① 음수 임시값 → ② 최종 sort_order.
// 트랜잭션 안에서 처리하므로 중간 실패 시 롤백.
//
// 깨지면 sort_order 가 어긋나거나 UNIQUE 위반으로 사용자가 드래그 정렬 못 하게 됨.

import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  listPhasesByProject,
  reorderPhases,
} from "../../repos/phases.repo.js";
import { closeDatabase, resetDatabase } from "./helpers/db.js";
import { makePhase, makeProject, makeUser } from "./helpers/factories.js";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

async function setupProjectWithPhases(count: number) {
  const user = await makeUser();
  const project = await makeProject(user.id);
  const phases = [];
  for (let i = 0; i < count; i++) {
    phases.push(await makePhase(project.id, { name: `공정-${i}` }));
  }
  return { user, project, phases };
}

describe("reorderPhases", () => {
  test("정상 재정렬: orderedIds 순서대로 sort_order 0..n-1 부여", async () => {
    const { project, phases } = await setupProjectWithPhases(3);
    const reversed = [phases[2]!.id, phases[1]!.id, phases[0]!.id];

    const result = await reorderPhases(project.id, reversed);

    expect(result).not.toBeNull();
    expect(result!.map((p) => p.id)).toEqual(reversed);
    expect(result!.map((p) => p.sortOrder)).toEqual([0, 1, 2]);
  });

  test("부분 집합 (id 누락) 은 거부 — null 반환", async () => {
    const { project, phases } = await setupProjectWithPhases(3);
    const partial = [phases[0]!.id, phases[1]!.id]; // phases[2] 빠짐

    const result = await reorderPhases(project.id, partial);

    expect(result).toBeNull();
  });

  test("외부 id 포함 (현재 목록과 불일치) 은 거부", async () => {
    const { project, phases } = await setupProjectWithPhases(2);
    const withForeign = [phases[0]!.id, phases[1]!.id, "foreign-id"];

    const result = await reorderPhases(project.id, withForeign);

    expect(result).toBeNull();
  });

  test("UNIQUE 충돌 회피 — 같은 sort_order 자리 swap 도 정상 동작", async () => {
    // 0,1 두 개를 [1,0] 으로 swap → 두 행 모두 sort_order 가 상대 자리로 이동.
    // 1단계 직접 UPDATE 면 UNIQUE 위반. 2단계 패턴이 깨지면 여기서 throw.
    const { project, phases } = await setupProjectWithPhases(2);

    const result = await reorderPhases(project.id, [phases[1]!.id, phases[0]!.id]);

    expect(result).not.toBeNull();
    expect(result!.map((p) => p.sortOrder)).toEqual([0, 1]);
    expect(result!.map((p) => p.id)).toEqual([phases[1]!.id, phases[0]!.id]);
  });

  test("재정렬 후 listPhasesByProject 는 sort_order 오름차순", async () => {
    const { project, phases } = await setupProjectWithPhases(4);
    const newOrder = [phases[3]!.id, phases[0]!.id, phases[2]!.id, phases[1]!.id];

    await reorderPhases(project.id, newOrder);
    const list = await listPhasesByProject(project.id);

    expect(list.map((p) => p.id)).toEqual(newOrder);
    expect(list.map((p) => p.sortOrder)).toEqual([0, 1, 2, 3]);
  });
});
