// 견적 비교 매트릭스 패널.

import { esc } from "../dom.js";
import { iBuilding, iPencil, iTrash, iCheck, iPlus, iStar } from "./icons.js";
import {
  currentLineItems,
  visibleQuotes,
  selectedLineItem,
  currentContextLabel,
  vendorsForQuotes,
  vendorFilterIds,
  selectedItemForQuote,
} from "./workspace-selectors.js";
import { formatKrw, modeLabel, quoteField } from "./workspace-format.js";
import { renderPhotosPanel } from "./workspace-views-photos.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {import("../api.js").LineItem} LineItem */
/** @typedef {import("../api.js").Quote} Quote */
/** @typedef {import("../api.js").Vendor} Vendor */

const QUOTE_GRID_TEMPLATE = "170px 110px 190px 70px minmax(220px,1fr) 110px";
const VENDOR_COL_WIDTH = "170px";

/** @param {WorkspaceState} s */
export function renderQuotePane(s) {
  const lineItems = currentLineItems(s);
  const quotes = visibleQuotes(s);
  const selectedQuote = s.selectedQuoteId ? quotes.find((q) => q.id === s.selectedQuoteId) ?? null : null;
  const selectedItem = selectedLineItem(s);
  const selectedQuoteIsAdopted = Boolean(selectedQuote && selectedItemForQuote(s, selectedQuote)?.selectedQuoteId === selectedQuote.id);
  const activeVendors = comparisonVendors(s, quotes);
  const visibleVendorIds = vendorFilterIds(s, activeVendors);
  const visibleVendors = visibleVendorIds ? activeVendors.filter((v) => visibleVendorIds.has(v.id)) : activeVendors;
  return `
    <aside class="quote-pane-v1">
      <section class="mini-panel quote-compare-panel">
        <header class="quote-pane-head">
          <span class="head-icon brand">${iBuilding({ size: 12 })}</span>
          <h2>견적 비교</h2>
          <span class="quote-context">· ${esc(currentContextLabel(s))}</span>
          <span class="badge">${lineItems.length} 항목</span>
          <span class="badge">${quotes.length} 견적</span>
          <div class="quote-actions">
            <button class="icon-btn" data-action="ws-open-quote" data-mode="edit" ${selectedQuote || selectedItem ? "" : "disabled"} title="견적 수정">${iPencil({ size: 14 })}</button>
            <button class="icon-btn danger" data-action="ws-delete-quote" ${selectedQuote ? "" : "disabled"} title="견적 삭제">${iTrash({ size: 14 })}</button>
            <button class="icon-btn ${selectedQuoteIsAdopted ? "selected" : ""}" data-action="ws-adopt-quote" ${selectedQuote ? "" : "disabled"} title="${selectedQuoteIsAdopted ? "채택 해제" : "견적 채택"}">${iCheck({ size: 14 })}</button>
          </div>
          <span class="soft-badge ${s.mode === "turnkey" ? "brand" : "success"}">${modeLabel(s.mode)}</span>
          <button class="compact-primary" data-action="ws-open-vendor">${iPlus({ size: 12 })}<span>업체 추가</span></button>
        </header>
        ${renderVendorFilterBar(activeVendors, visibleVendorIds)}
        <div class="quote-compare-body">
          ${renderQuoteMatrix(s, lineItems, quotes, visibleVendors)}
        </div>
      </section>
      ${renderPhotosPanel(s)}
    </aside>
  `;
}

/** @param {Vendor[]} activeVendors @param {Set<string>|null} visibleVendorIds */
function renderVendorFilterBar(activeVendors, visibleVendorIds) {
  return `
    <div class="vendor-filter-bar">
      <span>업체</span>
      <button class="chip ${!visibleVendorIds ? "active" : ""}" data-action="ws-clear-vendors">전체</button>
      ${activeVendors
        .map((vendor) => {
          const active = !visibleVendorIds || visibleVendorIds.has(vendor.id);
          return `<button class="chip ${active ? "active soft" : ""}" data-action="ws-toggle-vendor" data-id="${esc(vendor.id)}" title="${esc(vendorInfoTitle(vendor))}">${esc(vendor.name)} <small>${esc(vendor.specialty ?? "")}</small>${vendor.rating ? ` ★${vendor.rating}` : ""}</button>`;
        })
        .join("")}
    </div>
  `;
}

/** @param {WorkspaceState} s @param {LineItem[]} lineItems @param {Quote[]} quotes @param {Vendor[]} vendors */
function renderQuoteMatrix(s, lineItems, quotes, vendors) {
  if (lineItems.length === 0) return `<div class="empty-dashed grow">비교할 항목이 없습니다.</div>`;
  if (vendors.length === 0) return `<div class="empty-dashed grow">아직 받은 견적이 없습니다. 업체를 추가하고 견적을 입력하세요.</div>`;

  const grid = `${QUOTE_GRID_TEMPLATE} ${vendors.map(() => VENDOR_COL_WIDTH).join(" ")}`;
  const quoteMatrix = new Map(quotes.map((q) => [`${q.lineItemId}__${q.vendorId}`, q]));
  const totals = computeVendorTotals(lineItems, vendors, quoteMatrix);

  return `
    <div class="quote-matrix" style="--quote-grid:${esc(grid)}">
      <div class="quote-matrix-inner">
        ${renderMatrixHeader(vendors)}
        ${lineItems.map((li) => renderMatrixRow(s, li, quotes, vendors, quoteMatrix)).join("")}
        ${renderMatrixFooter(vendors, totals)}
      </div>
    </div>
  `;
}

