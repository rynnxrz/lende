-- Track the storefront image URL last synced from this lookbook zone so a
-- re-sync replaces its own previous upload instead of accumulating crops.
ALTER TABLE pdf_lookbook_items ADD COLUMN IF NOT EXISTS synced_image_url TEXT;
