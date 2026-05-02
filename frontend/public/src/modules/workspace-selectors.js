// 워크스페이스 상태에서 화면에 보일 데이터 골라내기. 순수 함수.
// 모달 / 뷰가 모두 의존. 포매터(workspace-format) 상수만 가져온다.

import { pyeongToSqm } from "./workspace-format.js";

/** @typedef {import("../api.js").Phase} Phase */
/** @typedef {import("../api.js").Space} Space */
/** @typedef {import("../api.js").LineItem} LineItem */
/** @typedef {import("../api.js").Quote} Quote */
/** @typedef {import("../api.js").Vendor} Vendor */
/** @typedef {import("../api.js").Consideration} Consideration */
/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {{ type: "phase", phase: Phase, index: number } | { type: "custom", key: string, items: Consideration[], index: number }} ConsiderationOwner */

export const WHOLE_HOME_SPACE_ID = "__whole_home__";

/** @param {string|null|undefined} id */
export function isWholeHomeSpaceId(id) {
  return id === WHOLE_HOME_SPACE_ID;
}

/** @template {{ sortOrder: number }} T @param {T[]} items */
export function sortByOrder(items) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** @template T @param {T[]} items @param {number} index @param {"up"|"down"} direction */
export function moveInList(items, index, direction) {
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const current = next[index];
  next[index] = next[nextIndex];
  next[nextIndex] = current;
  return next;
}

/** @param {WorkspaceState} s */
export function currentLineItems(s) {
  const items = s.bundle.lineItems.filter((li) => {
    if (s.tab === "phases") return li.phaseId === s.selectedPhaseId;
    if (isWholeHomeSpaceId(s.selectedSpaceId)) return !li.spaceId;
    return li.spaceId === s.selectedSpaceId;
  });
  return sortByOrder(items);
}

/** @param {WorkspaceState} s */
export function visibleQuotes(s) {
  const ids = new Set(currentLineItems(s).map((li) => li.id));
  return s.bundle.quotes.filter((q) => ids.has(q.lineItemId) && q.mode === s.mode);
}

/** @param {WorkspaceState} s */
export function selectedLineItem(s) {
  return s.selectedLineItemId ? s.bundle.lineItems.find((li) => li.id === s.selectedLineItemId) ?? null : null;
}

/** @param {WorkspaceState} s @param {LineItem} item */
export function lineItemSkuParts(s, item) {
  const space = item.spaceId ? s.bundle.spaces.find((sp) => sp.id === item.spaceId)?.name ?? null : "전체";
  const phase = s.bundle.phases.find((p) => p.id === item.phaseId)?.name ?? null;
  return {
    space,
    phase,
    location: item.locationLabel ?? null,
    workItem: item.workItemLabel ?? null,
  };
}

/** @param {WorkspaceState} s @param {LineItem} item */
export function lineItemSkuLabel(s, item) {
  const parts = lineItemSkuParts(s, item);
  return [parts.space, parts.location, parts.workItem].filter(Boolean).join(" / ") || item.label;
}

/** @param {WorkspaceState} s @param {string} phaseId */
export function lineItemsByPhase(s, phaseId) {
  return sortByOrder(s.bundle.lineItems.filter((li) => li.phaseId === phaseId));
}

/** @param {WorkspaceState} s */
export function currentPhase(s) {
  return s.selectedPhaseId ? s.bundle.phases.find((p) => p.id === s.selectedPhaseId) ?? null : null;
}

/** @param {WorkspaceState} s */
export function currentSpace(s) {
  if (isWholeHomeSpaceId(s.selectedSpaceId)) return wholeHomeSpace(s);
  return s.selectedSpaceId ? s.bundle.spaces.find((sp) => sp.id === s.selectedSpaceId) ?? null : null;
}

/** @param {WorkspaceState} s */
export function currentContextLabel(s) {
  return s.tab === "phases" ? currentPhase(s)?.name ?? "공정" : currentSpace(s)?.name ?? "공간";
}

