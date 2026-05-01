// reorderLineItems 회귀 테스트.
// UNIQUE (phase_id, sort_order) + 2단계 update 패턴.
// 견적 항목 정렬은 사용자가 가장 자주 만지는 영역이라 회귀 위험 큼.

import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  listLineItemsByPhase,
  reorderLineItems,
} from "../../repos/line-items.repo.js";
import { closeDatabase, resetDatabase } from "./helpers/db.js";
import {
  makeLineItem,
  makePhase,
  makeProject,
  makeUser,
} from "./helpers/factories.js";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

async function setupPhaseWithLineItems(count: number) {
  const user = await makeUser();
  const project = await makeProject(user.id);
  const phase = await makePhase(project.id);
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push(await makeLineItem(phase.id, { label: `항목-${i}` }));
  }
  return { user, project, phase, items };
}

describe("reorderLineItems", () => {
  test("정상 재정렬: orderedIds 순서대로 sort_order 0..n-1", async () => {
    const { phase, items } = await setupPhaseWithLineItems(3);
    const reversed = [items[2]!.id, items[1]!.id, items[0]!.id];

    const result = await reorderLineItems(phase.id, reversed);

    expect(result).not.toBeNull();
    expect(result!.map((li) => li.id)).toEqual(reversed);
    expect(result!.map((li) => li.sortOrder)).toEqual([0, 1, 2]);
  });

  test("부분 집합 거부", async () => {
    const { phase, items } = await setupPhaseWithLineItems(3);

    expect(
      await reorderLineItems(phase.id, [items[0]!.id, items[1]!.id]),
    ).toBeNull();
  });

  test("외부 id 포함 거부", async () => {
    const { phase, items } = await setupPhaseWithLineItems(2);

    expect(
      await reorderLineItems(phase.id, [items[0]!.id, items[1]!.id, "x"]),
    ).toBeNull();
  });

  test("swap: UNIQUE 충돌 없이 두 행 자리 교환", async () => {
    const { phase, items } = await setupPhaseWithLineItems(2);

    const result = await reorderLineItems(phase.id, [items[1]!.id, items[0]!.id]);

    expect(result).not.toBeNull();
    expect(result!.map((li) => li.sortOrder)).toEqual([0, 1]);
  });

  test("다른 phase 의 line item 은 영향 안 받음", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);
    const phase1 = await makePhase(project.id);
    const phase2 = await makePhase(project.id);
    const a = await makeLineItem(phase1.id, { label: "phase1-a" });
    const b = await makeLineItem(phase1.id, { label: "phase1-b" });
    const c = await makeLineItem(phase2.id, { label: "phase2-c" });

    await reorderLineItems(phase1.id, [b.id, a.id]);

    // phase2 의 c 는 sort_order 변경 없음.
    const phase2List = await listLineItemsByPhase(phase2.id);
    expect(phase2List.map((li) => li.id)).toEqual([c.id]);
    expect(phase2List[0]!.sortOrder).toBe(0);
  });

  test("재정렬 후 listLineItemsByPhase 는 sort_order 오름차순", async () => {
    const { phase, items } = await setupPhaseWithLineItems(4);
    const newOrder = [items[3]!.id, items[1]!.id, items[2]!.id, items[0]!.id];

    await reorderLineItems(phase.id, newOrder);
    const list = await listLineItemsByPhase(phase.id);

    expect(list.map((li) => li.id)).toEqual(newOrder);
    expect(list.map((li) => li.sortOrder)).toEqual([0, 1, 2, 3]);
  });
});
