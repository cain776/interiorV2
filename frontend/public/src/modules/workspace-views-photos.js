// 사진 패널 (견적 사이드 + 공간 관리 사이드).

import { esc } from "../dom.js";
import {
  iCamera, iImage, iArrowUp, iArrowDown, iPencil, iTrash, iPlus, iCheck, iExternalLink,
} from "./icons.js";
import { PHOTO_KIND_LABEL } from "./workspace-format.js";
import {
  selectedLineItem,
  currentSpace,
  lineItemSkuLabel,
  getPhotosForLineItem,
} from "./workspace-selectors.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {import("./workspace-format.js").PhotoItem} PhotoItem */

/** @param {WorkspaceState} s */
export function renderPhotosPanel(s) {
  const item = selectedLineItem(s);
  const photos = item ? getPhotosForLineItem(s, item.id) : [];
  const emptySlots = Math.max(item ? 0 : 4, 4 - photos.length);
  const selectedPhotoId = visibleSelectedPhotoId(photos, s.selectedPhotoId);
  return `
    <section class="mini-panel photos-panel">
      <div class="panel-head">
        <div class="panel-title"><span class="head-icon warning">${iCamera({ size: 12 })}</span> 사진 / 첨부 ${item ? `<span class="photo-context">· ${esc(item.label)}</span>` : ""} <span class="mini-count">사진 ${photos.length}</span></div>
        ${renderPhotoPanelActions(photos, selectedPhotoId, item ? "" : "disabled")}
      </div>
      <div class="photo-grid">
        ${photos.map((photo) => renderPhotoCard(photo, selectedPhotoId)).join("")}
        ${Array.from({ length: emptySlots }).map(() => `<div class="photo-slot">${iImage({ size: 20 })}</div>`).join("")}
      </div>
    </section>
  `;
}

/**
 * @param {WorkspaceState} s
 * @param {PhotoItem[]} photos
 * @param {"space"|"lineItem"} photoScope
 */
export function renderSpacePhotosPanel(s, photos, photoScope) {
  const space = currentSpace(s);
  const item = selectedLineItem(s);
  const shownPhotos = photos;
  const emptySlots = photoScope === "space" ? 0 : Math.max(0, 9 - shownPhotos.length);
  const itemLabel = item ? lineItemSkuLabel(s, item) : "위치/항목";
  const selectedPhotoId = visibleSelectedPhotoId(shownPhotos, s.selectedPhotoId);
  return `
    <section class="mini-panel photos-panel space-photos-panel">
      <div class="panel-head">
        <div class="panel-title"><span class="head-icon warning">${iCamera({ size: 12 })}</span> 사진 ${space ? `<span class="photo-context">· ${esc(photoScope === "lineItem" ? itemLabel : space.name)}</span>` : ""} <span class="mini-count">사진 ${shownPhotos.length}</span></div>
        <div class="photo-scope-tabs" role="tablist" aria-label="사진 보기 범위">
          <button class="${photoScope === "space" ? "active" : ""}" data-action="ws-photo-scope" data-scope="space">전체</button>
          <button class="${photoScope === "lineItem" ? "active" : ""}" data-action="ws-photo-scope" data-scope="lineItem" ${item ? "" : "disabled"}>선택 항목</button>
        </div>
        ${renderPhotoPanelActions(
          shownPhotos,
          selectedPhotoId,
          photoScope === "space" ? (space ? "" : "disabled") : (item ? "" : "disabled"),
          photoScope === "space"
            ? `${space?.name ?? "공간"}에 업로드`
            : item
              ? `${item.label}에 업로드`
              : "항목을 먼저 선택하세요",
        )}
      </div>
      <div class="photo-grid space-photo-grid${shownPhotos.length > 9 ? " has-extra-photos" : ""}">
        ${shownPhotos.map((photo) => renderPhotoCard(photo, selectedPhotoId)).join("")}
        ${Array.from({ length: emptySlots }).map(() => `<div class="photo-slot photo-slot-empty" aria-hidden="true"></div>`).join("")}
      </div>
    </section>
  `;
}

