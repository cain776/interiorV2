// 사진 업로드 / 수정 / 정렬 / 삭제 모달.
// workspace-modals-quote.js 가 500줄을 넘어서 포토 파트를 분리.

import { $, esc } from "../dom.js";
import { api } from "../api.js";
import { openModal, closeModal } from "./modal.js";
import { showToast } from "./toast.js";
import { iCamera, iX, iUpload } from "./icons.js";
import {
  PHOTO_KIND_LABEL,
  nullable,
  fileToDataUrl,
} from "./workspace-format.js";
import {
  currentSpace,
  getPhotosForLineItem,
  getPhotosForSpace,
  lineItemSkuLabel,
  isWholeHomeSpaceId,
  selectedLineItem,
} from "./workspace-selectors.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {"before"|"during"|"after"|"reference"|"defect"|"floorplan"|"naver_floorplan"|"fixture"} PhotoKind */

// 백엔드 blobUrl 5MB 제한을 넘기기 전에 차단. base64 오버헤드 감안 시 원본 약 3.7MB.
const MAX_PHOTO_FILE_BYTES = 3_700_000;

const DEFAULT_PHOTO_KIND = /** @type {PhotoKind} */ ("reference");

/** @param {number} bytes */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * @typedef PhotoUploadTarget
 * @property {import("../api.js").AttachmentOwnerType} ownerType
 * @property {string} ownerId
 * @property {string} label
 */

/** @param {WorkspaceState} s @returns {PhotoUploadTarget|null} */
function resolvePhotoUploadTarget(s) {
  const item = selectedLineItem(s);
  const space = currentSpace(s);
  const uploadToSpace = s.view === "spaces" && s.spacePhotoScope === "space";
  if (uploadToSpace && space) {
    return {
      ownerType: /** @type {import("../api.js").AttachmentOwnerType} */ (
        isWholeHomeSpaceId(space.id) ? "project" : "space"
      ),
      ownerId: isWholeHomeSpaceId(space.id) ? s.bundle.project.id : space.id,
      label: space.name,
    };
  }
  if (item) {
    return {
      ownerType: /** @type {import("../api.js").AttachmentOwnerType} */ ("lineItem"),
      ownerId: item.id,
      label: lineItemSkuLabel(s, item),
    };
  }
  return null;
}

/** @param {PhotoUploadTarget} target */
function buildPhotoUploadFormHtml(target) {
  const chips = Object.entries(PHOTO_KIND_LABEL).map(([value, label]) => `
    <label class="photo-kind-chip${value === DEFAULT_PHOTO_KIND ? " is-selected" : ""}">
      <input type="radio" name="kind" value="${esc(value)}" ${value === DEFAULT_PHOTO_KIND ? "checked" : ""} />
      <span>${esc(label)}</span>
    </label>
  `).join("");
  return `
    <h3>사진 업로드</h3>
    <form id="photo-form" class="form photo-upload-form">
      <p class="form-help">연결 대상: ${esc(target.label)}</p>
      <div class="photo-dropzone" id="photo-dropzone" tabindex="0">
        <input id="photo-file-input" name="file" type="file" accept="image/*" multiple required class="photo-file-input" />
        <label for="photo-file-input" class="photo-dropzone-empty" id="photo-dropzone-empty">
          <span class="photo-dropzone-icon">${iCamera({ size: 26 })}</span>
          <strong>사진을 드래그하거나 클릭해서 선택</strong>
          <small>JPG, PNG · 최대 3.7MB</small>
        </label>
        <div class="photo-dropzone-preview" id="photo-dropzone-preview" hidden>
          <img id="photo-preview-img" alt="미리보기" />
          <div class="photo-dropzone-meta">
            <strong id="photo-preview-name"></strong>
            <small id="photo-preview-size"></small>
          </div>
          <button type="button" class="photo-dropzone-clear" id="photo-clear-btn" aria-label="다시 선택">${iX({ size: 14 })}</button>
        </div>
      </div>
      <div class="photo-form-field">
        <span class="photo-form-label">종류</span>
        <div class="photo-kind-chips" role="radiogroup" aria-label="사진 종류">${chips}</div>
      </div>
      <div class="row">
        <label><span>촬영일</span><input name="takenAt" type="date" /></label>
        <label class="grow"><span>캡션</span><input name="caption" placeholder="한 줄 메모 (선택)" /></label>
      </div>
      <p class="error" id="photo-error" hidden></p>
      <div class="form-actions">
        <button type="button" data-action="modal-close" class="ghost">취소</button>
        <button type="submit" class="primary">${iUpload({ size: 12 })}<span>업로드</span></button>
      </div>
    </form>
  `;
}

