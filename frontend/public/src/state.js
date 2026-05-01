// 작은 화면 상태. 복잡해지면 modules/별로 분리.
// state.js가 300줄을 넘기면 React 전환 검토 (CLAUDE.md 참고).

/**
 * @typedef {Object} AppState
 * @property {string} route
 * @property {{ id: string, email: string, name: string } | null} currentUser
 * @property {{ id: string, name: string } | null} currentProject
 */

/** @type {AppState} */
const state = {
  route: location.pathname || "/dashboard",
  currentUser: null,
  currentProject: null,
};

/** @type {Set<(s: AppState) => void>} */
const subscribers = new Set();

/** @returns {AppState} */
export function getState() {
  return { ...state };
}

/**
 * @param {Partial<AppState>} patch
 */
export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of subscribers) fn(getState());
}

/**
 * @param {(s: AppState) => void} fn
 * @returns {() => void}
 */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
