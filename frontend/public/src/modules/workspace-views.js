// 워크스페이스 화면 진입점.
// 영역별 렌더는 workspace-views-* 모듈에 분산. 이 파일은 shell 조립만 담당.

import { renderProjectHeader } from "./workspace-views-header.js";
import { renderSidebar } from "./workspace-views-sidebar.js";
import { renderConsiderationsPanel } from "./workspace-views-considerations.js";
import { renderLineItemsPanel } from "./workspace-views-line-items.js";
import { renderModelViewerPane } from "./workspace-views-models.js";
import { renderQuotePane } from "./workspace-views-quote.js";
import { renderSpaceManagementPane } from "./workspace-views-space.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {import("../api.js").User} User */

/** @param {WorkspaceState} s @param {User|null} currentUser */
export function renderShell(s, currentUser) {
  if (s.view === "models") {
    return `
      <section class="workspace-v1 model-workspace-view">
        ${renderProjectHeader(s, currentUser)}
        ${renderModelViewerPane(s)}
      </section>
    `;
  }

  return `
    <section class="workspace-v1 ${s.view === "spaces" ? "space-management-view" : ""}">
      ${renderProjectHeader(s, currentUser)}
      <div class="workspace-grid-v1 ${s.view === "spaces" ? "space-management-grid" : ""}">
        ${renderSidebar(s)}
        ${renderMainPane(s)}
        ${s.view === "spaces" ? renderSpaceManagementPane(s) : renderQuotePane(s)}
      </div>
    </section>
  `;
}

/** @param {WorkspaceState} s */
function renderMainPane(s) {
  return `
    <main class="ws-main-v1">
      <div class="ws-main-body">
        ${renderConsiderationsPanel(s)}
        ${renderLineItemsPanel(s)}
      </div>
    </main>
  `;
}
