// 유일하게 fetch를 사용하는 파일.
// 다른 파일에서 fetch 직접 호출 금지. 반드시 이 파일의 함수를 통해 호출.

/**
 * @template T
 * @typedef {{ ok: true, data: T }} ApiSuccess
 */

/**
 * @typedef {{ ok: false, error: string, fieldErrors?: Record<string, string> }} ApiError
 */

/**
 * @template T
 * @typedef {ApiSuccess<T> | ApiError} ApiResult
 */

/** @typedef {"admin"|"customer"|"vendor"} UserRole */
/** @typedef {{ id: string, email: string, name: string, role: UserRole, canLogin: boolean, createdAt: string, updatedAt: string }} User */
/** @typedef {"planning"|"in_progress"|"done"|"archived"} ProjectStatus */
/** @typedef {"planned"|"in_progress"|"done"|"as"} PhaseStatus */
/** @typedef {"turnkey"|"self"} QuoteMode */
/** @typedef {"candidate"|"negotiating"|"contracted"|"cancelled"} QuoteStatus */
/** @typedef {"planned"|"contracted"|"in_progress"|"done"|"disputed"|"cancelled"} ContractStatus */
/** @typedef {"standalone"|"subcontract"} ContractType */
/** @typedef {"deposit"|"progress"|"final"|"extra"|"refund"} PaymentKind */
/** @typedef {"pending"|"paid"|"overdue"|"cancelled"} PaymentStatus */
/** @typedef {"site_change"|"additional_request"|"defect"|"other"} ChangeOrderReason */
/** @typedef {"requested"|"approved"|"rejected"|"cancelled"} ChangeOrderStatus */
/** @typedef {"received"|"confirmed"|"in_progress"|"done"|"on_hold"} AsTicketStatus */
/** @typedef {"normal"|"urgent"} AsTicketPriority */
/** @typedef {"project"|"vendor"|"phase"|"space"|"lineItem"|"quote"|"contract"|"payment"|"changeOrder"|"asTicket"} AttachmentOwnerType */
/** @typedef {"photo"|"pdf"|"drawing"|"document"|"other"} AttachmentKind */
/** @typedef {"before"|"during"|"after"|"reference"|"defect"|"floorplan"|"naver_floorplan"|"fixture"} PhotoKind */

/**
 * @typedef Project
 * @property {string} id
 * @property {string} ownerId
 * @property {string} name
 * @property {string|null} address
 * @property {number|null} sizeKr
 * @property {string|null} startDate
 * @property {string|null} endDate
 * @property {number|null} totalBudget
 * @property {ProjectStatus} status
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef Vendor
 * @property {string} id
 * @property {string} ownerId
 * @property {string} name
 * @property {string|null} ceo
 * @property {string|null} phone
 * @property {string|null} officeAddress
 * @property {string|null} companyPhone
 * @property {string|null} mobilePhone
 * @property {string|null} photoUrl
 * @property {string|null} email
 * @property {string|null} specialty
 * @property {number|null} rating
 * @property {number} sortOrder
 * @property {boolean} isActive
 * @property {string|null} memo
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef Consideration
 * @property {string} id
 * @property {string} label
 * @property {"template"|"custom"} source
 * @property {boolean} checked
 * @property {string|null} [note]
 * @property {string|null} [spaceId]
 * @property {string|null} [lineItemId]
 * @property {"normal"|"important"|"critical"} [priority]
 */

