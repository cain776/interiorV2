import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { PHASE_IDS, SPACE_IDS } from "../../인테리어/lib/mock/constants.ts";
import { lineItems } from "../../인테리어/lib/mock/line-items.ts";
import { phases } from "../../인테리어/lib/mock/phases.ts";
import { currentUser, project } from "../../인테리어/lib/mock/project.ts";
import { quotes } from "../../인테리어/lib/mock/quotes.ts";
import { spaces } from "../../인테리어/lib/mock/spaces.ts";
import { vendors } from "../../인테리어/lib/mock/vendors.ts";
import type { PhaseTemplateKey } from "../../인테리어/lib/constants/phase-template-keys.ts";

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

type SeedPhoto = {
  id: string;
  kind: string;
  url: string;
  caption?: string | null;
  takenAt?: string | null;
};

type SeedLineItem = {
  id: string;
  phaseId: string;
  spaceId?: string | null;
  label: string;
  memo?: string | null;
  selectedQuoteId?: string | null;
  sortOrder: number;
  photos?: SeedPhoto[];
};

const requireFromBackend = createRequire("C:/workspace/인테리어-v2/backend/package.json");
const { Client } = requireFromBackend("pg") as {
  Client: new (config: { connectionString: string }) => Queryable & {
    connect: () => Promise<void>;
    end: () => Promise<void>;
  };
};

const REVIEW_MATERIAL_URLS = [
  "https://blog.naver.com/noellasim/223893449151",
  "https://blog.naver.com/noellasim/223506791087",
  "https://blog.naver.com/noellasim/224002788720",
  "https://blog.naver.com/noellasim/223439078183",
  "https://blog.naver.com/anmut-made/223982295489",
  "https://blog.naver.com/cws_interior/223450600389",
];

// 서해그랑블 건축물현황도 PDF 기준 공간 정보.
// 치수 단위는 도면 표기 mm, areaSqm 은 mm 치수 환산값이다.
// 기존 v1 mock id 를 유지해 line_items 연결을 깨지 않되, 화면 명칭은 도면 표기로 맞춘다.
const PDF_SPACE_PLAN: Record<string, { name: string; areaSqm: number | null; sortOrder: number }> = {
  [SPACE_IDS.ENTRY]: { name: "현관", areaSqm: 3.24, sortOrder: 1 }, // 1670 x 1940
  [SPACE_IDS.LIVING]: { name: "거실", areaSqm: 27.74, sortOrder: 2 }, // 4700 x 5900
  [SPACE_IDS.KITCHEN]: { name: "주방/식당", areaSqm: 11.66, sortOrder: 3 }, // 3880 x 3000
  [SPACE_IDS.MASTER]: { name: "침실-2", areaSqm: 14.8, sortOrder: 4 },
  [SPACE_IDS.ROOM_1]: { name: "침실-3", areaSqm: 8.66, sortOrder: 5 },
  [SPACE_IDS.ROOM_2]: { name: "침실-1", areaSqm: 8.95, sortOrder: 6 },
  [SPACE_IDS.BATH_1]: { name: "욕실-1", areaSqm: 3.15, sortOrder: 7 }, // 1500 x 2100
  [SPACE_IDS.BATH_2]: { name: "욕실-2", areaSqm: 2.64, sortOrder: 8 }, // 1760 x 1500
  [SPACE_IDS.DRESS]: { name: "드레스룸", areaSqm: null, sortOrder: 9 },
  [SPACE_IDS.UTILITY]: { name: "다용도실", areaSqm: null, sortOrder: 10 },
  [SPACE_IDS.BAL_1]: { name: "발코니-1", areaSqm: 17.6, sortOrder: 11 }, // 8800 x 2000
  [SPACE_IDS.BAL_2]: { name: "발코니-2", areaSqm: 6.4, sortOrder: 12 }, // 3200 x 2000
  [SPACE_IDS.BAL_3]: { name: "발코니-3", areaSqm: 4.35, sortOrder: 13 }, // 2900 x 1500
  [SPACE_IDS.WINDOW]: { name: "창호(공통)", areaSqm: null, sortOrder: 16 },
};

const PDF_EXTRA_SPACES = [
  { id: "sp-vestibule", name: "전실", areaSqm: 3.24, sortOrder: 14 }, // 1670 x 1940
  { id: "sp-bal4", name: "발코니-4", areaSqm: 5.82, sortOrder: 15 }, // 3880 x 1500
] as const;

