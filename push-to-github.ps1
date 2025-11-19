# Script para subir cambios al repositorio de GitHub
# Repositorio: https://github.com/cvazzz/auditoria.git

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Subiendo cambios a GitHub" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Verificar si Git está instalado
try {
    $gitVersion = git --version
    Write-Host "✓ Git instalado: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: Git no está instalado" -ForegroundColor Red
    Write-Host "  Instala Git desde: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Paso 1: Verificando archivos modificados..." -ForegroundColor Yellow

# Ver estado actual
git status

Write-Host ""
Write-Host "Paso 2: Agregando archivos al staging (excluyendo MD y SQL)..." -ForegroundColor Yellow

# Agregar solo los archivos específicos que modificamos
git add frontend/pages/audit.js
git add frontend/pages/dashboard.js
git add frontend/components/ReimbursementForm.js
git add frontend/pages/api/reimbursements/create.js
git add frontend/styles/globals.css

Write-Host "✓ Archivos agregados" -ForegroundColor Green

Write-Host ""
Write-Host "Paso 3: Creando commit..." -ForegroundColor Yellow

# Crear commit con mensaje descriptivo
$commitMessage = @"
feat: Mejoras en UI/UX del sistema de auditoría

- Panel lateral del auditor movido a la izquierda con animación
- Panel lateral ya no se cierra al cambiar entre tabs
- Formulario de nuevo reembolso completamente rediseñado
- Agregado campo de descripción/razón del gasto (obligatorio)
- Vista previa de imágenes al subir archivos
- Mejoras visuales con gradientes y animaciones
- Cards interactivas para selección de tipo de gasto
- Validaciones mejoradas en tiempo real
- UX profesional y moderna en todo el formulario
"@

git commit -m $commitMessage

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Commit creado exitosamente" -ForegroundColor Green
} else {
    Write-Host "✗ Error al crear commit" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Paso 4: Subiendo cambios a GitHub..." -ForegroundColor Yellow

# Push a la rama actual
$currentBranch = git branch --show-current
Write-Host "  Rama actual: $currentBranch" -ForegroundColor Cyan

git push origin $currentBranch

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==================================" -ForegroundColor Green
    Write-Host "  ✓ Cambios subidos exitosamente" -ForegroundColor Green
    Write-Host "==================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ver cambios en: https://github.com/cvazzz/auditoria" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "✗ Error al subir cambios" -ForegroundColor Red
    Write-Host "  Verifica tu conexión a internet y credenciales de Git" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Archivos NO incluidos (por seguridad):" -ForegroundColor Yellow
Write-Host "  - Archivos .md (documentación)" -ForegroundColor Gray
Write-Host "  - Archivos .sql (migraciones)" -ForegroundColor Gray
Write-Host "  - Variables de entorno (.env)" -ForegroundColor Gray
Write-Host ""