/**
 * @typedef PhotoFormElements
 * @property {HTMLFormElement} form
 * @property {HTMLElement} dropzone
 * @property {HTMLInputElement} fileInput
 * @property {HTMLElement} emptyEl
 * @property {HTMLElement} previewEl
 * @property {HTMLImageElement} previewImg
 * @property {HTMLElement} previewName
 * @property {HTMLElement} previewSize
 * @property {HTMLElement} clearBtn
 * @property {HTMLElement} errEl
 */

/** @returns {PhotoFormElements} */
function getPhotoFormElements() {
  return {
    form: /** @type {HTMLFormElement} */ ($("#photo-form")),
    dropzone: $("#photo-dropzone"),
    fileInput: /** @type {HTMLInputElement} */ ($("#photo-file-input")),
    emptyEl: $("#photo-dropzone-empty"),
    previewEl: $("#photo-dropzone-preview"),
    previewImg: /** @type {HTMLImageElement} */ ($("#photo-preview-img")),
    previewName: $("#photo-preview-name"),
    previewSize: $("#photo-preview-size"),
    clearBtn: $("#photo-clear-btn"),
    errEl: $("#photo-error"),
  };
}

/** @param {PhotoFormElements} els @param {File[]} files */
function showPhotoPreview(els, files) {
  const file = files[0];
  if (!file) return;
  els.previewName.textContent = files.length === 1
    ? file.name || "사진"
    : `${file.name || "사진"} 외 ${files.length - 1}장`;
  els.previewSize.textContent = files.length === 1
    ? formatBytes(file.size)
    : `${files.length}장 · ${formatBytes(files.reduce((sum, item) => sum + item.size, 0))}`;
  const reader = new FileReader();
  reader.onload = () => {
    els.previewImg.src = String(reader.result ?? "");
  };
  reader.readAsDataURL(file);
  els.emptyEl.setAttribute("hidden", "");
  els.previewEl.removeAttribute("hidden");
  els.errEl.setAttribute("hidden", "");
}

/** @param {PhotoFormElements} els */
function bindPhotoDropzoneEvents(els) {
  for (const evt of ["dragenter", "dragover"]) {
    els.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.dropzone.classList.add("is-dragover");
    });
  }
  for (const evt of ["dragleave", "drop"]) {
    els.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.dropzone.classList.remove("is-dragover");
    });
  }
  els.dropzone.addEventListener("drop", (event) => {
    const e = /** @type {DragEvent} */ (event);
    const files = Array.from(e.dataTransfer?.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;
    const list = new DataTransfer();
    for (const file of files) list.items.add(file);
    els.fileInput.files = list.files;
    showPhotoPreview(els, files);
  });
}

/** @param {PhotoFormElements} els */
function bindPhotoDropzone(els) {
  els.fileInput.addEventListener("change", () => {
    const files = Array.from(els.fileInput.files ?? []);
    if (files.length > 0) showPhotoPreview(els, files);
  });

  els.clearBtn.addEventListener("click", () => {
    els.fileInput.value = "";
    els.previewImg.removeAttribute("src");
    els.emptyEl.removeAttribute("hidden");
    els.previewEl.setAttribute("hidden", "");
  });

  bindPhotoDropzoneEvents(els);

  // 칩 라디오 — 선택 시 시각 강조 토글
  els.form.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== "kind") return;
    els.form.querySelectorAll(".photo-kind-chip").forEach((chip) => {
      const radio = chip.querySelector("input[type=radio]");
      if (radio instanceof HTMLInputElement) chip.classList.toggle("is-selected", radio.checked);
    });
  });
}

/**
 * @param {WorkspaceState} s @param {PhotoUploadTarget} target
 * @param {PhotoFormElements} els @param {() => void} render
 */
