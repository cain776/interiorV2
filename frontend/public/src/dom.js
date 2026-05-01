/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {HTMLElement}
 */
export function $(selector, root = document) {
  const el = root.querySelector(selector);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Element not found: ${selector}`);
  }
  return el;
}

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {HTMLElement[]}
 */
export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector)).filter(
    (el) => el instanceof HTMLElement,
  );
}

/**
 * 안전한 텍스트 이스케이프. innerHTML에 동적 데이터 넣을 때 반드시 사용.
 * @param {unknown} value
 * @returns {string}
 */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => {
    /** @type {Record<string, string>} */
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c] ?? c;
  });
}

/**
 * 내부 렌더 함수가 이미 escape를 끝낸 HTML 조각임을 표시한다.
 * 사용자 입력을 raw로 감싸지 않는다.
 * @param {string} value
 * @returns {{ __html: string }}
 */
export function raw(value) {
  return { __html: value };
}

/**
 * 태그 함수: html`<div>${userInput}</div>` — 동적 값 자동 escape.
 * @param {TemplateStringsArray} strings
 * @param  {...unknown} values
 * @returns {string}
 */
export function html(strings, ...values) {
  return strings.reduce((acc, str, i) => {
    const input = i < values.length ? values[i] : "";
    const value = isRawHtml(input) ? /** @type {{ __html: string }} */ (input).__html : esc(input);
    return acc + str + value;
  }, "");
}

/** @param {unknown} value */
function isRawHtml(value) {
  return Boolean(
    value
      && typeof value === "object"
      && "__html" in value
      && typeof /** @type {{ __html?: unknown }} */ (value).__html === "string",
  );
}
