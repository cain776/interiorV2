// 공간 관리 화면 우측 패널.

import { esc } from "../dom.js";
import { iLayoutGrid, iPencil, iPlus } from "./icons.js";
import { formatArea, sqmToPyeong } from "./workspace-format.js";
import {
  currentLineItems,
  selectedLineItem,
  visibleConsiderations,
  currentSpace,
  isWholeHomeSpaceId,
  getPhotosForLineItem,
  getPhotosForSpace,
} from "./workspace-selectors.js";
import { renderSpacePhotosPanel, uniquePhotos } from "./workspace-views-photos.js";
import { lookupSpaceDimension } from "./workspace-space-dimensions.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */

/** @param {WorkspaceState} s */
export function renderSpaceManagementPane(s) {
  const space = currentSpace(s);
  const lineItems = currentLineItems(s);
  const considerations = visibleConsiderations(s);
  const checked = considerations.filter((item) => item.checked).length;
  const selectedItem = selectedLineItem(s);
  const photoScope = s.spacePhotoScope === "lineItem" && selectedItem ? "lineItem" : "space";
  const photos = photoScope === "lineItem" && selectedItem
    ? uniquePhotos(getPhotosForLineItem(s, selectedItem.id))
    : space
      ? uniquePhotos(getPhotosForSpace(s, space.id))
      : [];
  const spaceIsWhole = isWholeHomeSpaceId(space?.id);
  return `
    <aside class="quote-pane-v1 space-detail-pane">
      <section class="mini-panel space-size-panel">
        <header class="quote-pane-head">
          <span class="head-icon success">${iLayoutGrid({ size: 12 })}</span>
          <h2>공간 사이즈</h2>
          <span class="quote-context">· ${esc(space?.name ?? "공간")}</span>
          <span class="badge">${lineItems.length} 항목</span>
          <span class="badge">고려 ${checked}/${considerations.length}</span>
          <div class="quote-actions">
            <button class="icon-btn" data-action="ws-open-space" data-mode="edit" ${space && !spaceIsWhole ? "" : "disabled"} title="공간 수정">${iPencil({ size: 14 })}</button>
            <button class="icon-btn" data-action="ws-open-line-item" data-mode="add" ${space ? "" : "disabled"} title="항목 추가">${iPlus({ size: 14 })}</button>
          </div>
        </header>
        <div class="space-size-body">
          ${renderSpaceSizeSummary(s, space, lineItems.length, photos.length)}
        </div>
      </section>
      ${renderSpacePhotosPanel(s, photos, photoScope)}
    </aside>
  `;
}

/** @param {WorkspaceState} s @param {import("../api.js").Space|null} space @param {number} itemCount @param {number} photoCount */
function renderSpaceSizeSummary(s, space, itemCount, photoCount) {
  if (!space) return `<div class="empty-dashed grow">선택된 공간이 없습니다.</div>`;
  const sqm = typeof space.areaSqm === "number" && Number.isFinite(space.areaSqm) ? space.areaSqm : null;
  const py = sqm === null ? null : sqmToPyeong(sqm);
  const dimension = lookupSpaceDimension(s.bundle.project.name, space.name);
  return `
    <div class="space-size-grid">
      <div class="space-size-card primary">
        <span>공간</span>
        <strong>${esc(space.name)}</strong>
      </div>
      <div class="space-size-card">
        <span>면적</span>
        <strong>${sqm === null ? "미입력" : `${formatArea(sqm)}㎡`}</strong>
      </div>
      <div class="space-size-card">
        <span>평수</span>
        <strong>${py === null ? "-" : `${formatArea(py)}평`}</strong>
      </div>
      <div class="space-size-card">
        <span>도면 치수</span>
        <strong>${esc(dimension ?? "-")}</strong>
      </div>
      <div class="space-size-card">
        <span>연결 항목</span>
        <strong>${itemCount}개</strong>
      </div>
      <div class="space-size-card">
        <span>사진</span>
        <strong>${photoCount}장</strong>
      </div>
    </div>
  `;
}
