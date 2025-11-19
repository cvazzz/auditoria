-- Script para verificar si hay reembolsos en la base de datos
-- Ejecuta esto en Supabase Dashboard → SQL Editor

-- 1. Contar todos los reembolsos
SELECT COUNT(*) as total_reembolsos FROM reimbursements;

-- 2. Ver los últimos 10 reembolsos (todos los campos)
SELECT * FROM reimbursements 
ORDER BY created_at DESC 
LIMIT 10;

-- 3. Ver reembolsos con sus perfiles
SELECT 
  r.id,
  r.status,
  r.type,
  r.reported_amount,
  r.detected_amount,
  r.created_at,
  p.full_name,
  p.email,
  p.zone
FROM reimbursements r
LEFT JOIN profiles p ON r.profile_id = p.id
ORDER BY r.created_at DESC
LIMIT 10;

-- 4. Contar reembolsos por estado
SELECT status, COUNT(*) as cantidad
FROM reimbursements
GROUP BY status;

-- 5. Ver si hay registros con los nuevos campos de fraud detection
SELECT 
  id,
  status,
  receipt_type,
  operation_number,
  image_hash,
  fraud_warnings
FROM reimbursements
WHERE receipt_type IS NOT NULL OR image_hash IS NOT NULL
LIMIT 10;