/**
 * @typedef Phase
 * @property {string} id
 * @property {string} projectId
 * @property {string} name
 * @property {string|null} templateKey
 * @property {string|null} scheduledStart
 * @property {string|null} scheduledEnd
 * @property {PhaseStatus} status
 * @property {number} sortOrder
 * @property {Consideration[]} considerations
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef Space
 * @property {string} id
 * @property {string} projectId
 * @property {string} name
 * @property {number|null} areaSqm
 * @property {number} sortOrder
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef LineItem
 * @property {string} id
 * @property {string} phaseId
 * @property {string|null} spaceId
 * @property {string|null} locationLabel
 * @property {string|null} workItemLabel
 * @property {string} label
 * @property {string|null} memo
 * @property {string|null} selectedQuoteId
 * @property {number} sortOrder
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef Quote
 * @property {string} id
 * @property {string} lineItemId
 * @property {string} vendorId
 * @property {QuoteMode} mode
 * @property {number} price
 * @property {QuoteStatus} status
 * @property {Record<string, unknown>} meta
 * @property {string|null} memo
 * @property {string|null} selectedAt
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef Contract
 * @property {string} id
 * @property {string} projectId
 * @property {string|null} phaseId
 * @property {string|null} vendorId
 * @property {string|null} parentContractId
 * @property {ContractType} type
 * @property {ContractStatus} status
 * @property {string} title
 * @property {number} amount
 * @property {string|null} scheduledStart
 * @property {string|null} scheduledEnd
 * @property {string|null} actualStart
 * @property {string|null} actualEnd
 * @property {string|null} memo
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef Payment
 * @property {string} id
 * @property {string} projectId
 * @property {string|null} contractId
 * @property {PaymentKind} kind
 * @property {PaymentStatus} status
 * @property {number} amount
 * @property {string|null} dueDate
 * @property {string|null} paidAt
 * @property {string|null} memo
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef ChangeOrder
 * @property {string} id
 * @property {string} projectId
 * @property {string|null} contractId
 * @property {ChangeOrderReason} reason
 * @property {ChangeOrderStatus} status
 * @property {string} title
 * @property {number} amountDelta
 * @property {string|null} approvedAt
 * @property {string|null} memo
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef AsTicket
 * @property {string} id
 * @property {string} projectId
 * @property {string|null} contractId
 * @property {string|null} phaseId
 * @property {string|null} lineItemId
 * @property {AsTicketStatus} status
 * @property {AsTicketPriority} priority
 * @property {string} title
 * @property {string|null} content
 * @property {string|null} occurredAt
 * @property {string|null} resolvedAt
 * @property {string|null} warrantyExpiresAt
 * @property {string|null} memo
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef Attachment
 * @property {string} id
 * @property {string} projectId
 * @property {AttachmentOwnerType} ownerType
 * @property {string} ownerId
 * @property {AttachmentKind} kind
 * @property {PhotoKind|null} photoKind
 * @property {string} filename
 * @property {string|null} contentType
 * @property {number|null} byteSize
 * @property {string} blobUrl
 * @property {string|null} blobPathname
 * @property {string|null} caption
 * @property {string|null} takenAt
 * @property {string|null} linkUrl
 * @property {number} sortOrder
 * @property {string|null} uploadedById
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef ReviewMaterial
 * @property {string} id
 * @property {string} projectId
 * @property {string} title
 * @property {string} url
 * @property {string|null} source
 * @property {string|null} memo
 * @property {number} sortOrder
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef WorkspaceBundle
 * @property {Project} project
 * @property {Phase[]} phases
 * @property {Space[]} spaces
 * @property {LineItem[]} lineItems
 * @property {Quote[]} quotes
 * @property {Vendor[]} vendors
 * @property {Contract[]} contracts
 * @property {Payment[]} payments
 * @property {ChangeOrder[]} changeOrders
 * @property {AsTicket[]} asTickets
 * @property {Attachment[]} attachments
 * @property {ReviewMaterial[]} reviewMaterials
 */

/**
 * @template T
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<ApiResult<T>>}
 */
async function request(path, init = {}) {
  try {
    const headers = { ...(init.headers ?? {}) };
    if (init.body !== undefined && !("Content-Type" in headers)) {
      /** @type {Record<string, string>} */ (headers)["Content-Type"] = "application/json";
    }
    const response = await fetch(path, {
      ...init,
      headers,
      credentials: "same-origin",
    });
    // 백엔드는 항상 JSON 반환 (성공 { ok:true, data:... }, 실패 { ok:false, error }).
    // 204/빈 본문이면 .json() 이 throw → catch 에서 네트워크 오류로 처리.
    /** @type {ApiResult<T>} */
    const body = await response.json();
    return body;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "네트워크 오류",
    };
  }
}