const OMITTED_SPACE_IDS = new Set<string>([SPACE_IDS.WINDOW]);

const phaseTemplateKeyByMockId: Record<string, PhaseTemplateKey> = {
  [PHASE_IDS.DEMO]: "demolition",
  [PHASE_IDS.WINDOW]: "window",
  [PHASE_IDS.PLUMB]: "plumbing",
  [PHASE_IDS.WOOD]: "carpentry",
  [PHASE_IDS.PAPER]: "wallpaper",
  [PHASE_IDS.FLOOR]: "flooring",
  [PHASE_IDS.PAINT]: "painting",
  [PHASE_IDS.FURN]: "furniture",
  [PHASE_IDS.CLEAN]: "cleaning",
  [PHASE_IDS.AS]: "after_service",
};

const phaseNameByMockId: Record<string, string> = {
  [PHASE_IDS.FLOOR]: "바닥/타일",
  [PHASE_IDS.FURN]: "가구/집기",
};

const phaseConsiderationsByMockId: Record<
  string,
  Array<{ id: string; label: string; source: "template"; checked: boolean; note?: string | null }>
> = {
  [PHASE_IDS.DEMO]: [
    { id: "sm-demo-1", label: "공간별 철거 범위: 문틀/몰딩/마루/타일 분리 확인", source: "template", checked: false },
    { id: "sm-demo-2", label: "발코니 확장/비확장 구간 구조체 손상 금지", source: "template", checked: false },
    { id: "sm-demo-3", label: "수도·가스·전기 차단 후 주방/욕실 철거", source: "template", checked: false },
    { id: "sm-demo-4", label: "폐기물 반출 동선, 엘리베이터 보양, 관리사무소 신고", source: "template", checked: false },
  ],
  [PHASE_IDS.WINDOW]: [
    { id: "sm-window-1", label: "발코니 대형창 분할, 개폐 방향, 방충망 포함 확인", source: "template", checked: false },
    { id: "sm-window-2", label: "로이유리/단열등급/기밀 시공 범위 확인", source: "template", checked: false },
    { id: "sm-window-3", label: "결로 취약부 폼 충진, 기밀 테이프, 실리콘 마감", source: "template", checked: false },
    { id: "sm-window-4", label: "창호 교체 후 내외부 몰딩·문턱 마감 범위", source: "template", checked: false },
  ],
  [PHASE_IDS.PLUMB]: [
    { id: "sm-plumb-1", label: "욕실 배수 구배와 방수 전 누수 테스트", source: "template", checked: false },
    { id: "sm-plumb-2", label: "주방 싱크·식세기·정수기 급배수 위치", source: "template", checked: false },
    { id: "sm-plumb-3", label: "콘센트/스위치/조명 위치를 가구 배치와 함께 실측", source: "template", checked: false },
    { id: "sm-plumb-4", label: "후드 배기, 가스 차단, 보일러/세탁기 간섭 확인", source: "template", checked: false },
  ],
  [PHASE_IDS.WOOD]: [
    { id: "sm-wood-1", label: "신발장·붙박이장 깊이와 문 열림 간섭", source: "template", checked: false },
    { id: "sm-wood-2", label: "거실 우물천장, 커튼박스, 간접조명 치수", source: "template", checked: false },
    { id: "sm-wood-3", label: "주방 상하부장, 키큰장, 냉장고장 폭 실측", source: "template", checked: false },
    { id: "sm-wood-4", label: "욕실 젠다이/거울장/수납장 보강 위치", source: "template", checked: false },
  ],
  [PHASE_IDS.PAPER]: [
    { id: "sm-paper-1", label: "공간별 실크/합지 구분과 천장 포함 여부", source: "template", checked: false },
    { id: "sm-paper-2", label: "결로·곰팡이 벽면 초배/방균 처리", source: "template", checked: false },
    { id: "sm-paper-3", label: "문틀·몰딩 도장 후 도배 순서", source: "template", checked: false },
  ],
  [PHASE_IDS.FLOOR]: [
    { id: "sm-floor-1", label: "공간별 바닥재 구분: 강마루/타일/데크", source: "template", checked: false },
    { id: "sm-floor-2", label: "현관·욕실·발코니 단차와 배수 방향", source: "template", checked: false },
    { id: "sm-floor-3", label: "마루 방향, 걸레받이 색상, 문턱 마감", source: "template", checked: false },
    { id: "sm-floor-4", label: "발코니 방수 상태와 논슬립 타일 여부", source: "template", checked: false },
  ],
  [PHASE_IDS.PAINT]: [
    { id: "sm-paint-1", label: "발코니 탄성코트/결로방지 페인트 적용 구간", source: "template", checked: false },
    { id: "sm-paint-2", label: "몰딩·문틀·문짝 도장/필름 구분", source: "template", checked: false },
    { id: "sm-paint-3", label: "색상칩 실물 확인, 퍼티/샌딩 후 2회 도장", source: "template", checked: false },
  ],
  [PHASE_IDS.FURN]: [
    { id: "sm-furn-1", label: "신발장·붙박이장·주방장 실측과 수납 구성", source: "template", checked: false },
    { id: "sm-furn-2", label: "가전/집기 모델 치수와 콘센트 위치 반영", source: "template", checked: false },
    { id: "sm-furn-3", label: "도어 색상, 손잡이, 상판, 수전 톤 매칭", source: "template", checked: false },
    { id: "sm-furn-4", label: "장 문열림, 통로 폭, 배관/후드 간섭 확인", source: "template", checked: false },
  ],
  [PHASE_IDS.CLEAN]: [
    { id: "sm-clean-1", label: "창틀·발코니·욕실 줄눈 먼지까지 청소 범위 확정", source: "template", checked: false },
    { id: "sm-clean-2", label: "입주 전 보양 제거, 실리콘/먼지 잔여 확인", source: "template", checked: false },
  ],
  [PHASE_IDS.AS]: [
    { id: "sm-as-1", label: "공정별 하자 보증기간과 담당 업체 연락처", source: "template", checked: false },
    { id: "sm-as-2", label: "입주 후 2주/1개월 점검 항목 합의", source: "template", checked: false },
  ],
};

