import { $ } from "../dom.js";

const TOAST_VISIBLE_MS = 2400;
const TOAST_LEAVE_MS = 250;

/**
 * @param {string} message
 * @param {{ kind?: "info"|"error"|"success" }} [opts]
 */
export function showToast(message, opts = {}) {
  const kind = opts.kind ?? "info";
  const root = $("#toast-root");
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  // 에러 토스트는 스크린 리더에 즉시 알림. 일반 토스트는 polite (toast-root 가 aria-live="polite").
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-leaving");
    setTimeout(() => el.remove(), TOAST_LEAVE_MS);
  }, TOAST_VISIBLE_MS);
}
