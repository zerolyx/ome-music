-- 009: Preserve imported display metadata before the first manual correction.
ALTER TABLE track_metadata_overrides ADD COLUMN original_title TEXT;
ALTER TABLE track_metadata_overrides ADD COLUMN original_artist TEXT;
ALTER TABLE track_metadata_overrides ADD COLUMN original_album TEXT;