/**
 * @template T
 * @param {string} path
 * @param {string} method
 * @param {unknown} [body]
 * @returns {Promise<ApiResult<T>>}
 */
function send(path, method, body) {
  return request(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const SKETCHUP_BRIDGE_ENDPOINT = "http://127.0.0.1:43434/command";
const LOCAL_BRIDGE_TIMEOUT_MS = 2500;

/**
 * @template T
 * @param {string} endpoint
 * @param {unknown} body
 * @returns {Promise<ApiResult<T>>}
 */
async function sendExternalJson(endpoint, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOCAL_BRIDGE_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    const text = await response.text();
    /** @type {ApiResult<T>} */
    const parsed = text ? JSON.parse(text) : { ok: true, data: {} };
    return parsed;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error && err.name !== "AbortError"
        ? err.message
        : "로컬 SketchUp 브릿지에 연결할 수 없습니다.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: () => /** @type {Promise<ApiResult<{ status: string, time: string }>>} */ (
    request("/api/health")
  ),

  sketchupBridge: {
    /** @param {unknown} command */
    command: (command) => /** @type {Promise<ApiResult<{ generatedRooms?: number, status?: string }>>} */ (
      sendExternalJson(SKETCHUP_BRIDGE_ENDPOINT, command)
    ),
  },

  auth: {
    /** @param {{ email: string, password: string, name: string }} input */
    signup: (input) => send("/api/auth/signup", "POST", input),
    /** @param {{ email: string, password: string }} input */
    login: (input) => send("/api/auth/login", "POST", input),
    logout: () => send("/api/auth/logout", "POST"),
    me: () => /** @type {Promise<ApiResult<User>>} */ (request("/api/auth/me")),
  },

  users: {
    list: () => /** @type {Promise<ApiResult<User[]>>} */ (request("/api/users")),
    /** @param {{ email: string, name: string, password: string, role?: UserRole, canLogin?: boolean }} input */
    create: (input) => /** @type {Promise<ApiResult<User>>} */ (
      send("/api/users", "POST", input)
    ),
    /** @param {string} id @param {{ email?: string, name?: string, password?: string, role?: UserRole, canLogin?: boolean }} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<User>>} */ (
      send(`/api/users/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/users/${encodeURIComponent(id)}`, "DELETE"),
  },

  projects: {
    list: () => /** @type {Promise<ApiResult<Project[]>>} */ (request("/api/projects")),
    /** @param {string} id */
    get: (id) => /** @type {Promise<ApiResult<Project>>} */ (
      request(`/api/projects/${encodeURIComponent(id)}`)
    ),
    /** @param {Partial<Project>} input */
    create: (input) => /** @type {Promise<ApiResult<Project>>} */ (
      send("/api/projects", "POST", input)
    ),
    /** @param {string} id @param {Partial<Project>} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<Project>>} */ (
      send(`/api/projects/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/projects/${encodeURIComponent(id)}`, "DELETE"),
    /** @param {string} id */
    workspace: (id) => /** @type {Promise<ApiResult<WorkspaceBundle>>} */ (
      request(`/api/projects/${encodeURIComponent(id)}/workspace`)
    ),
  },

  vendors: {
    list: () => /** @type {Promise<ApiResult<Vendor[]>>} */ (request("/api/vendors")),
    /** @param {Partial<Vendor>} input */
    create: (input) => /** @type {Promise<ApiResult<Vendor>>} */ (
      send("/api/vendors", "POST", input)
    ),
    /** @param {string} id @param {Partial<Vendor>} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<Vendor>>} */ (
      send(`/api/vendors/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string[]} orderedIds */
    reorder: (orderedIds) => /** @type {Promise<ApiResult<Vendor[]>>} */ (
      send("/api/vendors/reorder", "PATCH", { orderedIds })
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/vendors/${encodeURIComponent(id)}`, "DELETE"),
  },

  phases: {
    /** @param {string} projectId @param {Partial<Phase>} input */
    create: (projectId, input) => /** @type {Promise<ApiResult<Phase>>} */ (
      send(`/api/projects/${encodeURIComponent(projectId)}/phases`, "POST", input)
    ),
    /** @param {string} projectId @param {string[]} orderedIds */
    reorder: (projectId, orderedIds) => /** @type {Promise<ApiResult<Phase[]>>} */ (
      send(`/api/projects/${encodeURIComponent(projectId)}/phases/reorder`, "PATCH", { orderedIds })
    ),
    /** @param {string} id @param {Partial<Phase>} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<Phase>>} */ (
      send(`/api/phases/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/phases/${encodeURIComponent(id)}`, "DELETE"),
  },

  spaces: {
    /** @param {string} projectId @param {Partial<Space>} input */
    create: (projectId, input) => /** @type {Promise<ApiResult<Space>>} */ (
      send(`/api/projects/${encodeURIComponent(projectId)}/spaces`, "POST", input)
    ),
    /** @param {string} projectId @param {string[]} orderedIds */
    reorder: (projectId, orderedIds) => /** @type {Promise<ApiResult<Space[]>>} */ (
      send(`/api/projects/${encodeURIComponent(projectId)}/spaces/reorder`, "PATCH", { orderedIds })
    ),
    /** @param {string} id @param {Partial<Space>} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<Space>>} */ (
      send(`/api/spaces/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/spaces/${encodeURIComponent(id)}`, "DELETE"),
  },

  lineItems: {
    /** @param {string} phaseId @param {Partial<LineItem>} input */
    create: (phaseId, input) => /** @type {Promise<ApiResult<LineItem>>} */ (
      send(`/api/phases/${encodeURIComponent(phaseId)}/line-items`, "POST", input)
    ),
    /** @param {string} phaseId @param {string[]} orderedIds */
    reorder: (phaseId, orderedIds) => /** @type {Promise<ApiResult<LineItem[]>>} */ (
      send(`/api/phases/${encodeURIComponent(phaseId)}/line-items/reorder`, "PATCH", { orderedIds })
    ),
    /** @param {string} id @param {Partial<LineItem>} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<LineItem>>} */ (
      send(`/api/line-items/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/line-items/${encodeURIComponent(id)}`, "DELETE"),
  },

  quotes: {
    /** @param {string} lineItemId @param {Partial<Quote>} input */
    create: (lineItemId, input) => /** @type {Promise<ApiResult<Quote>>} */ (
      send(`/api/line-items/${encodeURIComponent(lineItemId)}/quotes`, "POST", input)
    ),
    /** @param {string} id @param {Partial<Quote>} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<Quote>>} */ (
      send(`/api/quotes/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/quotes/${encodeURIComponent(id)}`, "DELETE"),
    /** @param {string} id */
    select: (id) => /** @type {Promise<ApiResult<LineItem>>} */ (
      send(`/api/quotes/${encodeURIComponent(id)}/select`, "POST")
    ),
  },

  contracts: {
    /** @param {string} projectId */
    list: (projectId) => /** @type {Promise<ApiResult<Contract[]>>} */ (
      request(`/api/projects/${encodeURIComponent(projectId)}/contracts`)
    ),
    /** @param {string} projectId @param {Partial<Contract>} input */
    create: (projectId, input) => /** @type {Promise<ApiResult<Contract>>} */ (
      send(`/api/projects/${encodeURIComponent(projectId)}/contracts`, "POST", input)
    ),
    /** @param {string} id @param {Partial<Contract>} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<Contract>>} */ (
      send(`/api/contracts/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/contracts/${encodeURIComponent(id)}`, "DELETE"),
  },

  payments: {
    /** @param {string} projectId */
    list: (projectId) => /** @type {Promise<ApiResult<Payment[]>>} */ (
      request(`/api/projects/${encodeURIComponent(projectId)}/payments`)
    ),
    /** @param {string} projectId @param {Partial<Payment>} input */
    create: (projectId, input) => /** @type {Promise<ApiResult<Payment>>} */ (
      send(`/api/projects/${encodeURIComponent(projectId)}/payments`, "POST", input)
    ),
    /** @param {string} id @param {Partial<Payment>} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<Payment>>} */ (
      send(`/api/payments/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/payments/${encodeURIComponent(id)}`, "DELETE"),
  },

  changeOrders: {
    /** @param {string} projectId */
    list: (projectId) => /** @type {Promise<ApiResult<ChangeOrder[]>>} */ (
      request(`/api/projects/${encodeURIComponent(projectId)}/change-orders`)
    ),
    /** @param {string} projectId @param {Partial<ChangeOrder>} input */
    create: (projectId, input) => /** @type {Promise<ApiResult<ChangeOrder>>} */ (
      send(`/api/projects/${encodeURIComponent(projectId)}/change-orders`, "POST", input)
    ),
    /** @param {string} id @param {Partial<ChangeOrder>} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<ChangeOrder>>} */ (
      send(`/api/change-orders/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/change-orders/${encodeURIComponent(id)}`, "DELETE"),
  },

  asTickets: {
    /** @param {string} projectId */
    list: (projectId) => /** @type {Promise<ApiResult<AsTicket[]>>} */ (
      request(`/api/projects/${encodeURIComponent(projectId)}/as-tickets`)
    ),
    /** @param {string} projectId @param {Partial<AsTicket>} input */
    create: (projectId, input) => /** @type {Promise<ApiResult<AsTicket>>} */ (
      send(`/api/projects/${encodeURIComponent(projectId)}/as-tickets`, "POST", input)
    ),
    /** @param {string} id @param {Partial<AsTicket>} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<AsTicket>>} */ (
      send(`/api/as-tickets/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/as-tickets/${encodeURIComponent(id)}`, "DELETE"),
  },

  attachments: {
    /** @param {string} projectId */
    list: (projectId) => /** @type {Promise<ApiResult<Attachment[]>>} */ (
      request(`/api/projects/${encodeURIComponent(projectId)}/attachments`)
    ),
    /** @param {string} projectId @param {Partial<Attachment>} input */
    create: (projectId, input) => /** @type {Promise<ApiResult<Attachment>>} */ (
      send(`/api/projects/${encodeURIComponent(projectId)}/attachments`, "POST", input)
    ),
    /** @param {string} id @param {Partial<Attachment>} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<Attachment>>} */ (
      send(`/api/attachments/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string} projectId @param {string[]} orderedIds */
    reorder: (projectId, orderedIds) => /** @type {Promise<ApiResult<Attachment[]>>} */ (
      send(`/api/projects/${encodeURIComponent(projectId)}/attachments/reorder`, "PATCH", { orderedIds })
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/attachments/${encodeURIComponent(id)}`, "DELETE"),
  },

  reviewMaterials: {
    /** @param {string} projectId */
    list: (projectId) => /** @type {Promise<ApiResult<ReviewMaterial[]>>} */ (
      request(`/api/projects/${encodeURIComponent(projectId)}/review-materials`)
    ),
    /** @param {string} projectId @param {Partial<ReviewMaterial>} input */
    create: (projectId, input) => /** @type {Promise<ApiResult<ReviewMaterial>>} */ (
      send(`/api/projects/${encodeURIComponent(projectId)}/review-materials`, "POST", input)
    ),
    /** @param {string} projectId @param {string[]} orderedIds */
    reorder: (projectId, orderedIds) => /** @type {Promise<ApiResult<ReviewMaterial[]>>} */ (
      send(`/api/projects/${encodeURIComponent(projectId)}/review-materials/reorder`, "PATCH", { orderedIds })
    ),
    /** @param {string} id @param {Partial<ReviewMaterial>} patch */
    update: (id, patch) => /** @type {Promise<ApiResult<ReviewMaterial>>} */ (
      send(`/api/review-materials/${encodeURIComponent(id)}`, "PATCH", patch)
    ),
    /** @param {string} id */
    remove: (id) => send(`/api/review-materials/${encodeURIComponent(id)}`, "DELETE"),
  },
};
