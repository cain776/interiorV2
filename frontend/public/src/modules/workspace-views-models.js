// 3D 모델 작업대. 서버/DB 변경 없이 현재 워크스페이스 데이터를 모델 입력으로 정리한다.

import { esc } from "../dom.js";
import {
  iBox, iCamera, iCheck, iClipboardList, iImage, iLayoutGrid, iUpload,
} from "./icons.js";
import { formatArea, sqmToPyeong } from "./workspace-format.js";
import {
  currentSpace,
  getPhotosForSpace,
  isWholeHomeSpaceId,
  modelRooms,
  wholeHomeRoom,
  WHOLE_HOME_SPACE_ID,
} from "./workspace-selectors.js";
import { uniquePhotos } from "./workspace-views-photos.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {import("../api.js").Attachment} Attachment */
/** @typedef {import("../api.js").LineItem} LineItem */
/** @typedef {import("../api.js").Space} Space */
/** @typedef {import("./workspace-format.js").PhotoItem} PhotoItem */

/** @param {WorkspaceState} s */
export function renderModelViewerPane(s) {
  const rooms = modelRooms(s);
  const selected = currentSpace(s);
  const selectedRoom = selected && !isWholeHomeSpaceId(selected.id) ? selected : null;
  const targetRooms = selectedRoom ? [selectedRoom] : rooms;
  const floorplans = floorplanAttachments(s);
  const photos = modelPhotos(s, targetRooms, selected);
  const summary = modelSummary(s, targetRooms, floorplans, photos);

  return `
    <div class="model-workspace-grid">
      ${renderRoomList(s, rooms, selected)}
      ${renderModelStage(s, rooms, selectedRoom, summary)}
      ${renderInspector(s, selected, targetRooms, summary, floorplans, photos)}
    </div>
  `;
}

/**
 * @param {WorkspaceState} s
 * @param {Space[]} rooms
 * @param {Space|null} selected
 */
function renderRoomList(s, rooms, selected) {
  return `
    <aside class="model-room-list mini-panel">
      <header class="panel-head">
        <div class="panel-title">${iLayoutGrid({ size: 13 })}<span>공간</span></div>
        <span class="badge">${rooms.length}개</span>
      </header>
      <div class="model-room-scroll">
        ${renderRoomButton(s, wholeHomeRoom(s), selected?.id === WHOLE_HOME_SPACE_ID)}
        ${rooms.map((room) => renderRoomButton(s, room, selected?.id === room.id)).join("")}
      </div>
    </aside>
  `;
}

/**
 * @param {WorkspaceState} s
 * @param {Space[]} rooms
 * @param {Space|null} selectedRoom
 * @param {ReturnType<typeof modelSummary>} summary
 */
function renderModelStage(s, rooms, selectedRoom, summary) {
  return `
    <main class="model-stage mini-panel">
      <header class="panel-head model-stage-head">
        <div class="panel-title">${iBox({ size: 13 })}<span>3D 모델</span></div>
        ${renderStageControls(s)}
      </header>
      <div class="model-stage-body">
        ${renderModelPreview(s, rooms, selectedRoom)}
        ${renderReadiness(summary)}
      </div>
    </main>
  `;
}

/** @param {WorkspaceState} s */
function renderStageControls(s) {
  return `
    <div class="model-control-strip">
      <div class="mode-tabs compact" aria-label="3D 카메라">
        ${renderToggle("ws-model-camera", "camera", "isometric", "입체", s.modelCamera === "isometric")}
        ${renderToggle("ws-model-camera", "camera", "top", "평면", s.modelCamera === "top")}
        ${renderToggle("ws-model-camera", "camera", "front", "입면", s.modelCamera === "front")}
      </div>
      <div class="mode-tabs compact" aria-label="모델 상세도">
        ${renderToggle("ws-model-detail", "detail", "walls", "벽체", s.modelDetail === "walls")}
        ${renderToggle("ws-model-detail", "detail", "mass", "매스", s.modelDetail === "mass")}
      </div>
      <button class="compact-btn" data-action="ws-model-toggle-references" aria-pressed="${s.modelShowReferences ? "true" : "false"}">
        ${iImage({ size: 12 })}<span>${s.modelShowReferences ? "레퍼런스 켬" : "레퍼런스 끔"}</span>
      </button>
    </div>
  `;
}