const SPACE_MANAGEMENT_LINE_ITEMS = [
  { id: "sm-entry-middle-door", phaseId: PHASE_IDS.WOOD, spaceId: SPACE_IDS.ENTRY, label: "현관 중문 (슬림 3연동)", memo: "개폐 방향과 신발장 간섭 확인", sortOrder: 300 },
  { id: "sm-entry-threshold", phaseId: PHASE_IDS.FLOOR, spaceId: SPACE_IDS.ENTRY, label: "디딤석/문턱 마감", memo: "현관 타일과 거실 마루 단차", sortOrder: 300 },
  { id: "sm-entry-intercom", phaseId: PHASE_IDS.PLUMB, spaceId: SPACE_IDS.ENTRY, label: "도어락/인터폰/스위치 위치", memo: "중문 시공 전 위치 확정", sortOrder: 300 },
  { id: "sm-vestibule-tile", phaseId: PHASE_IDS.FLOOR, spaceId: "sp-vestibule", label: "전실 바닥 타일", memo: "현관과 동일 톤 권장", sortOrder: 301 },
  { id: "sm-vestibule-storage", phaseId: PHASE_IDS.FURN, spaceId: "sp-vestibule", label: "전실 코트장/수납장", memo: "1670mm 폭 기준 깊이 확인", sortOrder: 300 },
  { id: "sm-vestibule-light", phaseId: PHASE_IDS.PLUMB, spaceId: "sp-vestibule", label: "전실 센서등 + 스위치", memo: "현관 센서등과 동선 연동", sortOrder: 301 },
  { id: "sm-living-curtainbox", phaseId: PHASE_IDS.WOOD, spaceId: SPACE_IDS.LIVING, label: "커튼박스 + 간접조명", memo: "에어컨 배관/레일 간섭 확인", sortOrder: 301 },
  { id: "sm-living-tv-wall", phaseId: PHASE_IDS.PLUMB, spaceId: SPACE_IDS.LIVING, label: "TV벽 콘센트/랜선 정리", memo: "벽걸이 TV 높이 기준", sortOrder: 302 },
  { id: "sm-living-balcony-step", phaseId: PHASE_IDS.FLOOR, spaceId: SPACE_IDS.LIVING, label: "거실-발코니 단차 마감", memo: "확장 여부에 따라 자재 구분", sortOrder: 302 },
  { id: "sm-kitchen-tall-cabinet", phaseId: PHASE_IDS.FURN, spaceId: SPACE_IDS.KITCHEN, label: "냉장고장 + 키큰장", memo: "냉장고 실측 치수 반영", sortOrder: 301 },
  { id: "sm-kitchen-pendant", phaseId: PHASE_IDS.PLUMB, spaceId: SPACE_IDS.KITCHEN, label: "식탁등 위치 이전", memo: "식탁 중심선 기준", sortOrder: 303 },
  { id: "sm-kitchen-midway-tile", phaseId: PHASE_IDS.FLOOR, spaceId: SPACE_IDS.KITCHEN, label: "주방 미드웨이 타일", memo: "상판/상부장 높이 확정 후", sortOrder: 303 },
  { id: "sm-bed2-switch", phaseId: PHASE_IDS.PLUMB, spaceId: SPACE_IDS.MASTER, label: "안방 침대 양쪽 콘센트", memo: "협탁 위치 기준", sortOrder: 304 },
  { id: "sm-bed2-doorframe", phaseId: PHASE_IDS.PAINT, spaceId: SPACE_IDS.MASTER, label: "방문/문틀 필름 또는 도장", memo: "붙박이장 색상과 톤 맞춤", sortOrder: 300 },
  { id: "sm-bed3-desk", phaseId: PHASE_IDS.FURN, spaceId: SPACE_IDS.ROOM_1, label: "침실-3 책상/수납 위치", memo: "창문 개폐와 동선 확인", sortOrder: 302 },
  { id: "sm-bed1-closet", phaseId: PHASE_IDS.FURN, spaceId: SPACE_IDS.ROOM_2, label: "침실-1 붙박이장", memo: "문 열림 폭과 콘센트 간섭", sortOrder: 303 },
  { id: "sm-bath1-waterproof", phaseId: PHASE_IDS.PLUMB, spaceId: SPACE_IDS.BATH_1, label: "욕실-1 방수 2회 + 담수 테스트", memo: "타일 전 사진 기록", sortOrder: 305 },
  { id: "sm-bath1-fan", phaseId: PHASE_IDS.PLUMB, spaceId: SPACE_IDS.BATH_1, label: "환풍기/욕실등 교체", memo: "전원 위치와 천장 점검구", sortOrder: 306 },
  { id: "sm-bath2-shower", phaseId: PHASE_IDS.FURN, spaceId: SPACE_IDS.BATH_2, label: "욕실-2 샤워파티션", memo: "문 열림과 세면대 간섭 확인", sortOrder: 304 },
  { id: "sm-dress-vent", phaseId: PHASE_IDS.PLUMB, spaceId: SPACE_IDS.DRESS, label: "드레스룸 제습 콘센트", memo: "환기/제습기 위치", sortOrder: 307 },
  { id: "sm-utility-stack", phaseId: PHASE_IDS.FURN, spaceId: SPACE_IDS.UTILITY, label: "세탁기/건조기 직렬 배치", memo: "수전·배수·콘센트 높이 확인", sortOrder: 305 },
  { id: "sm-utility-drain", phaseId: PHASE_IDS.PLUMB, spaceId: SPACE_IDS.UTILITY, label: "다용도실 바닥 배수 트랩", memo: "역류/악취 방지 트랩", sortOrder: 308 },
  { id: "sm-bal1-tile", phaseId: PHASE_IDS.FLOOR, spaceId: SPACE_IDS.BAL_1, label: "발코니-1 바닥 타일", memo: "8800mm 장폭 배수 방향 확인", sortOrder: 304 },
  { id: "sm-bal1-coat", phaseId: PHASE_IDS.PAINT, spaceId: SPACE_IDS.BAL_1, label: "발코니-1 탄성코트", memo: "결로 취약면 보강", sortOrder: 301 },
  { id: "sm-bal1-dryer", phaseId: PHASE_IDS.FURN, spaceId: SPACE_IDS.BAL_1, label: "천장 빨래건조대", memo: "창문 개폐와 간섭 확인", sortOrder: 306 },
  { id: "sm-bal2-outdoor-unit", phaseId: PHASE_IDS.PLUMB, spaceId: SPACE_IDS.BAL_2, label: "실외기/배수 라인 확인", memo: "소음·배수 방향 체크", sortOrder: 309 },
  { id: "sm-bal2-storage", phaseId: PHASE_IDS.FURN, spaceId: SPACE_IDS.BAL_2, label: "발코니-2 수납장", memo: "방수 하부 받침 적용", sortOrder: 307 },
  { id: "sm-bal3-screen", phaseId: PHASE_IDS.WINDOW, spaceId: SPACE_IDS.BAL_3, label: "발코니-3 방충망", memo: "후면방 창호와 세트 확인", sortOrder: 300 },
  { id: "sm-bal3-waterproof", phaseId: PHASE_IDS.FLOOR, spaceId: SPACE_IDS.BAL_3, label: "발코니-3 방수/타일 보수", memo: "기존 균열부 확인", sortOrder: 305 },
  { id: "sm-bal4-tile", phaseId: PHASE_IDS.FLOOR, spaceId: "sp-bal4", label: "발코니-4 바닥 타일", memo: "주방 연결부 단차 확인", sortOrder: 306 },
  { id: "sm-bal4-faucet", phaseId: PHASE_IDS.PLUMB, spaceId: "sp-bal4", label: "발코니-4 보조수전/배수", memo: "청소수전 필요 여부", sortOrder: 310 },
  { id: "sm-bal4-storage", phaseId: PHASE_IDS.FURN, spaceId: "sp-bal4", label: "발코니-4 팬트리 수납", memo: "보일러/창문 간섭 확인", sortOrder: 308 },
] as const satisfies readonly SeedLineItem[];

