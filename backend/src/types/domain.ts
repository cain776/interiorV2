export type ProjectStatus = "planning" | "in_progress" | "done" | "archived";
export type PhaseStatus = "planned" | "in_progress" | "done" | "as";
export type QuoteMode = "turnkey" | "self";
export type QuoteStatus = "candidate" | "negotiating" | "contracted" | "cancelled";
export type ContractStatus =
  | "planned"
  | "contracted"
  | "in_progress"
  | "done"
  | "disputed"
  | "cancelled";
export type ContractType = "standalone" | "subcontract";
export type PaymentKind = "deposit" | "progress" | "final" | "extra" | "refund";
export type PaymentStatus = "pending" | "paid" | "overdue" | "cancelled";
export type ChangeOrderReason =
  | "site_change"
  | "additional_request"
  | "defect"
  | "other";
export type ChangeOrderStatus = "requested" | "approved" | "rejected" | "cancelled";
export type AsTicketStatus =
  | "received"
  | "confirmed"
  | "in_progress"
  | "done"
  | "on_hold";
export type AsTicketPriority = "normal" | "urgent";
export type AttachmentOwnerType =
  | "project"
  | "vendor"
  | "phase"
  | "space"
  | "lineItem"
  | "quote"
  | "contract"
  | "payment"
  | "changeOrder"
  | "asTicket";
export type AttachmentKind = "photo" | "pdf" | "drawing" | "document" | "other";
export type PhotoKind =
  | "before"
  | "during"
  | "after"
  | "reference"
  | "defect"
  | "floorplan"
  | "naver_floorplan"
  | "fixture";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  address: string | null;
  sizeKr: number | null;
  startDate: string | null;
  endDate: string | null;
  totalBudget: number | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Vendor {
  id: string;
  ownerId: string;
  name: string;
  ceo: string | null;
  phone: string | null;
  email: string | null;
  specialty: string | null;
  rating: number | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Consideration {
  id: string;
  label: string;
  source: "template" | "custom";
  checked: boolean;
  note?: string | null;
  spaceId?: string | null;
  lineItemId?: string | null;
  priority?: "normal" | "important" | "critical";
}

export interface Phase {
  id: string;
  projectId: string;
  name: string;
  templateKey: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  status: PhaseStatus;
  sortOrder: number;
  considerations: Consideration[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Space {
  id: string;
  projectId: string;
  name: string;
  areaSqm: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LineItem {
  id: string;
  phaseId: string;
  spaceId: string | null;
  locationLabel: string | null;
  workItemLabel: string | null;
  label: string;
  memo: string | null;
  selectedQuoteId: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Quote {
  id: string;
  lineItemId: string;
  vendorId: string;
  mode: QuoteMode;
  price: number;
  status: QuoteStatus;
  meta: Record<string, unknown>;
  memo: string | null;
  selectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contract {
  id: string;
  projectId: string;
  phaseId: string | null;
  vendorId: string | null;
  parentContractId: string | null;
  type: ContractType;
  status: ContractStatus;
  title: string;
  amount: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  projectId: string;
  contractId: string | null;
  kind: PaymentKind;
  status: PaymentStatus;
  amount: number;
  dueDate: string | null;
  paidAt: Date | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChangeOrder {
  id: string;
  projectId: string;
  contractId: string | null;
  reason: ChangeOrderReason;
  status: ChangeOrderStatus;
  title: string;
  amountDelta: number;
  approvedAt: Date | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AsTicket {
  id: string;
  projectId: string;
  contractId: string | null;
  phaseId: string | null;
  lineItemId: string | null;
  status: AsTicketStatus;
  priority: AsTicketPriority;
  title: string;
  content: string | null;
  occurredAt: string | null;
  resolvedAt: string | null;
  warrantyExpiresAt: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Attachment {
  id: string;
  projectId: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  kind: AttachmentKind;
  photoKind: PhotoKind | null;
  filename: string;
  contentType: string | null;
  byteSize: number | null;
  blobUrl: string;
  blobPathname: string | null;
  caption: string | null;
  takenAt: string | null;
  linkUrl: string | null;
  sortOrder: number;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewMaterial {
  id: string;
  projectId: string;
  title: string;
  url: string;
  source: string | null;
  memo: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceBundle {
  project: Project;
  phases: Phase[];
  spaces: Space[];
  lineItems: LineItem[];
  quotes: Quote[];
  vendors: Vendor[];
  contracts: Contract[];
  payments: Payment[];
  changeOrders: ChangeOrder[];
  asTickets: AsTicket[];
  attachments: Attachment[];
  reviewMaterials: ReviewMaterial[];
}

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiError = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
};
export type ApiResult<T> = ApiSuccess<T> | ApiError;
