// 워크스페이스 진입점.
// - 상태 초기화 + reload + click 위임 처리.
// - render = renderShell(state) → root.innerHTML.
// - 화면 / 모달 / selectors / format 은 형제 모듈로 분리되어 있다.

import { esc } from "../dom.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { showToast } from "./toast.js";
import { renderShell } from "./workspace-views.js";
import {
  buildModelPayload,
  buildSketchUpBridgeCommand,
  buildSketchUpRubyScript,
} from "./workspace-model-export.js";
import {
  currentLineItems,
  visibleConsiderations,
  WHOLE_HOME_SPACE_ID,
  isWholeHomeSpaceId,
  comparisonVendors,
  visibleQuotes,
} from "./workspace-selectors.js";
import {
  openConsiderationModal,
  updateConsideration,
  moveConsideration,
  deleteConsideration,
  openPhaseModal,
  deleteSelectedPhase,
  openSpaceModal,
  deleteSelectedSpace,
  moveSidebar,
  openLineItemModal,
  deleteSelectedLineItem,
  moveLineItem,
  openQuoteModal,
  deleteSelectedQuote,
  adoptSelectedQuote,
  openVendorModal,
  openPhotoModal,
  openPhotoEditModal,
  movePhoto,
  deletePhoto,
  openReviewMaterialsModal,
} from "./workspace-modals.js";
import { bindWorkspaceDrag, shouldSuppressWorkspaceDragClick } from "./workspace-drag.js";
import { openModal } from "./modal.js";

/** @typedef {import("../api.js").WorkspaceBundle} WorkspaceBundle */
/** @typedef {import("../api.js").Consideration} Consideration */
/** @typedef {"phases"|"spaces"} WorkspaceTab */
/** @typedef {"quotes"|"spaces"|"models"} WorkspaceView */
/** @typedef {"space"|"lineItem"} SpacePhotoScope */
/** @typedef {"isometric"|"top"|"front"} ModelCamera */
/** @typedef {"mass"|"walls"} ModelDetail */
/** @typedef {"turnkey"|"self"} Mode */

/**
 * @typedef WorkspaceState
 * @property {WorkspaceBundle} bundle
 * @property {WorkspaceView} view
 * @property {WorkspaceTab} tab
 * @property {Mode} mode
 * @property {string|null} selectedPhaseId
 * @property {string|null} selectedSpaceId
 * @property {string|null} selectedLineItemId
 * @property {string|null} selectedQuoteId
 * @property {string|null} selectedConsiderationId
 * @property {string|null} selectedPhotoId
 * @property {SpacePhotoScope} spacePhotoScope
 * @property {ModelCamera} modelCamera
 * @property {ModelDetail} modelDetail
 * @property {boolean} modelShowReferences
 * @property {Set<string>} vendorFilter
 * @property {Set<string>} comparisonVendorIds
 * @property {Set<string>} hiddenVendorIds
 * @property {boolean} menuOpen
 * @property {Record<string, Consideration[]>} customConsiderationsByContext
 */

/**
 * @param {HTMLElement} root
 * @param {string} projectId
 * @param {{ view?: WorkspaceView, openReviewMaterials?: boolean }} [options]
 */
