-- Add language column to songs table (idempotent)
alter table songs add column if not exists language text;
