# Script PowerShell para corregir el rol usando Supabase CLI
# Asegúrate de tener instalado Supabase CLI y estar autenticado

# Si tienes supabase CLI instalado:
# supabase db execute --file FIX_SUPERVISOR_ROLE.sql

# O ejecuta directamente:
Write-Host "Ejecuta este comando SQL en Supabase SQL Editor:" -ForegroundColor Yellow
Write-Host ""
Write-Host "UPDATE profiles SET role = 'supervisor' WHERE email = 'test@hotmail.com';" -ForegroundColor Cyan
Write-Host ""
Write-Host "Luego cierra sesión y vuelve a iniciar sesión en la aplicación." -ForegroundColor Green
