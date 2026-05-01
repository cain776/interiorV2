// 순수 포매터/유틸. 상태에 의존하지 않는다.

/** @typedef {"before"|"during"|"after"|"reference"|"defect"|"floorplan"|"naver_floorplan"|"fixture"} PhotoKind */
/** @typedef {"turnkey"|"self"} Mode */

/** @type {import("../api.js").QuoteStatus[]} */
export const QUOTE_STATUS = ["candidate", "negotiating", "contracted", "cancelled"];

/** @type {Record<import("../api.js").QuoteStatus, string>} */
export const QUOTE_STATUS_LABEL = {
  candidate: "후보",
  negotiating: "협상중",
  contracted: "계약",
  cancelled: "취소",
};

export const PHOTO_KIND_LABEL = {
  before: "시공 전",
  during: "시공 중",
  after: "시공 후",
  reference: "참고",
  defect: "하자",
  floorplan: "평면도",
  naver_floorplan: "네이버평면도",
  fixture: "가구/집기",
};

// 1평 = 3.3058㎡ (한국 표준 환산. 실제 3.3057851239 의 반올림 값)
export const SQM_PER_PYEONG = 3.3058;

/** @param {number} sqm @returns {number} ㎡ → 평 */
export function sqmToPyeong(sqm) {
  return sqm / SQM_PER_PYEONG;
}

/** @param {number} pyeong @returns {number} 평 → ㎡ */
export function pyeongToSqm(pyeong) {
  return pyeong * SQM_PER_PYEONG;
}

/** @param {number} value */
export function formatArea(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

/** @param {number} amount */
export function formatKrw(amount) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** @param {Mode} mode */
export function modeLabel(mode) {
  return mode === "turnkey" ? "턴키" : "반셀프";
}

/** @param {FormDataEntryValue|null} value */
export function nullable(value) {
  if (value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/** @param {FormDataEntryValue|null} value */
export function nullableNumber(value) {
  const text = nullable(value);
  if (text === null) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

/** @param {FormDataEntryValue|null} value */
export function nullableInt(value) {
  const num = nullableNumber(value);
  return num === null ? null : Math.round(num);
}

/** @param {string} prefix */
export function newId(prefix) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${random}`;
}

/** @param {File} file */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽을 수 없습니다."));
    reader.readAsDataURL(file);
  });
}

/** @param {unknown} value */
function formatMetaValue(value) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "포함" : "별도";
  if (typeof value === "number") return value.toLocaleString("ko-KR");
  return String(value);
}

/** @param {Record<string, unknown>|undefined} meta @param {string[]} keys */
export function firstMetaValue(meta, keys) {
  if (!meta) return "—";
  for (const key of keys) {
    const value = meta[key];
    if (value !== undefined && value !== null && value !== "") return formatMetaValue(value);
  }
  return "—";
}

/** @param {Record<string, unknown>|undefined} meta @param {string} key @param {string} label @param {string} [unit] */
export function labeledMeta(meta, key, label, unit = "") {
  if (!meta) return null;
  const value = meta[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return `${label} ${value ? "포함" : "별도"}`;
  return `${label} ${formatMetaValue(value)}${unit}`;
}

/** @param {Array<string|null>} parts */
export function joinMeta(parts) {
  const value = parts.filter(Boolean).join(" · ");
  return value || "—";
}

/** @param {Record<string, unknown>} meta @param {string[]} keys */
export function metaString(meta, keys) {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return "";
}

/** @param {Record<string, unknown>} meta @param {string} key @param {string} value */
export function setOptionalMeta(meta, key, value) {
  const trimmed = value.trim();
  if (trimmed) meta[key] = trimmed;
  else delete meta[key];
}

/**
 * 견적 매트릭스 셀에 표시할 필드를 집계.
 * @param {import("../api.js").Quote|undefined} quote @param {string} field
 */
export function quoteField(quote, field) {
  const meta = quote?.meta;
  if (field === "brand") return firstMetaValue(meta, ["brand", "manufacturer", "maker"]);
  if (field === "product") return firstMetaValue(meta, ["productName", "product", "model", "material", "type", "paintType"]);
  if (field === "color") return firstMetaValue(meta, ["color"]);
  if (field === "spec") return joinMeta([
    firstMetaValue(meta, ["size"]) !== "—" ? firstMetaValue(meta, ["size"]) : null,
    firstMetaValue(meta, ["glazing", "scope"]) !== "—" ? firstMetaValue(meta, ["glazing", "scope"]) : null,
    labeledMeta(meta, "area", "면적", "㎡"),
  ]);
  if (field === "other") return joinMeta([
    firstMetaValue(meta, ["other"]) !== "—" ? firstMetaValue(meta, ["other"]) : null,
    labeledMeta(meta, "hasScreen", "망"),
    labeledMeta(meta, "wasteQty", "폐기물"),
    labeledMeta(meta, "includesAircon", "에어컨"),
    labeledMeta(meta, "includesCeiling", "천장"),
    labeledMeta(meta, "lengthM", "길이", "m"),
    labeledMeta(meta, "coats", "도장"),
  ]);
  return "—";
}

/** @typedef {{ id: string, url: string, kind: PhotoKind, caption: string|null, takenAt: string|null, linkUrl: string|null, sortOrder: number }} PhotoItem */
