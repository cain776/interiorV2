// 워크스페이스 모달 허브. workspace.js 의 단일 import 진입점.
// 실제 구현은 영역별로 3개 파일에 분리:
//   -structure: 고려사항/공정/공간/항목/사이드바
//   -quote: 견적/업체
//   -photo: 사진 업로드/수정/정렬/삭제

export {
  openConsiderationModal,
  updateConsideration,
  moveConsideration,
  deleteConsideration,
  openPhaseModal,
  deleteSelectedPhase,
  openSpaceModal,
  deleteSelectedSpace,
  moveSidebar,
  openLineItemModal,
  deleteSelectedLineItem,
  moveLineItem,
} from "./workspace-modals-structure.js";

export {
  reorderConsideration,
  reorderLineItem,
  reorderSidebarItem,
} from "./workspace-reorder.js";

export {
  openQuoteModal,
  deleteSelectedQuote,
  adoptSelectedQuote,
  openVendorModal,
} from "./workspace-modals-quote.js";

export {
  openPhotoModal,
  openPhotoEditModal,
  movePhoto,
  swapPhotos,
  deletePhoto,
} from "./workspace-modals-photo.js";
