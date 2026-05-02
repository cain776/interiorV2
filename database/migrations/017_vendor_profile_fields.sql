-- 업체 프로필 확장: 사무실 주소, 회사/모바일 전화, 업체 사진.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS office_address TEXT;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS company_phone TEXT;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS mobile_phone TEXT;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS photo_url TEXT;
