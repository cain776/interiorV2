// 메인 패널 - 위치/항목 영역.

import { esc } from "../dom.js";
import { iMapPin, iArrowUp, iArrowDown, iPlus, iPencil, iTrash, iStar } from "./icons.js";
import {
  currentLineItems,
  selectedLineItem,
  lineItemsByPhase,
  currentSpace,
  lineItemSkuLabel,
  lineItemSkuParts,
  getPhotosForSpace,
} from "./workspace-selectors.js";
import { uniquePhotos } from "./workspace-views-photos.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {import("../api.js").LineItem} LineItem */

/** @param {WorkspaceState} s */
export function renderLineItemsPanel(s) {
  const items = currentLineItems(s);
  const selectedCount = items.filter((li) => li.selectedQuoteId).length;
  const selectedItem = selectedLineItem(s);
  const siblings = selectedItem ? lineItemsByPhase(s, selectedItem.phaseId) : [];
  const selectedIndex = siblings.findIndex((li) => li.id === selectedItem?.id);
  const space = s.tab === "spaces" ? currentSpace(s) : null;
  const spacePhotos = space ? uniquePhotos(getPhotosForSpace(s, space.id)) : [];
  const spaceBannerActive = s.spacePhotoScope !== "lineItem" || !selectedItem;
  return `
    <section class="mini-panel line-items-panel">
      <div class="panel-head">
        <div class="panel-title"><span class="head-icon success">${iMapPin({ size: 12 })}</span> 위치 / 항목 <span class="mini-count success">${selectedCount}/${items.length}</span></div>
      </div>
      <div class="panel-scroll">
        ${space ? renderSpaceBanner(space, spacePhotos.length, spaceBannerActive) : ""}
        ${
          items.length === 0
            ? `<p class="empty-dashed">${s.tab === "phases" ? "아직 항목이 없습니다." : "이 공간에 분류된 항목이 없습니다."}</p>`
            : `<div class="line-card-list">
                ${items.map((item) => renderLineCard(s, item)).join("")}
              </div>`
        }
      </div>
      <div class="panel-toolbar five">
        <button class="icon-btn" data-action="ws-move-line-item" data-direction="up" ${selectedIndex <= 0 ? "disabled" : ""} title="위로">${iArrowUp({ size: 14 })}</button>
        <button class="icon-btn" data-action="ws-move-line-item" data-direction="down" ${selectedIndex < 0 || selectedIndex >= siblings.length - 1 ? "disabled" : ""} title="아래로">${iArrowDown({ size: 14 })}</button>
        <button class="icon-btn" data-action="ws-open-line-item" data-mode="add" title="항목 추가">${iPlus({ size: 14 })}</button>
        <button class="icon-btn" data-action="ws-open-line-item" data-mode="edit" ${selectedItem ? "" : "disabled"} title="항목 수정">${iPencil({ size: 14 })}</button>
        <button class="icon-btn danger" data-action="ws-delete-line-item" ${selectedItem ? "" : "disabled"} title="항목 삭제">${iTrash({ size: 14 })}</button>
      </div>
    </section>
  `;
}

/** @param {import("../api.js").Space} space @param {number} photoCount @param {boolean} active */
function renderSpaceBanner(space, photoCount, active) {
  return `
    <button
      type="button"
      class="line-space-banner ${active ? "active" : ""}"
      data-action="ws-photo-scope"
      data-scope="space"
      title="${esc(space.name)} 공간 사진 보기">
      <span class="line-space-name">${esc(space.name)}</span>
      <span class="line-space-meta">공간 사진 ${photoCount}</span>
    </button>
  `;
}

/** @param {WorkspaceState} s @param {LineItem} item */
function renderLineCard(s, item) {
  const quotes = s.bundle.quotes.filter((q) => q.lineItemId === item.id);
  const adopted = quotes.some((q) => q.id === item.selectedQuoteId);
  const sku = lineItemSkuParts(s, item);
  const skuTitle = lineItemSkuLabel(s, item);
  // 채택 토글 가능 조건:
  //   - 이미 채택된 견적 있으면 항상 가능 (해제용)
  //   - 아니면 견적이 정확히 1개일 때만 자동 채택
  //   - 견적 0개거나 2개 이상이면 disabled (견적 패널에서 직접 선택)
  const adoptCanToggle = adopted || quotes.length === 1;
  const adoptTitle = adopted
    ? "채택 해제"
    : quotes.length === 0
    ? "견적이 없어 채택할 수 없습니다."
    : quotes.length === 1
    ? "이 견적을 채택"
    : "여러 견적 중 하나를 견적 패널에서 선택해 주세요.";
  return `
    <div class="line-card ${item.id === s.selectedLineItemId ? "active" : ""}" data-drop-kind="line-item" data-id="${esc(item.id)}">
      <button type="button" class="drag-handle line-drag-handle" draggable="true" data-drag-kind="line-item" data-id="${esc(item.id)}" title="드래그해서 순서 변경" aria-label="${esc(item.label)} 순서 변경">⋮⋮</button>
      <button class="line-card-main" data-action="ws-select-li" data-id="${esc(item.id)}" title="${esc([skuTitle, item.memo].filter(Boolean).join(" · "))}">
        <span class="line-label">${esc(item.label)}</span>
        <span class="line-sku">
          ${sku.location ? `<b>${esc(sku.location)}</b>` : ""}
          ${sku.workItem ? `<b>${esc(sku.workItem)}</b>` : ""}
          ${sku.phase ? `<em>${esc(sku.phase)}</em>` : ""}
        </span>
        <span class="quote-count">${quotes.length}견적</span>
      </button>
      <button
        class="line-adopt-toggle ${adopted ? "is-adopted" : "is-undecided"}"
        data-action="ws-adopt-line-item"
        data-id="${esc(item.id)}"
        title="${esc(adoptTitle)}"
        ${adoptCanToggle ? "" : "disabled"}>
        ${adopted ? `${iStar({ size: 10 })} 채택` : "미정"}
      </button>
    </div>
  `;
}
