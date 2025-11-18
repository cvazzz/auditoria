-- Agregar columnas para detección de fraude y validación de recibos
ALTER TABLE reimbursements 
ADD COLUMN IF NOT EXISTS image_hash TEXT,
ADD COLUMN IF NOT EXISTS operation_number TEXT,
ADD COLUMN IF NOT EXISTS receipt_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS receipt_type TEXT DEFAULT 'UNKNOWN',
ADD COLUMN IF NOT EXISTS fraud_warnings JSONB DEFAULT '[]'::jsonb;

-- Índices para búsqueda rápida de duplicados
CREATE INDEX IF NOT EXISTS idx_image_hash ON reimbursements(image_hash);
CREATE INDEX IF NOT EXISTS idx_operation_number ON reimbursements(operation_number);
CREATE INDEX IF NOT EXISTS idx_receipt_type ON reimbursements(receipt_type);

-- Comentarios
COMMENT ON COLUMN reimbursements.image_hash IS 'Hash SHA256 de la imagen para detectar duplicados';
COMMENT ON COLUMN reimbursements.operation_number IS 'Número de operación extraído del recibo (Yape, DiDi, etc)';
COMMENT ON COLUMN reimbursements.receipt_date IS 'Fecha extraída del recibo por OCR';
COMMENT ON COLUMN reimbursements.receipt_type IS 'Tipo de recibo: YAPE_TRANSACTION, DIDI_ACCEPTED, DIDI_COMPLETED, BEAT_COMPLETED, UBER_RECEIPT, INVOICE, DIDI_NEGOTIATION, etc';
COMMENT ON COLUMN reimbursements.fraud_warnings IS 'Array de advertencias de fraude detectadas';
