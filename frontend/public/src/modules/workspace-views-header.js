// 워크스페이스 상단 헤더 + LNB 렌더.

import { esc } from "../dom.js";
import {
  iHammer, iMenu, iMapPin, iExternalLink, iLogOut,
  iLayers, iLayoutGrid, iBox, iPlus, iClipboardList, iBuilding,
} from "./icons.js";
import { formatKrw } from "./workspace-format.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {import("../api.js").User} User */

/** @param {WorkspaceState} s @param {User|null} user */
export function renderProjectHeader(s, user) {
  const project = s.bundle.project;
  const projectPathId = encodeURIComponent(project.id);
  const mapUrl = project.address
    ? `https://map.naver.com/p/search/${encodeURIComponent(project.address)}`
    : null;
  return `
    <header class="workspace-topbar">
      <div class="workspace-brandbar">
        <span class="app-mark" aria-hidden="true">${iHammer({ size: 14 })}</span>
        <h1>인테리어 견적 관리</h1>
        <button class="icon-btn ${s.menuOpen ? "active" : ""}" data-action="ws-toggle-menu" aria-label="전체 메뉴" title="전체 메뉴">${iMenu({ size: 16 })}</button>
      </div>
      <div class="workspace-titlebar">
        <span class="project-name">${esc(project.name)}</span>
        ${
          mapUrl && project.address
            ? `<a class="project-address" href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer">${iMapPin({ size: 12 })}<span class="address-text">${esc(project.address)}</span>${iExternalLink({ size: 11 })}</a>`
            : ""
        }
        <span class="project-meta">· ${esc(project.sizeKr ?? "-")}평 · 예산 ${esc(formatKrw(project.totalBudget ?? 0))}</span>
      </div>
      <div class="workspace-actions">
        <div class="mode-tabs view-tabs" role="tablist" aria-label="관리 화면">
          <button data-action="goto" data-route="/projects/${esc(projectPathId)}" class="${s.view === "quotes" ? "active brand" : ""}">견적 관리</button>
          <button data-action="goto" data-route="/projects/${esc(projectPathId)}/spaces" class="${s.view === "spaces" ? "active success" : ""}">공간 관리</button>
          <button data-action="goto" data-route="/projects/${esc(projectPathId)}/models" class="${s.view === "models" ? "active warning" : ""}">3D 모델</button>
        </div>
        <div class="mode-tabs" role="tablist" aria-label="견적 방식">
          <button data-action="ws-mode" data-mode="turnkey" class="${s.mode === "turnkey" ? "active brand" : ""}">턴키</button>
          <button data-action="ws-mode" data-mode="self" class="${s.mode === "self" ? "active success" : ""}">반셀프</button>
        </div>
      </div>
      ${s.menuOpen ? renderLnb(project.name, projectPathId, s.view, user) : ""}
    </header>
  `;
}

/** @param {string} projectName @param {string} projectPathId @param {WorkspaceState["view"]} view @param {User|null} user */
function renderLnb(projectName, projectPathId, view, user) {
  return `
    <aside class="workspace-lnb" aria-label="전체 메뉴">
      <div class="workspace-lnb-title">${esc(projectName)}</div>
      <div class="workspace-lnb-section">
        <div class="workspace-lnb-section-title">현재 프로젝트</div>
        <nav>
          <button data-action="goto" data-route="/projects/${esc(projectPathId)}" class="${view === "quotes" ? "active" : ""}">${iClipboardList({ size: 13 })}<span>견적 관리</span></button>
          <button data-action="goto" data-route="/projects/${esc(projectPathId)}/spaces" class="${view === "spaces" ? "active" : ""}">${iLayoutGrid({ size: 13 })}<span>공간 관리</span></button>
          <button data-action="goto" data-route="/projects/${esc(projectPathId)}/models" class="${view === "models" ? "active" : ""}">${iBox({ size: 13 })}<span>3D 모델</span></button>
          <button data-action="ws-open-review-materials">${iClipboardList({ size: 13 })}<span>참고자료</span></button>
        </nav>
      </div>
      <div class="workspace-lnb-section">
        <div class="workspace-lnb-section-title">다른 곳으로</div>
        <nav>
          <button data-action="goto" data-route="/projects">${iLayers({ size: 13 })}<span>프로젝트 목록</span>${iExternalLink({ size: 11 })}</button>
          <button data-action="goto" data-route="/vendors">${iBuilding({ size: 13 })}<span>업체 관리</span>${iExternalLink({ size: 11 })}</button>
        </nav>
      </div>
      <div class="workspace-lnb-section">
        <div class="workspace-lnb-section-title">빠른 작업</div>
        <nav>
          <button data-action="ws-open-vendor">${iPlus({ size: 13 })}<span>업체 추가</span></button>
        </nav>
      </div>
      <div class="workspace-lnb-user">
        <span title="${esc(user?.email ?? "")}">${esc(user?.name ?? "")}</span>
        <button data-action="logout" class="ghost">${iLogOut({ size: 12 })}<span>로그아웃</span></button>
      </div>
    </aside>
  `;
}
