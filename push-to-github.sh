#!/bin/bash
# Script alternativo para subir cambios (usar en Git Bash)

echo "=================================="
echo "  Subiendo cambios a GitHub"
echo "=================================="
echo ""

# Agregar archivos específicos
echo "Agregando archivos modificados..."
git add frontend/pages/audit.js
git add frontend/pages/dashboard.js
git add frontend/components/ReimbursementForm.js
git add frontend/pages/api/reimbursements/create.js
git add frontend/styles/globals.css
git add .gitignore

echo "✓ Archivos agregados"
echo ""

# Crear commit
echo "Creando commit..."
git commit -m "feat: Mejoras en UI/UX del sistema de auditoría

- Panel lateral del auditor movido a la izquierda con animación
- Panel lateral ya no se cierra al cambiar entre tabs
- Formulario de nuevo reembolso completamente rediseñado
- Agregado campo de descripción/razón del gasto (obligatorio)
- Vista previa de imágenes al subir archivos
- Mejoras visuales con gradientes y animaciones
- Cards interactivas para selección de tipo de gasto
- Validaciones mejoradas en tiempo real
- UX profesional y moderna en todo el formulario"

echo ""

# Push a GitHub
echo "Subiendo a GitHub..."
git push origin main

echo ""
echo "✓ ¡Cambios subidos exitosamente!"
echo "Ver en: https://github.com/cvazzz/auditoria"