const allLineItems: SeedLineItem[] = [...lineItems, ...SPACE_MANAGEMENT_LINE_ITEMS];

function parseEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function stableUuid(key: string): string {
  const chars = createHash("sha256")
    .update(`interior-crm:${key}`)
    .digest("hex")
    .slice(0, 32)
    .split("");

  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16] ?? "8", 16) & 0x3) | 0x8).toString(16);

  const value = chars.join("");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
}

function phaseId(mockId: string): string {
  return stableUuid(`phase:${mockId}`);
}

function spaceId(mockId: string): string {
  return stableUuid(`space:${mockId}`);
}

function nullableSpaceId(mockId: string | undefined | null): string | null {
  if (!mockId || OMITTED_SPACE_IDS.has(mockId)) return null;
  return spaceId(mockId);
}

function vendorId(mockId: string): string {
  return stableUuid(`vendor:${mockId}`);
}

function lineItemId(mockId: string): string {
  return stableUuid(`line-item:${mockId}`);
}

function quoteId(mockId: string): string {
  return stableUuid(`quote:${mockId}`);
}

function attachmentId(mockId: string): string {
  return stableUuid(`attachment:${mockId}`);
}

function reviewMaterialId(mockId: string): string {
  return stableUuid(`review-material:${mockId}`);
}

