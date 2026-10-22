<#
.SYNOPSIS
  Restaura um backup gerado por backup.ps1 em um banco SEPARADO e confere o resultado (simulado de restauração).
.DESCRIPTION
  Parte da história E00-07 (Documento 12 §4). Verifica o SHA-256, recria o banco de destino (recusa o banco de
  origem e só apaga/recria o destino em servidor local), importa, e confere tabelas, triggers e linhas por tabela
  com o arquivo .contagens.json. Informa o tempo total (RTO medido).
  Os DEFINER do dump são removidos por padrão, para restaurar com um usuário comum (sem SUPER).
  Limitação: o dump é lido inteiro em memória; para bancos grandes, trocar por streaming.
.EXAMPLE
  $env:MYSQL_PWD='...'; ./tools/db/restore.ps1 -BackupFile D:\backups\capifit\capifit_20261022_120000.sql.gz -TargetDatabase capifit_restore -Port 3307
#>
param(
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [Parameter(Mandatory = $true)][string]$TargetDatabase,
  [string]$DbHost = '127.0.0.1',
  [int]$Port = 3307,
  [string]$User = 'root',
  [string]$Mysql = 'mysql',
  [switch]$KeepDefiner
)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Requer PowerShell 7+ (pwsh).' }
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if ($TargetDatabase -notmatch '^[A-Za-z0-9_]{1,64}$') { throw 'Nome de banco de destino inválido.' }
if (-not (Test-Path -LiteralPath $BackupFile)) { throw "Backup não encontrado: $BackupFile" }
if ($DbHost -notin @('127.0.0.1', 'localhost', '::1')) { throw 'Este script só recria o banco de destino em servidor local.' }

$meta = $null
$metaPath = "$BackupFile.contagens.json"
if (Test-Path -LiteralPath $metaPath) { $meta = Get-Content -Raw -LiteralPath $metaPath | ConvertFrom-Json }
if ($meta -and $meta.banco -eq $TargetDatabase) { throw "O destino ($TargetDatabase) é o banco de origem do backup: use outro nome." }

$watch = [System.Diagnostics.Stopwatch]::StartNew()

# 1) Integridade do arquivo
$shaPath = "$BackupFile.sha256"
if (-not (Test-Path -LiteralPath $shaPath)) { throw 'Arquivo .sha256 ausente: não dá para garantir a integridade.' }
$expected = ((Get-Content -Raw -LiteralPath $shaPath).Trim() -split '\s+')[0].ToLowerInvariant()
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $BackupFile).Hash.ToLowerInvariant()
if ($expected -ne $actual) { throw 'SHA-256 diferente: o backup está corrompido ou foi alterado.' }
Write-Host 'Integridade do arquivo: OK (SHA-256 confere).'

# 2) Descompactar
$reader = [System.IO.StreamReader]::new([System.IO.Compression.GZipStream]::new([System.IO.File]::OpenRead($BackupFile), [System.IO.Compression.CompressionMode]::Decompress), [System.Text.Encoding]::UTF8)
try { $sqlText = $reader.ReadToEnd() } finally { $reader.Dispose() }
if (-not $KeepDefiner) { $sqlText = [regex]::Replace($sqlText, '/\*!\d+ DEFINER=`[^`]+`@`[^`]+`\*/ ?', '') }

# 3) Recriar o destino e importar
$conn = @('--no-defaults', '--default-character-set=utf8mb4', "--host=$DbHost", "--port=$Port", "--user=$User")
& $Mysql @conn --batch -e "DROP DATABASE IF EXISTS ``$TargetDatabase``; CREATE DATABASE ``$TargetDatabase`` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar o banco de destino.' }
$sqlText | & $Mysql @conn "--database=$TargetDatabase"
if ($LASTEXITCODE -ne 0) { throw 'A importação falhou.' }

# 4) Conferência
function Invoke-Scalar([string]$sql) { [string](& $Mysql @conn --batch --skip-column-names -e $sql) }
$problems = @()
$tables = (& $Mysql @conn --batch --skip-column-names -e "SELECT table_name FROM information_schema.tables WHERE table_schema='$TargetDatabase' AND table_type='BASE TABLE' ORDER BY table_name")
$triggers = [int](Invoke-Scalar "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='$TargetDatabase'")
Write-Host "Restaurado em '$TargetDatabase': $($tables.Count) tabelas, $triggers triggers."
if ($meta) {
  $names = @($meta.linhas.PSObject.Properties.Name)
  if ($tables.Count -ne $names.Count) { $problems += "tabelas: $($tables.Count) (esperado $($names.Count))" }
  if ($triggers -ne [int]$meta.triggers) { $problems += "triggers: $triggers (esperado $($meta.triggers))" }
  foreach ($n in $names) {
    $got = [int](Invoke-Scalar "SELECT COUNT(*) FROM ``$TargetDatabase``.``$n``")
    if ($got -ne [int]$meta.linhas.$n) { $problems += "linhas em ${n}: $got (esperado $($meta.linhas.$n))" }
  }
} else {
  Write-Warning 'Sem .contagens.json: conferência de linhas não realizada.'
}
$watch.Stop()
if ($problems.Count) { throw ('Restauração com divergências: ' + ($problems -join '; ')) }
Write-Host "Restauração conferida em $([math]::Round($watch.Elapsed.TotalSeconds, 1)) s (RTO medido neste ambiente)." -ForegroundColor Green
