// 단일 모달. data-action="modal-close" 또는 ESC로 닫힘.
// 모든 호출자가 h3 안에 일반 텍스트만 넣는다고 가정 — innerHTML 재주입 대신 textContent 로 좁힘.
// 모달 열릴 때 첫 focusable 으로 포커스 이동, 닫힐 때 트리거 element 로 복귀, Tab/Shift+Tab focus trap.

import { $ } from "../dom.js";
import { iClipboardList, iX } from "./icons.js";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let isOpen = false;
/** @type {(() => void) | null} */
let closeCallback = null;
/** @type {HTMLElement | null} */
let lastTrigger = null;

/**
 * @param {string} innerHtml
 * @param {{ onClose?: () => void, iconHtml?: string }} [opts]
 */
export function openModal(innerHtml, opts = {}) {
  const root = $("#modal-root");
  const card = $("#modal-card");
  card.innerHTML = innerHtml;
  const title = card.querySelector("h3");
  if (title instanceof HTMLHeadingElement) {
    if (!title.id) title.id = "modal-title";
    decorateTitle(title, opts.iconHtml ?? iClipboardList({ size: 14 }));
  }
  // 트리거(보통 클릭한 버튼)를 기억해뒀다가 닫힐 때 포커스 복귀.
  lastTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  root.removeAttribute("hidden");
  isOpen = true;
  closeCallback = opts.onClose ?? null;

  // 첫 focusable 로 포커스 이동. h3 의 닫기 버튼이 첫 focusable 이라 폼 input 으로 우회.
  const firstField = card.querySelector(
    "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])",
  );
  if (firstField instanceof HTMLElement) {
    firstField.focus();
  } else {
    const firstFocusable = card.querySelector(FOCUSABLE_SELECTOR);
    if (firstFocusable instanceof HTMLElement) firstFocusable.focus();
  }
}

/**
 * @param {HTMLHeadingElement} title
 * @param {string} iconHtml
 */
function decorateTitle(title, iconHtml) {
  const titleText = title.textContent ?? "";
  title.textContent = "";

  const main = document.createElement("span");
  main.className = "modal-title-main";

  const iconWrap = document.createElement("span");
  iconWrap.className = "modal-title-icon";
  iconWrap.setAttribute("aria-hidden", "true");
  iconWrap.innerHTML = iconHtml;

  const textWrap = document.createElement("span");
  textWrap.className = "modal-title-text";
  textWrap.textContent = titleText;

  main.append(iconWrap, textWrap);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "modal-close-btn";
  closeButton.dataset.action = "modal-close";
  closeButton.setAttribute("aria-label", "닫기");
  closeButton.innerHTML = iX({ size: 16 });

  title.append(main, closeButton);
}

export function closeModal() {
  if (!isOpen) return;
  const root = $("#modal-root");
  root.setAttribute("hidden", "");
  isOpen = false;
  if (closeCallback) closeCallback();
  closeCallback = null;
  // 트리거 element 가 아직 DOM 에 있으면 거기로 포커스 복귀 (a11y / 키보드 네비).
  if (lastTrigger && document.contains(lastTrigger)) {
    lastTrigger.focus();
  }
  lastTrigger = null;
}

export function isModalOpen() {
  return isOpen;
}

/**
 * Promise 기반 confirm 모달. native confirm() 대체 — modal-root 의 a11y / 키보드 / 토스트 시스템과
 * 일관성 유지. 사용:
 *   if (!(await confirmModal("정말 삭제하시겠어요?"))) return;
 *
 * @param {string} message
 * @param {{ confirmText?: string, cancelText?: string, danger?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export function confirmModal(message, opts = {}) {
  const confirmText = opts.confirmText ?? "확인";
  const cancelText = opts.cancelText ?? "취소";
  const danger = opts.danger ?? true;
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (/** @type {boolean} */ result) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };
    const escAttr = (/** @type {string} */ s) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    openModal(
      `
        <h3>확인</h3>
        <p class="confirm-message">${escAttr(message)}</p>
        <div class="form-actions">
          <button type="button" id="confirm-cancel" class="ghost">${escAttr(cancelText)}</button>
          <button type="button" id="confirm-ok" class="${danger ? "danger" : "primary"}">${escAttr(confirmText)}</button>
        </div>
      `,
      {
        onClose: () => finish(false),
      },
    );
    const cancelBtn = $("#confirm-cancel");
    const okBtn = $("#confirm-ok");
    cancelBtn.addEventListener("click", () => {
      finish(false);
      closeModal();
    });
    okBtn.addEventListener("click", () => {
      finish(true);
      closeModal();
    });
    if (okBtn instanceof HTMLElement) okBtn.focus();
  });
}

document.addEventListener("keydown", (e) => {
  if (!isOpen) return;
  if (e.key === "Escape") {
    closeModal();
    return;
  }
  if (e.key !== "Tab") return;

  // Focus trap: Tab/Shift+Tab 이 모달 안에서만 순환.
  const card = $("#modal-card");
  const focusables = /** @type {HTMLElement[]} */ (
    Array.from(card.querySelectorAll(FOCUSABLE_SELECTOR))
  ).filter((el) => !el.hasAttribute("hidden"));
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !card.contains(active))) {
    last.focus();
    e.preventDefault();
  } else if (!e.shiftKey && active === last) {
    first.focus();
    e.preventDefault();
  }
});
