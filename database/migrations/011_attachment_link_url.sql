-- 사진 카드에서 원본 글/상품/참고 페이지로 이동할 수 있는 외부 링크.

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS link_url TEXT;
