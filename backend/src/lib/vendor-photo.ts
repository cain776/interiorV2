import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../../..");
const uploadRoot = resolve(projectRoot, "uploads");
const vendorPhotoDir = resolve(uploadRoot, "vendor-profiles");
const PUBLIC_PREFIX = "/uploads/vendor-profiles/";

// 업체 프로필 사진 — 단일 진실 공급원.
// fastify schema(maxLength)는 이 값을 base64 팽창 ~1.34× 적용해 사용.
// schema 한도와 실제 디코딩 한도가 어긋나면 클라이언트가 schema는 통과한 후 디코딩에서 거부되는
// 모호한 UX 가 나오므로 한 곳에 묶음.
export const MAX_VENDOR_PHOTO_BYTES = 2_000_000;
export const VENDOR_PHOTO_DATA_URL_MAX_LENGTH = Math.ceil(MAX_VENDOR_PHOTO_BYTES * 1.34) + 100;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function isManagedVendorPhotoUrl(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(PUBLIC_PREFIX));
}

export async function saveVendorPhotoDataUrl(
  vendorId: string,
  dataUrl: string,
  _previousUrl: string | null,
): Promise<string> {
  const parsed = parseImageDataUrl(dataUrl);
  const file = Buffer.from(parsed.base64, "base64");
  if (file.length > MAX_VENDOR_PHOTO_BYTES) {
    throw Object.assign(new Error("업체 사진은 2MB 이하로 등록해 주세요."), { statusCode: 400 });
  }

  await mkdir(vendorPhotoDir, { recursive: true });
  const nextUrl = `${PUBLIC_PREFIX}${encodeURIComponent(vendorId)}.${parsed.ext}`;
  await writeFile(resolve(vendorPhotoDir, `${vendorId}.${parsed.ext}`), file);
  return nextUrl;
}

export async function removeVendorPhoto(photoUrl: string | null | undefined): Promise<void> {
  if (!isManagedVendorPhotoUrl(photoUrl)) return;
  const filename = decodeURIComponent(photoUrl!.slice(PUBLIC_PREFIX.length));
  if (!filename || filename.includes("/") || filename.includes("\\")) return;
  await rm(resolve(vendorPhotoDir, filename), { force: true });
}

function parseImageDataUrl(dataUrl: string): { base64: string; ext: string } {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    throw Object.assign(new Error("업체 사진 형식이 올바르지 않습니다."), { statusCode: 400 });
  }
  return {
    base64: match[2]!,
    ext: EXT_BY_MIME[match[1]!]!,
  };
}