function bindPhotoSubmit(s, target, els, render) {
  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(els.form);
    const files = Array.from(els.fileInput.files ?? []);
    if (files.length === 0) {
      els.errEl.textContent = "사진을 먼저 선택해 주세요.";
      els.errEl.removeAttribute("hidden");
      return;
    }
    els.errEl.setAttribute("hidden", "");
    const oversized = files.find((file) => file.size > MAX_PHOTO_FILE_BYTES);
    if (oversized) {
      els.errEl.textContent = `${oversized.name || "사진"}은 3.7MB 이하로 업로드해주세요.`;
      els.errEl.removeAttribute("hidden");
      return;
    }
    try {
      const uploaded = await uploadPhotos(s, target, files, fd);
      if (uploaded.error) {
        els.errEl.textContent = uploaded.error;
        els.errEl.removeAttribute("hidden");
        if (uploaded.list.length > 0) {
          s.bundle.attachments = [...(s.bundle.attachments ?? []), ...uploaded.list];
          render();
        }
        return;
      }
      s.bundle.attachments = [...(s.bundle.attachments ?? []), ...uploaded.list];
      closeModal();
      showToast(`${uploaded.list.length}장 업로드했습니다.`, { kind: "success" });
      render();
    } catch {
      els.errEl.textContent = "파일을 읽을 수 없습니다.";
      els.errEl.removeAttribute("hidden");
    }
  });
}

/**
 * 파일들을 순차 업로드. 한 건이라도 실패하면 중단하고 그동안 성공한 목록 + 에러 메시지 반환.
 * @param {WorkspaceState} s @param {PhotoUploadTarget} target @param {File[]} files @param {FormData} fd
 * @returns {Promise<{ list: import("../api.js").Attachment[], error: string|null }>}
 */
async function uploadPhotos(s, target, files, fd) {
  /** @type {import("../api.js").Attachment[]} */
  const list = [];
  for (const file of files) {
    const url = await fileToDataUrl(file);
    const result = await api.attachments.create(s.bundle.project.id, {
      ownerType: target.ownerType,
      ownerId: target.ownerId,
      kind: "photo",
      photoKind: /** @type {PhotoKind} */ (String(fd.get("kind") ?? DEFAULT_PHOTO_KIND)),
      filename: file.name || "photo",
      contentType: file.type || null,
      byteSize: file.size,
      blobUrl: url,
      caption: nullable(fd.get("caption")),
      takenAt: nullable(fd.get("takenAt")),
    });
    if (!result.ok) {
      const err = list.length > 0 ? `${list.length}장 업로드 후 중단: ${result.error}` : result.error;
      return { list, error: err };
    }
    list.push(result.data);
  }
  return { list, error: null };
}

/** @param {WorkspaceState} s @param {() => void} render */
export function openPhotoModal(s, render) {
  const target = resolvePhotoUploadTarget(s);
  if (!target) return;
  openModal(buildPhotoUploadFormHtml(target));
  const els = getPhotoFormElements();
  bindPhotoDropzone(els);
  bindPhotoSubmit(s, target, els, render);
}

/** @param {import("../api.js").Attachment} attachment */
function buildPhotoEditFormHtml(attachment) {
  const currentKind = attachment.photoKind ?? "reference";
  const chips = Object.entries(PHOTO_KIND_LABEL).map(([value, label]) => `
    <label class="photo-kind-chip${value === currentKind ? " is-selected" : ""}">
      <input type="radio" name="photoKind" value="${esc(value)}" ${value === currentKind ? "checked" : ""} />
      <span>${esc(label)}</span>
    </label>
  `).join("");
  return `
    <h3>사진 정보 수정</h3>
    <form id="photo-edit-form" class="form photo-upload-form">
      <div class="photo-dropzone-preview">
        <img src="${esc(attachment.blobUrl)}" alt="${esc(attachment.caption ?? attachment.filename)}" />
        <div class="photo-dropzone-meta">
          <strong>${esc(attachment.filename)}</strong>
          <small>${attachment.byteSize ? esc(formatBytes(attachment.byteSize)) : "파일 크기 미상"}</small>
        </div>
      </div>
      <div class="photo-form-field">
        <span class="photo-form-label">종류</span>
        <div class="photo-kind-chips" role="radiogroup" aria-label="사진 종류">${chips}</div>
      </div>
      <div class="row">
        <label><span>촬영일</span><input name="takenAt" type="date" value="${esc(attachment.takenAt ?? "")}" /></label>
        <label class="grow"><span>캡션</span><input name="caption" value="${esc(attachment.caption ?? "")}" placeholder="한 줄 메모 (선택)" /></label>
      </div>
      <label><span>링크</span><input name="linkUrl" type="text" inputmode="url" value="${esc(attachment.linkUrl ?? "")}" placeholder="https://example.com" /></label>
      <p class="error" id="photo-edit-error" hidden></p>
      <div class="form-actions">
        <button type="button" data-action="modal-close" class="ghost">취소</button>
        <button type="submit" class="primary">수정</button>
      </div>
    </form>
  `;
}