function optionalText(value: string | undefined | null): string | null {
  return value?.trim() || null;
}

function sourceFromUrl(url: string): string {
  return new URL(url).hostname;
}

async function getOwnerId(client: Queryable): Promise<string> {
  const existing = await client.query(
    `SELECT id FROM users ORDER BY created_at ASC NULLS LAST LIMIT 1`,
  );
  const id = existing.rows[0]?.id;
  if (typeof id === "string") return id;

  const userId = stableUuid(`user:${currentUser.email.toLowerCase()}`);
  await client.query(
    `INSERT INTO users (id, email, name, password_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [userId, currentUser.email.toLowerCase(), currentUser.name, "v1-import-placeholder"],
  );
  return userId;
}

async function seedProject(client: Queryable, ownerId: string, projectId: string): Promise<void> {
  await client.query(
    `INSERT INTO projects
       (id, owner_id, name, address, size_kr, total_budget, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'planning')
     ON CONFLICT (id) DO UPDATE SET
       owner_id = EXCLUDED.owner_id,
       name = EXCLUDED.name,
       address = EXCLUDED.address,
       size_kr = EXCLUDED.size_kr,
       total_budget = EXCLUDED.total_budget,
       updated_at = NOW()`,
    [projectId, ownerId, project.name, project.address, project.sizeKr, project.totalBudget],
  );
}

async function seedPhases(client: Queryable, projectId: string): Promise<void> {
  for (const phase of phases) {
    await client.query(
      `INSERT INTO phases
         (id, project_id, name, template_key, considerations, status, sort_order)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         project_id = EXCLUDED.project_id,
         name = EXCLUDED.name,
         template_key = EXCLUDED.template_key,
         considerations = EXCLUDED.considerations,
         status = EXCLUDED.status,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`,
      [
        phaseId(phase.id),
        projectId,
        phaseNameByMockId[phase.id] ?? phase.name,
        phaseTemplateKeyByMockId[phase.id] ?? "custom",
        JSON.stringify(phaseConsiderationsByMockId[phase.id] ?? phase.considerations),
        "planned",
        phase.sortOrder,
      ],
    );
  }
}

async function seedSpaces(client: Queryable, projectId: string): Promise<void> {
  for (const space of spaces) {
    if (OMITTED_SPACE_IDS.has(space.id)) continue;
    const pdfSpace = PDF_SPACE_PLAN[space.id] ?? {
      name: space.name,
      areaSqm: space.areaSqm ?? null,
      sortOrder: space.sortOrder,
    };
    await client.query(
      `INSERT INTO spaces (id, project_id, name, area_sqm, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         project_id = EXCLUDED.project_id,
         name = EXCLUDED.name,
         area_sqm = EXCLUDED.area_sqm,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`,
      [spaceId(space.id), projectId, pdfSpace.name, pdfSpace.areaSqm, pdfSpace.sortOrder],
    );
  }

  for (const omittedId of OMITTED_SPACE_IDS) {
    await client.query(
      `DELETE FROM spaces
        WHERE id = $1
          AND project_id = $2`,
      [spaceId(omittedId), projectId],
    );
  }

  for (const space of PDF_EXTRA_SPACES) {
    await client.query(
      `INSERT INTO spaces (id, project_id, name, area_sqm, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         project_id = EXCLUDED.project_id,
         name = EXCLUDED.name,
         area_sqm = EXCLUDED.area_sqm,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`,
      [spaceId(space.id), projectId, space.name, space.areaSqm, space.sortOrder],
    );
  }
}

async function seedVendors(client: Queryable, ownerId: string): Promise<void> {
  for (const vendor of vendors) {
    await client.query(
      `INSERT INTO vendors (id, owner_id, name, phone, specialty, rating)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         owner_id = EXCLUDED.owner_id,
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         specialty = EXCLUDED.specialty,
         rating = EXCLUDED.rating,
         updated_at = NOW()`,
      [
        vendorId(vendor.id),
        ownerId,
        vendor.name,
        optionalText(vendor.phone),
        optionalText(vendor.specialty),
        vendor.rating ?? null,
      ],
    );
  }
}

async function seedLineItems(client: Queryable): Promise<void> {
  for (const item of allLineItems) {
    await client.query(
      `INSERT INTO line_items
         (id, phase_id, space_id, label, memo, selected_quote_id, sort_order)
       VALUES ($1, $2, $3, $4, $5, NULL, $6)
       ON CONFLICT (id) DO UPDATE SET
         phase_id = EXCLUDED.phase_id,
         space_id = EXCLUDED.space_id,
         label = EXCLUDED.label,
         memo = EXCLUDED.memo,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`,
      [
        lineItemId(item.id),
        phaseId(item.phaseId),
        nullableSpaceId(item.spaceId),
        item.label,
        optionalText(item.memo),
        item.sortOrder,
      ],
    );
  }
}

async function seedQuotes(client: Queryable): Promise<void> {
  const selectedQuoteIds = new Set(
    allLineItems
      .map((item) => item.selectedQuoteId)
      .filter((id): id is string => Boolean(id)),
  );

  for (const quote of quotes) {
    await client.query(
      `INSERT INTO quotes
         (id, line_item_id, vendor_id, mode, price, status, meta, memo, selected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         line_item_id = EXCLUDED.line_item_id,
         vendor_id = EXCLUDED.vendor_id,
         mode = EXCLUDED.mode,
         price = EXCLUDED.price,
         status = EXCLUDED.status,
         meta = EXCLUDED.meta,
         memo = EXCLUDED.memo,
         selected_at = EXCLUDED.selected_at,
         updated_at = NOW()`,
      [
        quoteId(quote.id),
        lineItemId(quote.lineItemId),
        vendorId(quote.vendorId),
        quote.mode,
        quote.price,
        quote.status,
        JSON.stringify(quote.meta ?? {}),
        optionalText(quote.memo),
        selectedQuoteIds.has(quote.id) ? new Date() : null,
      ],
    );
  }

  for (const item of allLineItems) {
    await client.query(
      `UPDATE line_items
          SET selected_quote_id = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [lineItemId(item.id), item.selectedQuoteId ? quoteId(item.selectedQuoteId) : null],
    );
  }
}

async function seedPhotoAttachments(
  client: Queryable,
  projectId: string,
  ownerId: string,
): Promise<void> {
  for (const item of allLineItems) {
    for (const photo of item.photos ?? []) {
      await client.query(
        `INSERT INTO attachments
           (id, project_id, owner_type, owner_id, kind, photo_kind, filename, content_type,
            blob_url, caption, taken_at, uploaded_by_id)
         VALUES ($1, $2, 'lineItem', $3, 'photo', $4, $5, 'image/jpeg', $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           project_id = EXCLUDED.project_id,
           owner_type = EXCLUDED.owner_type,
           owner_id = EXCLUDED.owner_id,
           kind = EXCLUDED.kind,
           photo_kind = EXCLUDED.photo_kind,
           filename = EXCLUDED.filename,
           content_type = EXCLUDED.content_type,
           blob_url = EXCLUDED.blob_url,
           caption = EXCLUDED.caption,
           taken_at = EXCLUDED.taken_at,
           uploaded_by_id = EXCLUDED.uploaded_by_id,
           updated_at = NOW()`,
        [
          attachmentId(photo.id),
          projectId,
          lineItemId(item.id),
          photo.kind,
          `${photo.id}.jpg`,
          photo.url,
          optionalText(photo.caption),
          photo.takenAt ?? null,
          ownerId,
        ],
      );
    }
  }
}

async function seedReviewMaterials(client: Queryable, projectId: string): Promise<void> {
  for (const [index, url] of REVIEW_MATERIAL_URLS.entries()) {
    await client.query(
      `INSERT INTO review_materials (id, project_id, title, url, source, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         project_id = EXCLUDED.project_id,
         title = EXCLUDED.title,
         url = EXCLUDED.url,
         source = EXCLUDED.source,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`,
      [
        reviewMaterialId(`review-material-${index + 1}`),
        projectId,
        `네이버 블로그 검토자료 ${index + 1}`,
        url,
        sourceFromUrl(url),
        index,
      ],
    );
  }
}

async function countRows(client: Queryable, projectId: string): Promise<Record<string, number>> {
  const projectTables = [
    "phases",
    "spaces",
    "contracts",
    "payments",
    "change_orders",
    "as_tickets",
    "attachments",
    "review_materials",
  ];
  const counts: Record<string, number> = {};
  for (const table of projectTables) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE project_id = $1`, [
      projectId,
    ]);
    counts[table] = result.rows[0]?.count as number;
  }

  const lineItemsResult = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM line_items li
       JOIN phases p ON p.id = li.phase_id
      WHERE p.project_id = $1`,
    [projectId],
  );
  counts.line_items = lineItemsResult.rows[0]?.count as number;

  const quotesResult = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM quotes q
       JOIN line_items li ON li.id = q.line_item_id
       JOIN phases p ON p.id = li.phase_id
      WHERE p.project_id = $1`,
    [projectId],
  );
  counts.quotes = quotesResult.rows[0]?.count as number;

  return counts;
}

async function main(): Promise<void> {
  const env = parseEnv("C:/workspace/인테리어-v2/backend/.env");
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("backend/.env DATABASE_URL is required.");

  const client = new Client({ connectionString: databaseUrl });
  const projectId = stableUuid(`project:${project.id}`);

  await client.connect();
  try {
    await client.query("BEGIN");
    const ownerId = await getOwnerId(client);
    await seedProject(client, ownerId, projectId);
    await seedPhases(client, projectId);
    await seedSpaces(client, projectId);
    await seedVendors(client, ownerId);
    await seedLineItems(client);
    await seedQuotes(client);
    await seedPhotoAttachments(client, projectId, ownerId);
    await seedReviewMaterials(client, projectId);
    await client.query("COMMIT");

    const counts = await countRows(client, projectId);
    console.log(JSON.stringify({ projectId, projectName: project.name, counts }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