/**
 * @param {string} action
 * @param {string} key
 * @param {string} value
 * @param {string} label
 * @param {boolean} active
 */
function renderToggle(action, key, value, label, active) {
  return `<button data-action="${action}" data-${key}="${value}" class="${active ? "active brand" : ""}">${label}</button>`;
}

/**
 * @param {WorkspaceState} s
 * @param {Space[]} rooms
 * @param {Space|null} selectedRoom
 */
function renderModelPreview(s, rooms, selectedRoom) {
  const visibleRooms = selectedRoom ? [selectedRoom] : rooms;
  if (visibleRooms.length === 0) return `<div class="empty-dashed grow">공간 데이터가 없습니다.</div>`;
  const sceneClass = `model-scene camera-${s.modelCamera} detail-${s.modelDetail}`;
  return `
    <div class="${sceneClass}" aria-label="3D 공간 미리보기">
      <div class="model-floor">
        ${visibleRooms.map((room, index) => renderRoomBlock(room, index, selectedRoom !== null)).join("")}
      </div>
      ${s.modelShowReferences ? renderReferencePins(visibleRooms) : ""}
    </div>
  `;
}

/**
 * @param {Space} room
 * @param {number} index
 * @param {boolean} focused
 */
function renderRoomBlock(room, index, focused) {
  const area = safeArea(room);
  const width = focused ? 208 : Math.max(98, Math.min(196, 72 + area * 2.3));
  const depth = focused ? 146 : Math.max(72, Math.min(142, 54 + area * 1.6));
  const height = focused ? 66 : Math.max(30, Math.min(64, 24 + area * 0.5));
  const col = index % 3;
  const row = Math.floor(index / 3);
  const x = 38 + col * 166 + (row % 2) * 42;
  const y = 44 + row * 116;
  return `
    <button class="model-room-block" style="--x:${x}px; --y:${y}px; --w:${width}px; --d:${depth}px; --h:${height}px" data-action="ws-select-space" data-id="${esc(room.id)}" title="${esc(room.name)}">
      <span>${esc(room.name)}</span>
      <small>${area ? `${formatArea(area)}㎡` : "미입력"}</small>
      <i class="wall north"></i><i class="wall east"></i><i class="wall south"></i><i class="wall west"></i>
    </button>
  `;
}

/** @param {Space[]} rooms */
function renderReferencePins(rooms) {
  return rooms.slice(0, 6).map((room, index) => `
    <span class="model-reference-pin" style="--pin-x:${18 + index * 12}%; --pin-y:${22 + (index % 3) * 17}%">
      ${iCamera({ size: 11 })}<small>${esc(room.name)}</small>
    </span>
  `).join("");
}

/** @param {ReturnType<typeof modelSummary>} summary */
function renderReadiness(summary) {
  const readyCount = summary.checks.filter((item) => item.ready).length;
  return `
    <div class="model-readiness">
      <div class="model-readiness-head">
        <strong>생성 준비도</strong>
        <span>${readyCount}/${summary.checks.length}</span>
      </div>
      <div class="model-check-list">
        ${summary.checks.map((item) => `
          <span class="${item.ready ? "ready" : ""}">${item.ready ? iCheck({ size: 11 }) : ""}${esc(item.label)}</span>
        `).join("")}
      </div>
    </div>
  `;
}

/**
 * @param {WorkspaceState} s
 * @param {Space|null} selected
 * @param {Space[]} rooms
 * @param {ReturnType<typeof modelSummary>} summary
 * @param {Attachment[]} floorplans
 * @param {PhotoItem[]} photos
 */