/** @param {WorkspaceState} s @param {string} id @param {() => void} render */
export function openPhotoEditModal(s, id, render) {
  const attachment = (s.bundle.attachments ?? []).find((item) => item.id === id);
  if (!attachment || attachment.kind !== "photo") return;
  openModal(buildPhotoEditFormHtml(attachment));

  const form = /** @type {HTMLFormElement} */ ($("#photo-edit-form"));
  const errEl = $("#photo-edit-error");

  // 칩 라디오 시각 토글
  form.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== "photoKind") return;
    form.querySelectorAll(".photo-kind-chip").forEach((chip) => {
      const radio = chip.querySelector("input[type=radio]");
      if (radio instanceof HTMLInputElement) chip.classList.toggle("is-selected", radio.checked);
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    errEl.setAttribute("hidden", "");
    const result = await api.attachments.update(attachment.id, {
      photoKind: /** @type {PhotoKind} */ (String(fd.get("photoKind") ?? attachment.photoKind ?? "reference")),
      caption: nullable(fd.get("caption")),
      takenAt: nullable(fd.get("takenAt")),
      linkUrl: nullable(fd.get("linkUrl")),
    });
    if (!result.ok) {
      errEl.textContent = result.error;
      errEl.removeAttribute("hidden");
      return;
    }
    s.bundle.attachments = (s.bundle.attachments ?? []).map((item) => item.id === result.data.id ? result.data : item);
    closeModal();
    showToast("사진 정보가 수정되었습니다.", { kind: "success" });
    render();
  });
}

/** @param {WorkspaceState} s @param {string} id @param {string|undefined} direction @param {() => void} render */
export async function movePhoto(s, id, direction, render) {
  const item = selectedLineItem(s);
  const space = currentSpace(s);
  const photos = s.view === "spaces" && s.spacePhotoScope === "lineItem" && item
    ? getPhotosForLineItem(s, item.id)
    : s.view === "spaces" && space
      ? getPhotosForSpace(s, space.id)
    : item
      ? getPhotosForLineItem(s, item.id)
      : [];
  const index = photos.findIndex((photo) => photo.id === id);
  const nextIndex = direction === "prev" ? index - 1 : direction === "next" ? index + 1 : -1;
  if (index < 0 || nextIndex < 0 || nextIndex >= photos.length) return;
  const ordered = [...photos];
  const current = ordered[index];
  ordered[index] = ordered[nextIndex];
  ordered[nextIndex] = current;
  const result = await api.attachments.reorder(s.bundle.project.id, ordered.map((photo) => photo.id));
  if (!result.ok) return showToast(result.error, { kind: "error" });
  const updatedById = new Map(result.data.map((attachment) => [attachment.id, attachment]));
  s.bundle.attachments = (s.bundle.attachments ?? []).map((attachment) => updatedById.get(attachment.id) ?? attachment);
  render();
}

/** @param {WorkspaceState} s @param {string} id @param {() => void} render */
export async function deletePhoto(s, id, render) {
  const attachment = (s.bundle.attachments ?? []).find((item) => item.id === id);
  if (!attachment || attachment.kind !== "photo") return;
  const result = await api.attachments.remove(id);
  if (!result.ok) return showToast(result.error, { kind: "error" });
  s.bundle.attachments = (s.bundle.attachments ?? []).filter((attachment) => attachment.id !== id);
  if (s.selectedPhotoId === id) s.selectedPhotoId = null;
  render();
}
