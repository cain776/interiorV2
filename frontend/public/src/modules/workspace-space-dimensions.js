// 공간별 도면 치수 fallback 데이터.
// 현재는 단일 프로젝트(검암서해그랑블) 데이터만. 추후 spaces 테이블에 dimension_label 컬럼을 추가하면
// 이 모듈은 삭제하고 space.dimensionLabel 을 직접 사용한다.

/** @type {Record<string, Record<string, string>>} */
const PROJECT_SPACE_DIMENSIONS = {
  "검암서해그랑블": {
    "전체": "33평 전체 평면도",
    "현관": "1670 x 1940mm",
    "거실": "4700 x 5900mm",
    "주방/식당": "3880 x 3000mm",
    "침실-2": "도면 산출 14.8㎡",
    "침실-3": "도면 산출 8.66㎡",
    "침실-1": "도면 산출 8.95㎡",
    "욕실-1": "1500 x 2100mm",
    "욕실-2": "1760 x 1500mm",
    "발코니-1": "8800 x 2000mm",
    "발코니-2": "3200 x 2000mm",
    "발코니-3": "2900 x 1500mm",
    "전실": "1670 x 1940mm",
    "발코니-4": "3880 x 1500mm",
  },
};

/**
 * 프로젝트명을 키로 사용해 fallback dimension 을 찾는다.
 * 입력 프로젝트명에 등록된 키가 부분 포함되면 매칭 (예: "검암서해그랑블 리모델링" → "검암서해그랑블").
 * @param {string} projectName
 * @param {string} spaceName
 * @returns {string|null}
 */
export function lookupSpaceDimension(projectName, spaceName) {
  for (const key of Object.keys(PROJECT_SPACE_DIMENSIONS)) {
    if (projectName.includes(key)) {
      return PROJECT_SPACE_DIMENSIONS[key]?.[spaceName] ?? null;
    }
  }
  return null;
}