function renderInspector(s, selected, rooms, summary, floorplans, photos) {
  return `
    <aside class="model-inspector mini-panel">
      <header class="panel-head">
        <div class="panel-title">${iClipboardList({ size: 13 })}<span>모델 정보</span></div>
        <span class="badge">${esc(selected?.name ?? "전체")}</span>
      </header>
      <div class="model-inspector-body">
        ${renderStatGrid(summary)}
        ${renderGenerationPanel(summary)}
        ${renderPipeline()}
        ${renderSurfaceSummary(s, rooms)}
        ${renderReferencePanel(floorplans, photos)}
      </div>
    </aside>
  `;
}

/** @param {ReturnType<typeof modelSummary>} summary */
function renderGenerationPanel(summary) {
  const ready = summary.checks.every((item) => item.ready);
  return `
    <section class="model-subpanel model-generation-panel">
      <h3>생성 패키지</h3>
      <p>${ready ? "MCP 입력으로 넘길 기본 데이터가 준비됐습니다." : "부족한 항목은 생성 준비도에서 확인할 수 있습니다."}</p>
      <button class="compact-btn" data-action="ws-open-model-payload">
        ${iClipboardList({ size: 12 })}<span>패키지 보기</span>
      </button>
      <button class="compact-btn" data-action="ws-open-sketchup-ruby">
        ${iBox({ size: 12 })}<span>SketchUp 스크립트</span>
      </button>
      <button class="compact-btn" data-action="ws-open-sketchup-bridge">
        ${iUpload({ size: 12 })}<span>브릿지 명령</span>
      </button>
      <button class="compact-btn primary" data-action="ws-send-sketchup-bridge">
        ${iUpload({ size: 12 })}<span>SketchUp으로 보내기</span>
      </button>
    </section>
  `;
}

/** @param {ReturnType<typeof modelSummary>} summary */
function renderStatGrid(summary) {
  return `
    <div class="model-stat-grid">
      ${renderStat("공간", `${summary.roomCount}개`)}
      ${renderStat("면적", `${formatArea(summary.areaSqm)}㎡`)}
      ${renderStat("평수", `${formatArea(sqmToPyeong(summary.areaSqm))}평`)}
      ${renderStat("견적 항목", `${summary.lineItemCount}개`)}
      ${renderStat("도면", `${summary.floorplanCount}개`)}
      ${renderStat("사진", `${summary.photoCount}장`)}
    </div>
  `;
}

function renderPipeline() {
  return `
    <div class="model-pipeline">
      ${renderPipelineItem(iUpload({ size: 13 }), "도면")}
      ${renderPipelineItem(iLayoutGrid({ size: 13 }), "공간")}
      ${renderPipelineItem(iBox({ size: 13 }), "모델")}
      ${renderPipelineItem(iImage({ size: 13 }), "견적")}
    </div>
  `;
}

/** @param {WorkspaceState} s @param {Space[]} rooms */
function renderSurfaceSummary(s, rooms) {
  const summary = surfaceSummary(s, rooms);
  return `
    <section class="model-subpanel">
      <h3>견적 연결</h3>
      <div class="model-surface-list">
        ${summary.map((item) => `
          <div><span>${esc(item.label)}</span><strong>${item.count}</strong></div>
        `).join("")}
      </div>
    </section>
  `;
}

/**
 * @param {Attachment[]} floorplans
 * @param {PhotoItem[]} photos
 */
function renderReferencePanel(floorplans, photos) {
  const photoPreview = photos.slice(0, 4);
  return `
    <section class="model-subpanel">
      <h3>도면 / 사진</h3>
      <div class="model-reference-grid">
        ${floorplans.slice(0, 2).map(renderDrawingThumb).join("")}
        ${photoPreview.map(renderPhotoThumb).join("")}
      </div>
    </section>
  `;
}

/** @param {Attachment} attachment */
function renderDrawingThumb(attachment) {
  return `
    <button class="model-reference-thumb" data-action="ws-zoom-image" data-image-src="${esc(attachment.blobUrl)}" data-image-alt="${esc(attachment.caption ?? attachment.filename)}">
      <img src="${esc(attachment.blobUrl)}" alt="${esc(attachment.caption ?? attachment.filename)}" />
      <span>도면</span>
    </button>
  `;
}

