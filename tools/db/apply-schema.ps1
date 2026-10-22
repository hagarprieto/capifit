<#
.SYNOPSIS
  Aplica o schema do CapiFit em ordem (04 -> 06 migration 001 -> 09 migration 002 [-> seed]) e confere o resultado.
.DESCRIPTION
  Implementa a parte local da história E00-03 (Documento 10). Para aqui na primeira falha.
  A senha NÃO é parâmetro: use a variável de ambiente MYSQL_PWD (lida pelo cliente mysql) ou deixe vazia.
  -Recreate apaga o banco informado e SÓ é aceito em servidor local (127.0.0.1/localhost).
.EXAMPLE
  $env:MYSQL_PWD = '...'; ./tools/db/apply-schema.ps1 -Port 3307 -WithSeed -Recreate
#>
param(
  [string]$DbHost = '127.0.0.1',
  [int]$Port = 3307,
  [string]$User = 'root',
  [string]$Database = 'capifit',
  [string]$Mysql = 'mysql',
  [switch]$WithSeed,
  [switch]$Recreate
)
$ErrorActionPreference = 'Stop'
$docs = (Resolve-Path (Join-Path $PSScriptRoot '../../docs')).Path
$files = @('04_schema_inicial_mysql8.sql', '06_migration_001_reconciliacao.sql', '09_migration_002_catalogo.sql')
if ($WithSeed) { $files += '09_seed_catalogo.sql' }

$base = @('--no-defaults', '--default-character-set=utf8mb4', "--host=$DbHost", "--port=$Port", "--user=$User")

function Invoke-Sql([string]$sql, [string]$db = '') {
  $args2 = $base + $(if ($db) { @("--database=$db") } else { @() }) + @('--batch', '--skip-column-names', '-e', $sql)
  $out = & $Mysql @args2 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Falha no MySQL: $out" }
  return ($out -join "`n").Trim()
}

if ($Recreate) {
  if ($DbHost -notin @('127.0.0.1', 'localhost', '::1')) { throw '-Recreate só é permitido em servidor local.' }
  Write-Host "Recriando banco '$Database' em $DbHost`:$Port ..."
  Invoke-Sql "DROP DATABASE IF EXISTS ``$Database``" | Out-Null
}

$versao = Invoke-Sql 'SELECT VERSION()'
Write-Host "Servidor: $versao"
if ($versao -match 'MariaDB') { Write-Warning 'MariaDB detectada: o alvo oficial é MySQL 8.0.16+ (Documento 06, D-01). Use apenas para teste de sintaxe.' }

foreach ($f in $files) {
  $path = Join-Path $docs $f
  Write-Host "Aplicando $f ..."
  $cmd = '"' + $Mysql + '" ' + (($base | ForEach-Object { '"' + $_ + '"' }) -join ' ') + ' < "' + $path + '"'
  cmd /c $cmd
  if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar $f" }
}

# Conferência
$tabelas = [int](Invoke-Sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$Database' AND table_type='BASE TABLE'")
$triggers = [int](Invoke-Sql "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='$Database'")
$esperado = @{ tabelas = 36; triggers = 16 }
Write-Host "Tabelas: $tabelas (esperado $($esperado.tabelas)); triggers: $triggers (esperado $($esperado.triggers))"
$ok = ($tabelas -eq $esperado.tabelas) -and ($triggers -eq $esperado.triggers)
if ($WithSeed) {
  $ex = [int](Invoke-Sql 'SELECT COUNT(*) FROM exercicios' $Database)
  $md = [int](Invoke-Sql 'SELECT COUNT(*) FROM modelos_sugestao' $Database)
  $st = [int](Invoke-Sql "SELECT COUNT(*) FROM exercicios WHERE status != 'rascunho'" $Database)
  Write-Host "Exercícios: $ex (esperado 54); modelos: $md (esperado 6); fora de rascunho: $st (esperado 0)"
  $ok = $ok -and ($ex -eq 54) -and ($md -eq 6) -and ($st -eq 0)
}
if (-not $ok) { throw 'Conferência falhou: contagens diferentes do esperado.' }
Write-Host 'Schema aplicado e conferido.' -ForegroundColor Green
