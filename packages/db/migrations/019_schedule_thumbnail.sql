-- Migration 019: Add thumbnail_url column to schedules table
ALTER TABLE schedules ADD COLUMN thumbnail_url TEXT;
