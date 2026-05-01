import { getProjectByIdForOwner } from "./projects.repo.js";
import { listPhasesByProject } from "./phases.repo.js";
import { listSpacesByProject } from "./spaces.repo.js";
import { listLineItemsByProject } from "./line-items.repo.js";
import { listQuotesByProject } from "./quotes.repo.js";
import { listVendors } from "./vendors.repo.js";
import { listContractsByProject } from "./contracts.repo.js";
import { listPaymentsByProject } from "./payments.repo.js";
import { listChangeOrdersByProject } from "./change-orders.repo.js";
import { listAsTicketsByProject } from "./as-tickets.repo.js";
import { listAttachmentsByProject } from "./attachments.repo.js";
import { listReviewMaterialsByProject } from "./review-materials.repo.js";
import type { WorkspaceBundle } from "../types/domain.js";

export async function getWorkspaceBundle(
  projectId: string,
  ownerId: string,
): Promise<WorkspaceBundle | null> {
  const project = await getProjectByIdForOwner(projectId, ownerId);
  if (!project) return null;

  const [
    phases,
    spaces,
    lineItems,
    quotes,
    vendors,
    contracts,
    payments,
    changeOrders,
    asTickets,
    attachments,
    reviewMaterials,
  ] = await Promise.all([
    listPhasesByProject(projectId),
    listSpacesByProject(projectId),
    listLineItemsByProject(projectId),
    listQuotesByProject(projectId),
    listVendors(ownerId),
    listContractsByProject(projectId),
    listPaymentsByProject(projectId),
    listChangeOrdersByProject(projectId),
    listAsTicketsByProject(projectId),
    listAttachmentsByProject(projectId),
    listReviewMaterialsByProject(projectId),
  ]);

  return {
    project,
    phases,
    spaces,
    lineItems,
    quotes,
    vendors,
    contracts,
    payments,
    changeOrders,
    asTickets,
    attachments,
    reviewMaterials,
  };
}
