-- ====================================================================
-- NOOR HORIZON TECHNOLOGIES ERP - INVENTORY PRINTS TABLE
-- Migration: 05_inventory_prints.sql
-- Description: Table for storing category/tile prints with full CRUD
-- ====================================================================

CREATE TABLE IF NOT EXISTS inventory_prints (
    id BIGSERIAL PRIMARY KEY,
    category_id BIGINT,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and public access policy
ALTER TABLE inventory_prints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all access on inventory_prints"
ON inventory_prints
FOR ALL
TO public
USING (true)
WITH CHECK (true);
