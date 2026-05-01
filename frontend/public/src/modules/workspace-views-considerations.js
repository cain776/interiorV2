// 메인 패널 - 고려사항 영역.

import { esc } from "../dom.js";
import { iClipboardList, iArrowUp, iArrowDown, iPlus, iPencil, iTrash } from "./icons.js";
import { visibleConsiderations, considerationPhaseTags } from "./workspace-selectors.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {import("../api.js").Consideration} Consideration */

const CONSIDERATION_PRIORITY_LABEL = {
  normal: "일반",
  important: "중요",
  critical: "긴급",
};

/** @param {WorkspaceState} s */
export function renderConsiderationsPanel(s) {
  const considerations = visibleConsiderations(s);
  const checked = considerations.filter((c) => c.checked).length;
  const phaseTags = considerationPhaseTags(s);
  const selectedId = s.selectedConsiderationId;
  const selectedIndex = selectedId
    ? considerations.findIndex((c) => c.id === selectedId)
    : -1;
  const hasSelection = selectedIndex >= 0;
  return `
    <section class="mini-panel considerations-panel">
      <div class="panel-head">
        <div class="panel-title"><span class="head-icon brand">${iClipboardList({ size: 12 })}</span> 고려사항 <span class="mini-count brand">${checked}/${considerations.length}</span></div>
      </div>
      <div class="panel-scroll">
        ${
          considerations.length === 0
            ? `<p class="empty-dashed">표시할 고려사항이 없습니다.</p>`
            : `<ul class="consideration-list">
                ${considerations.map((item) => renderConsiderationRow(s, item, phaseTags.get(item.id) ?? null, selectedId)).join("")}
              </ul>`
        }
      </div>
      <div class="panel-toolbar five">
        <button class="icon-btn" data-action="ws-move-consideration" data-direction="up" ${selectedIndex <= 0 ? "disabled" : ""} title="위로">${iArrowUp({ size: 14 })}</button>
        <button class="icon-btn" data-action="ws-move-consideration" data-direction="down" ${selectedIndex < 0 || selectedIndex >= considerations.length - 1 ? "disabled" : ""} title="아래로">${iArrowDown({ size: 14 })}</button>
        <button class="icon-btn" data-action="ws-open-consideration" data-mode="add" title="고려사항 추가">${iPlus({ size: 14 })}</button>
        <button class="icon-btn" data-action="ws-open-consideration" data-mode="edit" ${hasSelection ? "" : "disabled"} title="고려사항 수정">${iPencil({ size: 14 })}</button>
        <button class="icon-btn danger" data-action="ws-delete-consideration" ${hasSelection ? "" : "disabled"} title="고려사항 삭제">${iTrash({ size: 14 })}</button>
      </div>
    </section>
  `;
}

/** @param {WorkspaceState} s @param {Consideration} item @param {string|null} phaseName @param {string|null} selectedId */
function renderConsiderationRow(s, item, phaseName, selectedId) {
  const meta = considerationMeta(s, item, phaseName);
  return `
    <li class="${item.id === selectedId ? "selected" : ""}">
      <input type="checkbox" data-action="ws-toggle-consideration" data-id="${esc(item.id)}" ${item.checked ? "checked" : ""} aria-label="${esc(item.label)}" />
      <button class="consideration-row" data-action="ws-select-consideration" data-id="${esc(item.id)}">
        <span class="consideration-text">
          <span class="consideration-line">
            ${meta ? `<span class="consideration-meta">${meta}</span>` : ""}
            <span class="consideration-label ${item.checked ? "done" : ""}">${esc(item.label)}</span>
            ${item.source === "custom" ? `<em>사용자 추가</em>` : ""}
          </span>
          ${item.note ? `<small title="${esc(item.note)}">${esc(item.note)}</small>` : ""}
        </span>
      </button>
    </li>
  `;
}

/** @param {WorkspaceState} s @param {Consideration} item @param {string|null} phaseName */
function considerationMeta(s, item, phaseName) {
  const lineItem = item.lineItemId ? s.bundle.lineItems.find((li) => li.id === item.lineItemId) ?? null : null;
  const spaceId = item.spaceId ?? lineItem?.spaceId ?? null;
  const space = spaceId ? s.bundle.spaces.find((sp) => sp.id === spaceId)?.name ?? null : null;
  const priority = item.priority && item.priority !== "normal" ? CONSIDERATION_PRIORITY_LABEL[item.priority] : null;
  return [
    phaseName ? `<b>${esc(phaseName)}</b>` : "",
    space ? `<b class="space">${esc(space)}</b>` : "",
    lineItem ? `<b class="item">${esc(lineItem.label)}</b>` : "",
    priority ? `<em class="priority">${esc(priority)}</em>` : "",
  ].filter(Boolean).join("");
}
