import { $, html } from "./dom.js";
import { api } from "./api.js";
import { setState, getState } from "./state.js";
import { renderLogin, renderSignup } from "./modules/auth.js";
import { renderProjectsPage } from "./modules/projects.js";
import { renderSettingsPage } from "./modules/settings.js";
import { renderVendorsPage } from "./modules/vendors.js";
import { renderWorkspacePage } from "./modules/workspace.js";
import { closeModal } from "./modules/modal.js";
import { showToast } from "./modules/toast.js";

const PUBLIC_ROUTES = new Set(["/login", "/signup"]);

/** @param {string} path */
function parseRoute(path) {
  const spaces = /^\/projects\/([^/]+)\/spaces$/.exec(path);
  if (spaces) return { name: "space_management", projectId: decodeURIComponent(spaces[1] ?? "") };
  const models = /^\/projects\/([^/]+)\/models$/.exec(path);
  if (models) return { name: "model_viewer", projectId: decodeURIComponent(models[1] ?? "") };
  const reviewMaterials = /^\/projects\/([^/]+)\/review-materials$/.exec(path);
  if (reviewMaterials) {
    return { name: "review_materials", projectId: decodeURIComponent(reviewMaterials[1] ?? "") };
  }
  const m = /^\/projects\/([^/]+)$/.exec(path);
  if (m) return { name: "workspace", projectId: decodeURIComponent(m[1] ?? "") };
  if (path === "/login") return { name: "login" };
  if (path === "/signup") return { name: "signup" };
  if (path === "/settings") return { name: "settings" };
  if (path === "/vendors") return { name: "vendors" };
  if (path === "/projects" || path === "/" || path === "/dashboard")
    return { name: "projects" };
  return { name: "not_found", path };
}

/**
 * @param {string} pathname
 * @param {{ replace?: boolean }} [opts]
 */
async function navigate(pathname, opts = {}) {
  closeModal();
  if (!opts.replace) history.pushState({}, "", pathname);
  else history.replaceState({}, "", pathname);

  const main = $("#app");
  setState({ route: pathname });

  if (handleAuthRedirect(main, pathname)) {
    updateNav();
    return;
  }
  await renderRoute(main, parseRoute(pathname));
  updateNav();
}

/**
 * 인증 상태에 따른 redirect 처리. redirect 발생 시 true 반환 (호출자는 즉시 종료).
 * @param {HTMLElement} main @param {string} pathname
 */
function handleAuthRedirect(main, pathname) {
  const user = getState().currentUser;
  const requiresAuth = !PUBLIC_ROUTES.has(pathname);
  if (requiresAuth && !user) {
    history.replaceState({}, "", "/login");
    setState({ route: "/login" });
    renderLogin(main, () => navigate("/projects", { replace: true }));
    return true;
  }
  if (!requiresAuth && user) {
    history.replaceState({}, "", "/projects");
    setState({ route: "/projects" });
    void renderProjectsPage(main, (id) => navigate(`/projects/${encodeURIComponent(id)}`));
    return true;
  }
  return false;
}

/**
 * @param {HTMLElement} main
 * @param {ReturnType<typeof parseRoute>} route
 */
async function renderRoute(main, route) {
  switch (route.name) {
    case "login":
      renderLogin(main, () => navigate("/projects", { replace: true }));
      return;
    case "signup":
      renderSignup(main, () => navigate("/projects", { replace: true }));
      return;
    case "projects":
      await renderProjectsPage(
        main,
        (id) => navigate(`/projects/${encodeURIComponent(id)}`),
        (id) => navigate(`/projects/${encodeURIComponent(id)}/spaces`),
        (id) => navigate(`/projects/${encodeURIComponent(id)}/models`),
        (id) => navigate(`/projects/${encodeURIComponent(id)}/review-materials`),
      );
      return;
    case "workspace":
      await renderWorkspacePage(main, route.projectId ?? "");
      return;
    case "space_management":
      await renderWorkspacePage(main, route.projectId ?? "", { view: "spaces" });
      return;
    case "model_viewer":
      await renderWorkspacePage(main, route.projectId ?? "", { view: "models" });
      return;
    case "review_materials":
      await renderWorkspacePage(main, route.projectId ?? "", { openReviewMaterials: true });
      return;
    case "vendors":
      await renderVendorsPage(main);
      return;
    case "settings":
      await renderSettingsPage(main);
      return;
    default:
      main.innerHTML = html`<p class="muted">존재하지 않는 페이지: ${route.path ?? ""}</p>`;
  }
}

function updateNav() {
  const header = $("#app-header");
  const user = getState().currentUser;
  const route = getState().route;
  // 워크스페이스(/projects/{id}, /projects/{id}/spaces) 안에서는 전역 LNB 를 숨긴다.
  // 워크스페이스는 자체 햄버거 메뉴(workspace-lnb)로 메뉴를 노출한다.
  const showLnb = Boolean(user && !route.startsWith("/projects/"));
  document.body.classList.toggle("with-lnb", showLnb);

  if (showLnb) {
    header.removeAttribute("hidden");
    const nameEl = $("#user-name", header);
    nameEl.textContent = user?.name ?? "";

    for (const button of header.querySelectorAll("[data-route]")) {
      if (!(button instanceof HTMLElement)) continue;
      const target = button.dataset.route;
      if (target === route || (target === "/projects" && route === "/")) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    }
  } else {
    header.setAttribute("hidden", "");
  }
}

// 글로벌 클릭 위임 — data-action 만 처리.
document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const trigger = target.closest("[data-action]");
  if (!(trigger instanceof HTMLElement)) return;

  const action = trigger.dataset.action;
  switch (action) {
    case "goto": {
      const route = trigger.dataset.route;
      if (route) {
        event.preventDefault();
        void navigate(route);
      }
      break;
    }
    case "modal-close":
      closeModal();
      break;
    case "logout": {
      const r = await api.auth.logout();
      if (r.ok) {
        setState({ currentUser: null });
        showToast("로그아웃되었습니다.");
        navigate("/login", { replace: true });
      }
      break;
    }
  }
});

window.addEventListener("popstate", () => {
  void navigate(location.pathname || "/projects", { replace: true });
});

(async function bootstrap() {
  // 세션 복원 시도
  const me = await api.auth.me();
  if (me.ok) {
    setState({ currentUser: me.data });
  }
  await navigate(location.pathname || "/projects", { replace: true });
})();