/** @param {WorkspaceState} s */
export function lineItemCounts(s) {
  /** @type {Map<string, number>} */ const totalByPhase = new Map();
  /** @type {Map<string, number>} */ const selectedByPhase = new Map();
  /** @type {Map<string, number>} */ const totalBySpace = new Map();
  /** @type {Map<string, number>} */ const selectedBySpace = new Map();
  for (const item of s.bundle.lineItems) {
    totalByPhase.set(item.phaseId, (totalByPhase.get(item.phaseId) ?? 0) + 1);
    if (item.selectedQuoteId) selectedByPhase.set(item.phaseId, (selectedByPhase.get(item.phaseId) ?? 0) + 1);
    if (item.spaceId) {
      totalBySpace.set(item.spaceId, (totalBySpace.get(item.spaceId) ?? 0) + 1);
      if (item.selectedQuoteId) selectedBySpace.set(item.spaceId, (selectedBySpace.get(item.spaceId) ?? 0) + 1);
    } else {
      totalBySpace.set(WHOLE_HOME_SPACE_ID, (totalBySpace.get(WHOLE_HOME_SPACE_ID) ?? 0) + 1);
      if (item.selectedQuoteId) selectedBySpace.set(WHOLE_HOME_SPACE_ID, (selectedBySpace.get(WHOLE_HOME_SPACE_ID) ?? 0) + 1);
    }
  }
  return { totalByPhase, selectedByPhase, totalBySpace, selectedBySpace };
}

/** @param {WorkspaceState} s */
export function considerationContextKey(s) {
  if (s.tab === "spaces" && isWholeHomeSpaceId(s.selectedSpaceId)) return `space:${WHOLE_HOME_SPACE_ID}`;
  return s.tab === "phases" ? `phase:${s.selectedPhaseId ?? "none"}` : `space:${s.selectedSpaceId ?? "none"}`;
}

/** @param {WorkspaceState} s */
export function visibleConsiderations(s) {
  const custom = s.customConsiderationsByContext[considerationContextKey(s)] ?? [];
  if (s.tab === "phases") return [...(currentPhase(s)?.considerations ?? []), ...custom];
  if (isWholeHomeSpaceId(s.selectedSpaceId)) return [...s.bundle.phases.flatMap((p) => p.considerations), ...custom];
  const items = currentLineItems(s);
  const phaseIds = new Set(items.map((li) => li.phaseId));
  const itemIds = new Set(items.map((li) => li.id));
  const phaseItems = s.bundle.phases
    .filter((p) => phaseIds.has(p.id))
    .flatMap((p) => p.considerations)
    .filter((item) => considerationMatchesSpace(item, s.selectedSpaceId, itemIds));
  return [...phaseItems, ...custom];
}

/**
 * @param {Consideration} item
 * @param {string|null} spaceId
 * @param {Set<string>} itemIds
 */
function considerationMatchesSpace(item, spaceId, itemIds) {
  if (item.lineItemId) return itemIds.has(item.lineItemId);
  if (item.spaceId) return item.spaceId === spaceId;
  return true;
}

/** @param {WorkspaceState} s */
export function considerationPhaseTags(s) {
  /** @type {Map<string, string>} */
  const tags = new Map();
  if (s.tab !== "spaces") return tags;
  if (isWholeHomeSpaceId(s.selectedSpaceId)) {
    for (const phase of s.bundle.phases) {
      for (const item of phase.considerations) tags.set(item.id, phase.name);
    }
    return tags;
  }
  const phaseIds = new Set(currentLineItems(s).map((li) => li.phaseId));
  for (const phase of s.bundle.phases) {
    if (!phaseIds.has(phase.id)) continue;
    for (const item of phase.considerations) tags.set(item.id, phase.name);
  }
  return tags;
}

/** @param {WorkspaceState} s @param {string} id @returns {ConsiderationOwner|null} */
export function findConsiderationOwner(s, id) {
  for (const phase of s.bundle.phases) {
    const index = phase.considerations.findIndex((item) => item.id === id);
    if (index >= 0) return { type: "phase", phase, index };
  }
  const key = considerationContextKey(s);
  const custom = s.customConsiderationsByContext[key] ?? [];
  const index = custom.findIndex((item) => item.id === id);
  return index >= 0 ? { type: "custom", key, items: custom, index } : null;
}

/** @param {WorkspaceState} s @param {Quote[]} quotes */
export function vendorsForQuotes(s, quotes) {
  const vendorMap = new Map(s.bundle.vendors.map((v) => [v.id, v]));
  const seen = new Set();
  /** @type {Vendor[]} */
  const result = [];
  for (const quote of quotes) {
    if (seen.has(quote.vendorId)) continue;
    const vendor = vendorMap.get(quote.vendorId);
    if (!vendor) continue;
    seen.add(quote.vendorId);
    result.push(vendor);
  }
  return result;
}