/** @param {PhotoItem} photo */
function renderPhotoThumb(photo) {
  return `
    <button class="model-reference-thumb" data-action="ws-zoom-image" data-image-src="${esc(photo.url)}" data-image-alt="${esc(photo.caption ?? "참고 사진")}">
      <img src="${esc(photo.url)}" alt="${esc(photo.caption ?? "참고 사진")}" />
      <span>사진</span>
    </button>
  `;
}

/** @param {string} label @param {string} value */
function renderStat(label, value) {
  return `<div class="model-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

/** @param {string} icon @param {string} label */
function renderPipelineItem(icon, label) {
  return `<div class="model-pipeline-item"><span>${icon}</span><strong>${esc(label)}</strong></div>`;
}

/**
 * @param {WorkspaceState} s
 * @param {Space} room
 * @param {boolean} active
 */
function renderRoomButton(s, room, active) {
  const area = safeArea(room);
  const lineItemCount = relatedLineItems(s, [room]).length;
  return `
    <button class="model-room-card ${active ? "active" : ""}" data-action="ws-select-space" data-id="${esc(room.id)}">
      <span><strong>${esc(room.name)}</strong><small>${area ? `${formatArea(area)}㎡ · ${formatArea(sqmToPyeong(area))}평` : "면적 미입력"}</small></span>
      <em>${lineItemCount}</em>
    </button>
  `;
}

/**
 * @param {WorkspaceState} s
 * @param {Space[]} rooms
 * @param {Space|null} selected
 */
function modelPhotos(s, rooms, selected) {
  const sources = selected && isWholeHomeSpaceId(selected.id)
    ? [selected, ...rooms]
    : rooms;
  return uniquePhotos(sources.flatMap((room) => getPhotosForSpace(s, room.id)));
}

/**
 * @param {WorkspaceState} s
 * @param {Space[]} rooms
 * @param {Attachment[]} floorplans
 * @param {PhotoItem[]} photos
 */
function modelSummary(s, rooms, floorplans, photos) {
  const areaSqm = rooms.reduce((sum, room) => sum + safeArea(room), 0);
  const lineItemCount = relatedLineItems(s, rooms).length;
  const checks = [
    { label: "공간", ready: rooms.length > 0 },
    { label: "면적", ready: areaSqm > 0 },
    { label: "도면", ready: floorplans.length > 0 },
    { label: "사진", ready: photos.length > 0 },
    { label: "견적", ready: lineItemCount > 0 },
  ];
  return { areaSqm, checks, floorplanCount: floorplans.length, lineItemCount, photoCount: photos.length, roomCount: rooms.length };
}

/** @param {WorkspaceState} s @param {Space[]} rooms */
function relatedLineItems(s, rooms) {
  if (rooms.some((room) => room.id === WHOLE_HOME_SPACE_ID)) return s.bundle.lineItems;
  const roomIds = new Set(rooms.map((room) => room.id));
  return s.bundle.lineItems.filter((item) => item.spaceId && roomIds.has(item.spaceId));
}

/** @param {WorkspaceState} s @param {Space[]} rooms */
function surfaceSummary(s, rooms) {
  const items = relatedLineItems(s, rooms);
  return [
    { label: "바닥", count: countByKeyword(items, ["바닥", "마루", "장판", "타일"]) },
    { label: "벽체", count: countByKeyword(items, ["벽", "도배", "필름", "페인트"]) },
    { label: "창호", count: countByKeyword(items, ["창", "샷시", "문"]) },
    { label: "전기/조명", count: countByKeyword(items, ["전기", "조명", "콘센트"]) },
  ];
}

/** @param {LineItem[]} items @param {string[]} keywords */
function countByKeyword(items, keywords) {
  return items.filter((item) => keywords.some((keyword) => item.label.includes(keyword))).length;
}

/** @param {Space} room */
function safeArea(room) {
  return typeof room.areaSqm === "number" && Number.isFinite(room.areaSqm) ? room.areaSqm : 0;
}

/** @param {WorkspaceState} s */
function floorplanAttachments(s) {
  return (s.bundle.attachments ?? []).filter((attachment) =>
    attachment.kind === "drawing" || attachment.photoKind === "floorplan" || attachment.photoKind === "naver_floorplan");
}