export async function renderWorkspacePage(root, projectId, options = {}) {
  root.innerHTML = `<p class="muted">워크스페이스 불러오는 중...</p>`;
  const result = await api.projects.workspace(projectId);
  if (!result.ok) {
    root.innerHTML = `<p class="error">${esc(result.error)}</p>`;
    return;
  }

  /** @type {WorkspaceState} */
  const state = {
    bundle: result.data,
    view: options.view ?? "quotes",
    tab: options.view === "spaces" || options.view === "models" ? "spaces" : "phases",
    mode: "turnkey",
    selectedPhaseId: result.data.phases[0]?.id ?? null,
    selectedSpaceId: options.view === "spaces" || options.view === "models" ? WHOLE_HOME_SPACE_ID : result.data.spaces[0]?.id ?? null,
    selectedLineItemId: null,
    selectedQuoteId: null,
    selectedConsiderationId: null,
    selectedPhotoId: null,
    spacePhotoScope: "space",
    modelCamera: "isometric",
    modelDetail: "walls",
    modelShowReferences: true,
    vendorFilter: new Set(),
    comparisonVendorIds: new Set(),
    hiddenVendorIds: new Set(),
    menuOpen: false,
    customConsiderationsByContext: {},
  };
  normalizeSelection(state);
  bindWorkspaceDrag(root, state, render);

  async function reloadBundle() {
    const next = await api.projects.workspace(projectId);
    if (!next.ok) {
      showToast(next.error, { kind: "error" });
      return;
    }
    state.bundle = next.data;
    normalizeSelection(state);
    render();
  }

  function render() {
    root.innerHTML = renderShell(state, getState().currentUser);
  }

  root.onclick = async (event) => {
    if (shouldSuppressWorkspaceDragClick(event)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest("[data-action]");
    if (!(trigger instanceof HTMLElement) || !root.contains(trigger)) return;
    await handleWorkspaceAction({ state, trigger, render, reloadBundle });
  };

  render();
  if (options.openReviewMaterials) {
    openReviewMaterialsModal(state, render);
  }
}

/**
 * @typedef ActionContext
 * @property {WorkspaceState} state
 * @property {HTMLElement} trigger
 * @property {() => void} render
 * @property {() => Promise<void>} reloadBundle
 */

/** @param {ActionContext} ctx */
async function handleWorkspaceAction(ctx) {
  const { state, trigger, render, reloadBundle } = ctx;
  const action = trigger.dataset.action;
  const id = trigger.dataset.id ?? null;

  // 순수 상태 변경 (렌더만 다시)
  if (handlePureStateAction(action, id, trigger, state, render)) return;

  // 비동기 / 모달 / 외부 통신
  await handleAsyncAction(action, id, trigger, state, render, reloadBundle);
}

/**
 * 동기 상태 변경 핸들러 dispatch 테이블.
 * 각 핸들러는 state 만 변경하고 render 는 호출자가. handler 가 false 를 반환하면 render 안 함.
 * @type {Record<string, (state: WorkspaceState, id: string|null, trigger: HTMLElement) => boolean>}
 */
const PURE_HANDLERS = {
  "ws-toggle-menu": (state) => {
    state.menuOpen = !state.menuOpen;
    return true;
  },
  "ws-mode": (state, _id, trigger) => {
    const mode = trigger.dataset.mode;
    if (mode !== "turnkey" && mode !== "self") return false;
    state.mode = mode;
    state.selectedQuoteId = null;
    state.vendorFilter.clear();
    state.hiddenVendorIds.clear();
    return true;
  },
  "ws-tab": (state, _id, trigger) => {
    if (state.view === "spaces") return false;
    const tab = trigger.dataset.tab;
    if (tab !== "phases" && tab !== "spaces") return false;
    state.tab = tab;
    state.selectedQuoteId = null;
    state.selectedPhotoId = null;
    normalizeSelection(state, true);
    return true;
  },
  "ws-select-phase": (state, id) => {
    if (!id) return false;
    state.selectedPhaseId = id;
    state.selectedPhotoId = null;
    normalizeSelection(state, true);
    return true;
  },
  "ws-select-space": (state, id) => {
    if (!id) return false;
    state.selectedSpaceId = id;
    state.spacePhotoScope = "space";
    state.selectedPhotoId = null;
    normalizeSelection(state, true);
    return true;
  },
  "ws-select-li": (state, id) => {
    if (!id) return false;
    state.selectedLineItemId = id;
    state.selectedQuoteId = preferredQuoteForLineItem(state, id)?.id ?? null;
    state.selectedPhotoId = null;
    if (state.view === "spaces") state.spacePhotoScope = "lineItem";
    return true;
  },
  "ws-photo-scope": (state, _id, trigger) => {
    const scope = trigger.dataset.scope;
    if (scope !== "space" && scope !== "lineItem") return false;
    state.spacePhotoScope = scope;
    if (scope === "space") state.selectedLineItemId = null;
    state.selectedPhotoId = null;
    return true;
  },
  "ws-select-quote-cell": (state, id) => {
    if (!id) return false;
    const quote = state.bundle.quotes.find((q) => q.id === id);
    if (quote) state.selectedLineItemId = quote.lineItemId;
    state.selectedQuoteId = id;
    return true;
  },
  "ws-toggle-vendor": (state, id) => {
    if (!id) return false;
    if (state.vendorFilter.has(id)) state.vendorFilter.delete(id);
    else state.vendorFilter.add(id);
    return true;
  },
  "ws-remove-vendor": (state, id) => {
    if (!id) return false;
    state.hiddenVendorIds.add(id);
    state.vendorFilter.delete(id);
    state.comparisonVendorIds.delete(id);
    if (state.selectedQuoteId) {
      const selectedQuote = state.bundle.quotes.find((quote) => quote.id === state.selectedQuoteId);
      if (selectedQuote?.vendorId === id) state.selectedQuoteId = null;
    }
    return true;
  },
  "ws-clear-vendors": (state) => {
    state.vendorFilter.clear();
    state.hiddenVendorIds.clear();
    return true;
  },
  "ws-select-consideration": (state, id) => {
    if (!id) return false;
    state.selectedConsiderationId = id;
    return true;
  },
  "ws-select-photo": (state, id) => {
    if (!id) return false;
    state.selectedPhotoId = state.selectedPhotoId === id ? null : id;
    return true;
  },
  "ws-model-camera": (state, _id, trigger) => {
    const camera = trigger.dataset.camera;
    if (camera !== "isometric" && camera !== "top" && camera !== "front") return false;
    state.modelCamera = camera;
    return true;
  },
  "ws-model-detail": (state, _id, trigger) => {
    const detail = trigger.dataset.detail;
    if (detail !== "mass" && detail !== "walls") return false;
    state.modelDetail = detail;
    return true;
  },
  "ws-model-toggle-references": (state) => {
    state.modelShowReferences = !state.modelShowReferences;
    return true;
  },
};

/**
 * 동기 상태 변경. 처리되면 true. PURE_HANDLERS 에 등록된 action 만 처리.
 * @param {string|undefined} action @param {string|null} id @param {HTMLElement} trigger
 * @param {WorkspaceState} state @param {() => void} render
 */
function handlePureStateAction(action, id, trigger, state, render) {
  if (!action) return false;
  const handler = PURE_HANDLERS[action];
  if (!handler) return false;
  // handler 가 false 를 반환하면 dispatch 는 잡았으나 상태 변경은 안 됨 → render 생략.
  if (handler(state, id, trigger)) render();
  return true;
}

/**
 * 모달/네트워크 동반 액션.
 * @param {string|undefined} action @param {string|null} id @param {HTMLElement} trigger
 * @param {WorkspaceState} state @param {() => void} render
 * @param {() => Promise<void>} reloadBundle
 */
async function handleAsyncAction(action, id, trigger, state, render, reloadBundle) {
  if (action === "ws-open-phase") return openPhaseModal(state, trigger.dataset.mode === "edit", reloadBundle);
  if (action === "ws-delete-phase") return deleteSelectedPhase(state, reloadBundle);
  if (action === "ws-move-sidebar") return moveSidebar(state, trigger.dataset.direction, render);
  if (action === "ws-open-space") return openSpaceModal(state, trigger.dataset.mode === "edit", reloadBundle);
  if (action === "ws-delete-space") return deleteSelectedSpace(state, reloadBundle);
  if (action === "ws-open-line-item") return openLineItemModal(state, trigger.dataset.mode === "edit", reloadBundle);
  if (action === "ws-delete-line-item") return deleteSelectedLineItem(state, reloadBundle);
  if (action === "ws-move-line-item") return moveLineItem(state, trigger.dataset.direction, render);
  if (action === "ws-open-consideration") {
    const isEdit = trigger.dataset.mode === "edit";
    const targetId = id ?? (isEdit ? state.selectedConsiderationId : null);
    return openConsiderationModal(state, targetId, render);
  }
  if (action === "ws-toggle-consideration" && id) {
    state.selectedConsiderationId = id;
    const checked = trigger instanceof HTMLInputElement ? trigger.checked : false;
    return updateConsideration(state, id, { checked }, render);
  }
  if (action === "ws-move-consideration") {
    const targetId = id ?? state.selectedConsiderationId;
    if (!targetId) return;
    return moveConsideration(state, targetId, trigger.dataset.direction, render);
  }
  if (action === "ws-delete-consideration") {
    const targetId = id ?? state.selectedConsiderationId;
    if (!targetId) return;
    return deleteConsideration(state, targetId, render);
  }
  if (action === "ws-open-quote") {
    const editExisting = trigger.dataset.mode === "edit" && Boolean(state.selectedQuoteId);
    return openQuoteModal(state, editExisting, reloadBundle);
  }
  if (action === "ws-delete-quote") return deleteSelectedQuote(state, reloadBundle);
  if (action === "ws-adopt-quote") return adoptSelectedQuote(state, reloadBundle);
  if (action === "ws-adopt-line-item" && id) return adoptLineItemQuote(state, id, render, reloadBundle);
  if (action === "ws-open-vendor") return openVendorModal(state, render, reloadBundle);
  if (action === "ws-open-review-materials") return openReviewMaterialsModal(state, render);
  if (action === "ws-open-model-payload") return openModelPayload(state);
  if (action === "ws-open-sketchup-ruby") return openSketchUpRuby(state);
  if (action === "ws-open-sketchup-bridge") return openSketchUpBridge(state);
  if (action === "ws-open-photo") return openPhotoModal(state, render);
  if (action === "ws-edit-photo" && id) return openPhotoEditModal(state, id, render);
  if (action === "ws-move-photo" && id) return movePhoto(state, id, trigger.dataset.direction, render);
  if (action === "ws-delete-photo" && id) return deletePhoto(state, id, render);
  if (action === "ws-zoom-image") {
    const src = trigger.dataset.imageSrc;
    if (src) openImageZoom(src, trigger.dataset.imageAlt ?? "");
    return;
  }
}

/** @param {WorkspaceState} state */
function openModelPayload(state) {
  const payload = buildModelPayload(state);
  openModal(`
    <h3>3D 생성 패키지</h3>
    <p class="muted">Blender/SketchUp MCP 연결 시 이 구조를 모델 생성 입력으로 넘깁니다.</p>
    <pre class="model-payload-preview">${esc(JSON.stringify(payload, null, 2))}</pre>
  `);
}

/** @param {WorkspaceState} state */
function openSketchUpRuby(state) {
  const script = buildSketchUpRubyScript(state);
  openModal(`
    <h3>SketchUp Ruby 스크립트</h3>
    <p class="muted">SketchUp Ruby Console 또는 향후 SketchUp MCP 브릿지에서 실행할 수 있는 초안입니다.</p>
    <pre class="model-payload-preview">${esc(script)}</pre>
  `);
}

/** @param {WorkspaceState} state */
function openSketchUpBridge(state) {
  const command = buildSketchUpBridgeCommand(state);
  openModal(`
    <h3>SketchUp 브릿지 명령</h3>
    <p class="muted">SketchUp에서 tools/sketchup/interior_v2_bridge.rb 를 먼저 로드한 뒤, 이 명령을 로컬 브릿지로 보냅니다.</p>
    <pre class="model-payload-preview">${esc(JSON.stringify(command, null, 2))}</pre>
  `);
}

/**
 * 위치/항목 카드의 채택 토글.
 * - 이미 채택된 견적이 있으면 해제.
 * - 견적이 정확히 1개면 자동 채택.
 * - 견적이 여러 개면 항목만 선택해 견적 패널에서 직접 고르도록 안내.
 * @param {WorkspaceState} state
 * @param {string} lineItemId
 * @param {() => void} render
 * @param {() => Promise<void>} reloadBundle
 */
async function adoptLineItemQuote(state, lineItemId, render, reloadBundle) {
  const li = state.bundle.lineItems.find((x) => x.id === lineItemId);
  if (!li) return;
  if (li.selectedQuoteId) {
    const result = await api.lineItems.update(lineItemId, { selectedQuoteId: null });
    if (!result.ok) return showToast(result.error, { kind: "error" });
    showToast("채택을 해제했습니다.", { kind: "success" });
    await reloadBundle();
    return;
  }
  const quotes = state.bundle.quotes.filter((q) => q.lineItemId === lineItemId);
  if (quotes.length === 0) {
    showToast("채택할 견적이 없습니다.", { kind: "error" });
    return;
  }
  if (quotes.length > 1) {
    state.selectedLineItemId = lineItemId;
    state.selectedQuoteId = null;
    render();
    showToast("여러 견적이 있습니다. 견적 패널에서 채택할 견적을 선택해 주세요.", { kind: "info" });
    return;
  }
  const result = await api.quotes.select(quotes[0].id);
  if (!result.ok) return showToast(result.error, { kind: "error" });
  showToast("견적이 채택되었습니다.", { kind: "success" });
  await reloadBundle();
}

/** @param {WorkspaceState} state @param {string} lineItemId */
function preferredQuoteForLineItem(state, lineItemId) {
  const item = state.bundle.lineItems.find((lineItem) => lineItem.id === lineItemId);
  const quotes = state.bundle.quotes.filter((quote) => quote.lineItemId === lineItemId && quote.mode === state.mode);
  return quotes.find((quote) => quote.id === item?.selectedQuoteId) ?? quotes[0] ?? null;
}

/**
 * 이미지 라이트박스. 평면도 / 사진 카드의 zoomable-image 버튼이 트리거.
 * @param {string} src
 * @param {string} alt
 */
function openImageZoom(src, alt) {
  openModal(`
    <h3>이미지 보기</h3>
    <div class="image-zoom-body">
      <img src="${esc(src)}" alt="${esc(alt)}" />
      ${alt ? `<figcaption>${esc(alt)}</figcaption>` : ""}
    </div>
  `);
}

/** @param {WorkspaceState} s @param {boolean} [resetLineItem] */
function normalizeSelection(s, resetLineItem = false) {
  if (!s.bundle.phases.some((p) => p.id === s.selectedPhaseId)) {
    s.selectedPhaseId = s.bundle.phases[0]?.id ?? null;
  }
  if (!s.bundle.spaces.some((sp) => sp.id === s.selectedSpaceId)) {
    s.selectedSpaceId = s.view === "spaces" || isWholeHomeSpaceId(s.selectedSpaceId)
      ? WHOLE_HOME_SPACE_ID
      : s.bundle.spaces[0]?.id ?? null;
  }
  const visibleItems = currentLineItems(s);
  const selectedVisible = visibleItems.some((li) => li.id === s.selectedLineItemId);
  if (s.view === "spaces") {
    if (resetLineItem || !selectedVisible) {
      s.selectedLineItemId = null;
      s.spacePhotoScope = "space";
    }
  } else if (resetLineItem || !selectedVisible) {
    s.selectedLineItemId = visibleItems[0]?.id ?? null;
  }
  if (s.spacePhotoScope === "lineItem" && !s.selectedLineItemId) {
    s.spacePhotoScope = "space";
  }
  pruneWorkspaceVendorState(s);
  const selectedQuote = s.selectedQuoteId
    ? s.bundle.quotes.find((q) => q.id === s.selectedQuoteId) ?? null
    : null;
  if (selectedQuote) {
    const visibleVendorIds = new Set(comparisonVendors(s, visibleQuotes(s)).map((vendor) => vendor.id));
    if (!visibleVendorIds.has(selectedQuote.vendorId)) s.selectedQuoteId = null;
  } else {
    s.selectedQuoteId = null;
  }
  const considerationIds = new Set(visibleConsiderations(s).map((c) => c.id));
  if (!s.selectedConsiderationId || !considerationIds.has(s.selectedConsiderationId)) {
    s.selectedConsiderationId = null;
  }
  const photoIds = new Set((s.bundle.attachments ?? [])
    .filter((attachment) => attachment.kind === "photo")
    .map((attachment) => attachment.id));
  if (s.selectedPhotoId && !photoIds.has(s.selectedPhotoId)) {
    s.selectedPhotoId = null;
  }
}

/** @param {WorkspaceState} s */
function pruneWorkspaceVendorState(s) {
  const vendorIds = new Set(s.bundle.vendors.map((vendor) => vendor.id));
  for (const id of [...s.vendorFilter]) {
    if (!vendorIds.has(id)) s.vendorFilter.delete(id);
  }
  for (const id of [...s.comparisonVendorIds]) {
    if (!vendorIds.has(id)) s.comparisonVendorIds.delete(id);
  }
  for (const id of [...s.hiddenVendorIds]) {
    if (!vendorIds.has(id)) s.hiddenVendorIds.delete(id);
  }
}