/** @param {PhotoItem[]} photos @param {string|null} selectedPhotoId */
function visibleSelectedPhotoId(photos, selectedPhotoId) {
  return photos.some((photo) => photo.id === selectedPhotoId) ? selectedPhotoId : null;
}

/**
 * @param {PhotoItem[]} photos
 * @param {string|null} selectedPhotoId
 * @param {string} uploadDisabled
 * @param {string} [uploadTitle]
 */
function renderPhotoPanelActions(photos, selectedPhotoId, uploadDisabled, uploadTitle = "사진 업로드") {
  const selectedIndex = selectedPhotoId ? photos.findIndex((photo) => photo.id === selectedPhotoId) : -1;
  const selected = selectedIndex >= 0 ? photos[selectedIndex] : null;
  const selectedAttr = selected ? `data-id="${esc(selected.id)}"` : "";
  const hasSelection = Boolean(selected);
  return `
    <div class="photo-panel-actions">
      <div class="photo-toolbar" aria-label="선택 사진 작업">
        <button class="icon-btn photo-action-btn" data-action="ws-move-photo" data-direction="prev" ${selectedAttr} ${hasSelection && selectedIndex > 0 ? "" : "disabled"} title="위로 이동">${iArrowUp({ size: 13 })}</button>
        <button class="icon-btn photo-action-btn" data-action="ws-move-photo" data-direction="next" ${selectedAttr} ${hasSelection && selectedIndex < photos.length - 1 ? "" : "disabled"} title="아래로 이동">${iArrowDown({ size: 13 })}</button>
        <button class="icon-btn photo-action-btn" data-action="ws-edit-photo" ${selectedAttr} ${hasSelection ? "" : "disabled"} title="사진 정보 수정">${iPencil({ size: 13 })}</button>
        <button class="icon-btn photo-action-btn danger" data-action="ws-delete-photo" ${selectedAttr} ${hasSelection ? "" : "disabled"} title="삭제">${iTrash({ size: 13 })}</button>
      </div>
      <button class="compact-btn" data-action="ws-open-photo" ${uploadDisabled} title="${esc(uploadTitle)}">${iPlus({ size: 12 })}<span>업로드</span></button>
    </div>
  `;
}

/** @param {PhotoItem} photo @param {string|null} selectedPhotoId */
function renderPhotoCard(photo, selectedPhotoId) {
  const selected = photo.id === selectedPhotoId;
  const alt = photo.caption ?? PHOTO_KIND_LABEL[photo.kind];
  return `
    <figure class="photo-card${selected ? " is-selected" : ""}" aria-selected="${selected ? "true" : "false"}">
      <button type="button" class="zoomable-image" data-action="ws-zoom-image" data-image-src="${esc(photo.url)}" data-image-alt="${esc(alt)}" title="확대해서 보기">
        <img src="${esc(photo.url)}" alt="${esc(alt)}" />
      </button>
      <span>${esc(PHOTO_KIND_LABEL[photo.kind])}</span>
      <button type="button" class="photo-select-control${selected ? " is-selected" : ""}" data-action="ws-select-photo" data-id="${esc(photo.id)}" aria-pressed="${selected ? "true" : "false"}" aria-label="${selected ? "사진 선택 해제" : "사진 선택"}" title="${selected ? "선택 해제" : "사진 선택"}">${selected ? iCheck({ size: 13, strokeWidth: 3 }) : ""}</button>
      ${photo.caption ? `<figcaption>${esc(photo.caption)}${photo.takenAt ? `<small>${esc(photo.takenAt)}</small>` : ""}</figcaption>` : ""}
      ${photo.linkUrl ? `<a class="icon-btn xs photo-link" href="${esc(photo.linkUrl)}" target="_blank" rel="noopener noreferrer" title="링크 열기">${iExternalLink({ size: 12 })}</a>` : ""}
    </figure>
  `;
}

/** @param {PhotoItem[]} photos */
export function uniquePhotos(photos) {
  const seen = new Set();
  return photos.filter((photo) => {
    const key = photo.id || photo.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