/**
 * @param {LineItem[]} lineItems @param {Vendor[]} vendors
 * @param {Map<string, Quote>} quoteMatrix
 */
function computeVendorTotals(lineItems, vendors, quoteMatrix) {
  /** @type {Map<string, number>} */
  const totals = new Map(vendors.map((v) => [v.id, 0]));
  for (const li of lineItems) {
    for (const vendor of vendors) {
      const q = quoteMatrix.get(`${li.id}__${vendor.id}`);
      if (q) totals.set(vendor.id, (totals.get(vendor.id) ?? 0) + q.price);
    }
  }
  return totals;
}

/** @param {Vendor[]} vendors */
function renderMatrixHeader(vendors) {
  return `
    <div class="quote-row quote-head">
      <span>위치/항목</span><span>브랜드/제조사</span><span>품명</span><span>색상</span><span>사양</span><span>기타</span>
      ${vendors.map((v) => renderVendorHeadCell(v)).join("")}
    </div>
  `;
}

/**
 * @param {WorkspaceState} s @param {LineItem} li @param {Quote[]} quotes
 * @param {Vendor[]} vendors @param {Map<string, Quote>} quoteMatrix
 */
function renderMatrixRow(s, li, quotes, vendors, quoteMatrix) {
  const itemQuotes = quotes.filter((q) => q.lineItemId === li.id);
  const canonical = itemQuotes.find((q) => q.id === li.selectedQuoteId) ?? itemQuotes[0];
  const adoptedMark = li.selectedQuoteId
    ? `<span class="adopted-marker" aria-label="채택됨">${iStar({ size: 11 })}</span>`
    : "";
  return `
    <div class="quote-row ${li.id === s.selectedLineItemId ? "active" : ""}" data-action="ws-select-li" data-id="${esc(li.id)}">
      <span class="item-cell">${adoptedMark}${esc(li.label)}</span>
      <span>${esc(quoteField(canonical, "brand"))}</span>
      <span>${esc(quoteField(canonical, "product"))}</span>
      <span>${esc(quoteField(canonical, "color"))}</span>
      <span>${esc(quoteField(canonical, "spec"))}</span>
      <span>${esc(quoteField(canonical, "other"))}</span>
      ${vendors.map((vendor) => renderPriceCell(s, li, vendor, quoteMatrix)).join("")}
    </div>
  `;
}

/**
 * @param {WorkspaceState} s @param {LineItem} li @param {Vendor} vendor
 * @param {Map<string, Quote>} quoteMatrix
 */
function renderPriceCell(s, li, vendor, quoteMatrix) {
  const q = quoteMatrix.get(`${li.id}__${vendor.id}`);
  const adopted = q ? li.selectedQuoteId === q.id : false;
  const selected = q ? s.selectedQuoteId === q.id : false;
  const cls = `num price-cell editable ${adopted ? "adopted" : ""} ${selected ? "selected" : ""}`.trim();
  return `
    <span class="${cls}">
      ${adopted ? "<b>채택</b> " : ""}
      ${q
        ? `<span class="quote-price-display" data-action="ws-select-quote-cell" data-id="${esc(q.id)}" title="견적 선택">${esc(formatKrw(q.price))}</span>`
        : `<span class="quote-price-empty">-</span>`}
    </span>
  `;
}

/** @param {Vendor[]} vendors @param {Map<string, number>} totals */
function renderMatrixFooter(vendors, totals) {
  return `
    <div class="quote-row quote-foot">
      <span class="total-label">합계 (전체)</span>
      ${vendors.map((v) => `<span class="num">${esc(formatKrw(totals.get(v.id) ?? 0))}</span>`).join("")}
    </div>
  `;
}

/** @param {Vendor} vendor */
function renderVendorHeadCell(vendor) {
  return `
    <span class="vendor-head-cell" title="${esc(vendorInfoTitle(vendor))}">
      <strong>가격</strong>
    </span>
  `;
}

/** @param {WorkspaceState} s @param {Quote[]} quotes @returns {Vendor[]} */
function comparisonVendors(s, quotes) {
  const selectedIds = s.comparisonVendorIds ?? new Set();
  const selected = s.bundle.vendors.filter((vendor) => selectedIds.has(vendor.id));
  const byId = new Map([...vendorsForQuotes(s, quotes), ...selected].map((vendor) => [vendor.id, vendor]));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** @param {Vendor} vendor */
function vendorInfoTitle(vendor) {
  return [
    `업체명: ${vendor.name}`,
    vendor.specialty ? `전문분야: ${vendor.specialty}` : null,
    vendor.ceo ? `대표: ${vendor.ceo}` : null,
    vendor.phone ? `전화: ${vendor.phone}` : null,
    vendor.email ? `이메일: ${vendor.email}` : null,
    vendor.rating != null ? `평점: ${"★".repeat(vendor.rating)}${"☆".repeat(5 - vendor.rating)}` : null,
  ].filter(Boolean).join(" / ");
}
