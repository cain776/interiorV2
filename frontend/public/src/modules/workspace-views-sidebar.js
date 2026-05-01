// 좌측 timeline 사이드바 (공정 / 공간) 렌더.

import { esc } from "../dom.js";
import { iLayoutGrid, iLayers, iArrowUp, iArrowDown, iPlus, iPencil, iTrash } from "./icons.js";
import { formatArea, pyeongToSqm } from "./workspace-format.js";
import {
  lineItemCounts,
  WHOLE_HOME_SPACE_ID,
  isWholeHomeSpaceId,
} from "./workspace-selectors.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */

/** @param {WorkspaceState} s */
export function renderSidebar(s) {
  const counts = lineItemCounts(s);
  const items = s.tab === "phases" ? s.bundle.phases : sidebarSpaces(s);
  const selectedId = s.tab === "phases" ? s.selectedPhaseId : s.selectedSpaceId;
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const selectedIsWhole = s.tab === "spaces" && isWholeHomeSpaceId(selectedId);
  return `
    <aside class="ws-sidebar-v1">
      ${
        s.view === "spaces"
          ? `<div class="ws-sidebar-title">${iLayoutGrid({ size: 13 })}<span>공간 패널</span></div>`
          : `<div class="ws-tabbar" role="tablist">
              <button class="${s.tab === "phases" ? "active" : ""}" data-action="ws-tab" data-tab="phases">${iLayers({ size: 13 })}<span>공정</span></button>
              <button class="${s.tab === "spaces" ? "active" : ""}" data-action="ws-tab" data-tab="spaces">${iLayoutGrid({ size: 13 })}<span>공간</span></button>
            </div>`
      }
      <nav class="timeline-list">
        <span class="timeline-line" aria-hidden="true"></span>
        ${items.map((item) => renderTimelineItem(s, counts, item, selectedId)).join("")}
      </nav>
      <div class="panel-toolbar five">
        <button class="icon-btn" data-action="ws-move-sidebar" data-direction="up" ${selectedIsWhole || selectedIndex <= 0 ? "disabled" : ""} title="위로">${iArrowUp({ size: 14 })}</button>
        <button class="icon-btn" data-action="ws-move-sidebar" data-direction="down" ${selectedIsWhole || selectedIndex < 0 || selectedIndex >= items.length - 1 ? "disabled" : ""} title="아래로">${iArrowDown({ size: 14 })}</button>
        <button class="icon-btn" data-action="${s.tab === "phases" ? "ws-open-phase" : "ws-open-space"}" data-mode="add" title="추가">${iPlus({ size: 14 })}</button>
        <button class="icon-btn" data-action="${s.tab === "phases" ? "ws-open-phase" : "ws-open-space"}" data-mode="edit" ${selectedId && !selectedIsWhole ? "" : "disabled"} title="수정">${iPencil({ size: 14 })}</button>
        <button class="icon-btn danger" data-action="${s.tab === "phases" ? "ws-delete-phase" : "ws-delete-space"}" ${selectedId && !selectedIsWhole ? "" : "disabled"} title="삭제">${iTrash({ size: 14 })}</button>
      </div>
    </aside>
  `;
}

/**
 * @param {WorkspaceState} s
 * @param {ReturnType<typeof lineItemCounts>} counts
 * @param {{ id: string, name: string, areaSqm?: number|null }} item
 * @param {string|null} selectedId
 */
function renderTimelineItem(s, counts, item, selectedId) {
  const total = s.tab === "phases" ? counts.totalByPhase.get(item.id) ?? 0 : counts.totalBySpace.get(item.id) ?? 0;
  const selected = s.tab === "phases" ? counts.selectedByPhase.get(item.id) ?? 0 : counts.selectedBySpace.get(item.id) ?? 0;
  const progress = total > 0 ? Math.round((selected / total) * 100) : 0;
  const active = item.id === selectedId;
  const label = "areaSqm" in item && item.areaSqm ? `${item.name} ${formatArea(item.areaSqm)}㎡` : item.name;
  return `
    <button class="timeline-item ${active ? "active" : ""}" data-action="${s.tab === "phases" ? "ws-select-phase" : "ws-select-space"}" data-id="${esc(item.id)}">
      <span class="timeline-dot"></span>
      <span class="timeline-content">
        <span class="timeline-name">${esc(label)}</span>
        ${total > 0 ? `<span class="timeline-count">${selected}/${total}</span>` : ""}
        ${total > 0 ? `<span class="timeline-progress"><span style="width:${progress}%"></span></span>` : ""}
      </span>
    </button>
  `;
}

/** @param {WorkspaceState} s */
function sidebarSpaces(s) {
  const projectSize = s.bundle.project.sizeKr;
  const areaSqm = typeof projectSize === "number" ? Number(pyeongToSqm(projectSize).toFixed(2)) : null;
  return [
    {
      id: WHOLE_HOME_SPACE_ID,
      projectId: s.bundle.project.id,
      name: "전체",
      areaSqm,
      sortOrder: -1,
      createdAt: s.bundle.project.createdAt,
      updatedAt: s.bundle.project.updatedAt,
    },
    ...s.bundle.spaces,
  ];
}
