// 견적 / 업체 모달.
// 사진 모달은 workspace-modals-photo.js 로 분리.

import { esc } from "../dom.js";
import { api } from "../api.js";
import { showToast } from "./toast.js";
import { confirmModal } from "./modal.js";
import {
  QUOTE_STATUS,
  QUOTE_STATUS_LABEL,
  metaString,
  setOptionalMeta,
  nullable,
} from "./workspace-format.js";
import {
  currentLineItems,
  selectedItemForQuote,
} from "./workspace-selectors.js";
import { openEntityModal } from "./workspace-modal-helper.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */

// ===== 견적 =====

/** @param {WorkspaceState} s @param {boolean} isEdit @param {() => Promise<void>} reload */
export function openQuoteModal(s, isEdit, reload) {
  const quote = isEdit && s.selectedQuoteId ? s.bundle.quotes.find((q) => q.id === s.selectedQuoteId) ?? null : null;
  if (isEdit && !quote) return;
  const defaultLineItemId = quote?.lineItemId ?? s.selectedLineItemId ?? currentLineItems(s)[0]?.id ?? "";
  const defaultVendorId = quote?.vendorId ?? s.bundle.vendors[0]?.id ?? "";
  const meta = quote?.meta ?? {};
  openEntityModal({
    title: isEdit ? "견적 수정" : "견적 추가",
    size: "wide",
    fields: `
      <div class="row">
        <label><span>위치/항목 *</span><select name="lineItemId" ${isEdit ? "disabled" : ""}>${currentLineItems(s).map((li) => `<option value="${esc(li.id)}" ${li.id === defaultLineItemId ? "selected" : ""}>${esc(li.label)}</option>`).join("")}</select></label>
        <label><span>업체 *</span><select name="vendorId">${s.bundle.vendors.map((v) => `<option value="${esc(v.id)}" ${v.id === defaultVendorId ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label>
      </div>
      <div class="row">
        <label><span>견적가 *</span><input name="price" type="number" min="0" step="1" required value="${esc(quote?.price ?? "")}" /></label>
        <label><span>상태</span><select name="status">${QUOTE_STATUS.map((status) => `<option value="${esc(status)}" ${status === (quote?.status ?? "candidate") ? "selected" : ""}>${esc(QUOTE_STATUS_LABEL[status])}</option>`).join("")}</select></label>
      </div>
      <div class="row">
        <label><span>브랜드</span><input name="brand" value="${esc(metaString(meta, ["brand", "manufacturer", "maker"]))}" /></label>
        <label><span>품명</span><input name="productName" value="${esc(metaString(meta, ["productName", "product", "model", "material", "type", "paintType"]))}" /></label>
      </div>
      <div class="row">
        <label><span>색상</span><input name="color" value="${esc(metaString(meta, ["color"]))}" /></label>
        <label><span>사양</span><input name="size" value="${esc(metaString(meta, ["size", "glazing", "scope"]))}" /></label>
      </div>
      <label><span>기타</span><input name="other" value="${esc(metaString(meta, ["other"]))}" /></label>
      <label><span>메모</span><textarea name="memo" rows="3">${esc(quote?.memo ?? "")}</textarea></label>
    `,
    submitText: isEdit ? "수정" : "추가",
    onSubmit: async (fd) => {
      const lineItemId = String(fd.get("lineItemId") || defaultLineItemId);
      const vendorId = String(fd.get("vendorId") ?? "");
      const price = Number(fd.get("price") ?? NaN);
      if (!lineItemId) return "위치/항목을 선택해주세요.";
      if (!vendorId) return "업체를 선택해주세요.";
      if (!Number.isInteger(price) || price < 0) return "견적가는 0 이상의 정수로 입력해주세요.";
      const rawStatus = String(fd.get("status") ?? "candidate");
      const allowed = /** @type {string[]} */ (QUOTE_STATUS);
      const status = /** @type {import("../api.js").QuoteStatus} */ (
        allowed.includes(rawStatus) ? rawStatus : "candidate"
      );
      const nextMeta = { ...(quote?.meta ?? {}) };
      for (const key of ["brand", "productName", "color", "size", "other"]) setOptionalMeta(nextMeta, key, String(fd.get(key) ?? ""));
      const payload = {
        vendorId,
        price,
        status,
        meta: nextMeta,
        memo: nullable(fd.get("memo")),
      };
      const result = isEdit && quote ? await api.quotes.update(quote.id, payload) : await api.quotes.create(lineItemId, { ...payload, mode: s.mode });
      if (!result.ok) return result.error;
      await reload();
      return undefined;
    },
  });
}

/** @param {WorkspaceState} s @param {() => Promise<void>} reload */
export async function deleteSelectedQuote(s, reload) {
  if (!s.selectedQuoteId) return;
  if (!(await confirmModal("견적을 삭제할까요?"))) return;
  const result = await api.quotes.remove(s.selectedQuoteId);
  if (!result.ok) return showToast(result.error, { kind: "error" });
  showToast("견적이 삭제되었습니다.", { kind: "success" });
  await reload();
}

/** @param {WorkspaceState} s @param {() => Promise<void>} reload */
export async function adoptSelectedQuote(s, reload) {
  const quote = s.selectedQuoteId ? s.bundle.quotes.find((q) => q.id === s.selectedQuoteId) : null;
  if (!quote) return;
  const item = selectedItemForQuote(s, quote);
  const result = item?.selectedQuoteId === quote.id
    ? await api.lineItems.update(item.id, { selectedQuoteId: null })
    : await api.quotes.select(quote.id);
  if (!result.ok) return showToast(result.error, { kind: "error" });
  showToast(item?.selectedQuoteId === quote.id ? "채택을 해제했습니다." : "견적이 채택되었습니다.", { kind: "success" });
  await reload();
}

// ===== 업체 =====

/** @param {WorkspaceState} s @param {() => void} render @param {() => Promise<void>} reload */
export function openVendorModal(s, render, reload) {
  const onlineVendor = s.bundle.vendors.find((vendor) => vendor.name.trim() === "온라인") ?? null;
  const vendorOptions = [
    ...s.bundle.vendors.map((vendor) => ({ vendor, syntheticOnline: false })),
    ...(onlineVendor ? [] : [{ vendor: null, syntheticOnline: true }]),
  ];
  openEntityModal({
    title: "비교 업체 추가",
    size: "wide",
    fields: `
      <p class="form-help">업체 정보에 등록된 업체를 선택해 견적 비교표에 추가합니다.</p>
      <label>
        <span>업체명 *</span>
        <select name="vendorId" required>
          <option value="">업체를 선택하세요</option>
          ${vendorOptions.map((option) => {
            const value = option.syntheticOnline ? "__online__" : option.vendor?.id ?? "";
            const name = option.syntheticOnline ? "온라인" : option.vendor?.name ?? "";
            const specialty = option.syntheticOnline ? "온라인 견적" : option.vendor?.specialty ?? "";
            return `<option value="${esc(value)}">${esc([name, specialty].filter(Boolean).join(" · "))}</option>`;
          }).join("")}
        </select>
      </label>
    `,
    submitText: "선택",
    onSubmit: async (fd) => {
      const vendorId = String(fd.get("vendorId") ?? "");
      if (!vendorId) return "추가할 업체를 선택해주세요.";
      if (vendorId === "__online__") {
        const result = await api.vendors.create({
          name: "온라인",
          specialty: "온라인 견적",
          memo: "온라인 구매처/검색 견적",
        });
        if (!result.ok) return result.error;
        s.comparisonVendorIds.add(result.data.id);
        if (s.vendorFilter.size > 0) s.vendorFilter.add(result.data.id);
        await reload();
        return undefined;
      }
      s.comparisonVendorIds.add(vendorId);
      if (s.vendorFilter.size > 0) s.vendorFilter.add(vendorId);
      render();
      return undefined;
    },
  });
}