/** @param {WorkspaceState} s @param {Quote[]} quotes @returns {Vendor[]} */
export function comparisonVendors(s, quotes) {
  const selectedIds = s.comparisonVendorIds ?? new Set();
  const hiddenIds = s.hiddenVendorIds ?? new Set();
  const selected = s.bundle.vendors.filter((vendor) => selectedIds.has(vendor.id));
  const byId = new Map([...vendorsForQuotes(s, quotes), ...selected].map((vendor) => [vendor.id, vendor]));
  return [...byId.values()]
    .filter((vendor) => !hiddenIds.has(vendor.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko"));
}

/** @param {WorkspaceState} s @param {Vendor[]} vendors */
export function vendorFilterIds(s, vendors) {
  const allowed = new Set(vendors.map((v) => v.id));
  const selected = [...s.vendorFilter].filter((id) => allowed.has(id));
  if (selected.length === 0 || selected.length === allowed.size) return null;
  return new Set(selected);
}

/** @param {WorkspaceState} s @param {Quote} quote */
export function selectedItemForQuote(s, quote) {
  return s.bundle.lineItems.find((item) => item.id === quote.lineItemId) ?? null;
}

/**
 * 특정 line item 의 사진 목록을 attachments 에서 추출. 단일 source-of-truth.
 * @param {WorkspaceState} s @param {string} lineItemId
 * @returns {import("./workspace-format.js").PhotoItem[]}
 */
export function getPhotosForLineItem(s, lineItemId) {
  /** @type {import("./workspace-format.js").PhotoItem[]} */
  const result = [];
  for (const attachment of s.bundle.attachments ?? []) {
    if (attachment.ownerType !== "lineItem" || attachment.kind !== "photo") continue;
    if (attachment.ownerId !== lineItemId) continue;
    result.push({
      id: attachment.id,
      url: attachment.blobUrl,
      kind: attachment.photoKind ?? "reference",
      caption: attachment.caption,
      takenAt: attachment.takenAt,
      linkUrl: attachment.linkUrl,
      sortOrder: attachment.sortOrder,
    });
  }
  return sortPhotos(result);
}

/**
 * 선택 공간 자체에 연결된 사진만 가져온다.
 * 위치/항목 사진은 "선택 항목" 범위에서만 보여준다.
 * @param {WorkspaceState} s
 * @param {string} spaceId
 * @returns {import("./workspace-format.js").PhotoItem[]}
 */
export function getPhotosForSpace(s, spaceId) {
  const attachments = s.bundle.attachments ?? [];
  if (isWholeHomeSpaceId(spaceId)) {
    return sortPhotos(
      attachments
        .filter((attachment) =>
          attachment.kind === "photo" &&
          (
            (attachment.ownerType === "project" && attachment.ownerId === s.bundle.project.id) ||
            (attachment.ownerType === "space" && attachment.ownerId === WHOLE_HOME_SPACE_ID)
          ))
        .map(photoItemFromAttachment),
    );
  }
  return sortPhotos(
    attachments
      .filter((attachment) =>
        attachment.kind === "photo" &&
        attachment.ownerType === "space" &&
        attachment.ownerId === spaceId)
      .map(photoItemFromAttachment),
  );
}

/** @param {import("../api.js").Attachment} attachment */
function photoItemFromAttachment(attachment) {
  return {
    id: attachment.id,
    url: attachment.blobUrl,
    kind: attachment.photoKind ?? "reference",
    caption: attachment.caption,
    takenAt: attachment.takenAt,
    linkUrl: attachment.linkUrl,
    sortOrder: attachment.sortOrder,
  };
}

/** @param {import("./workspace-format.js").PhotoItem[]} photos */
function sortPhotos(photos) {
  return [...photos].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** @param {WorkspaceState} s @returns {Space} */
function wholeHomeSpace(s) {
  const sizeKr = s.bundle.project.sizeKr;
  const areaSqm = typeof sizeKr === "number" ? Number(pyeongToSqm(sizeKr).toFixed(2)) : null;
  return {
    id: WHOLE_HOME_SPACE_ID,
    projectId: s.bundle.project.id,
    name: "전체",
    areaSqm,
    sortOrder: -1,
    createdAt: s.bundle.project.createdAt,
    updatedAt: s.bundle.project.updatedAt,
  };
}
