// 공통 entity 모달 헬퍼. 입력 검증과 폼 제출 → onSubmit 콜백.

import { $, esc } from "../dom.js";
import { openModal, closeModal } from "./modal.js";

/**
 * @param {{ title: string, fields: string, submitText: string, size?: "wide" | "compact", onSubmit: (fd: FormData) => Promise<string|undefined> }} config
 */
export function openEntityModal(config) {
  const sizeClass = config.size === "wide" ? "wide-form" : config.size === "compact" ? "compact-form" : "";
  openModal(`
    <h3>${esc(config.title)}</h3>
    <form id="entity-form" class="form ${sizeClass}">
      ${config.fields}
      <p class="error" id="entity-error" hidden></p>
      <div class="form-actions"><button type="button" data-action="modal-close" class="ghost">취소</button><button type="submit" class="primary">${esc(config.submitText)}</button></div>
    </form>
  `);
  const form = /** @type {HTMLFormElement} */ ($("#entity-form"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = await config.onSubmit(new FormData(form));
    if (error) {
      const errEl = $("#entity-error");
      errEl.textContent = error;
      errEl.removeAttribute("hidden");
      return;
    }
    closeModal();
  });
}
