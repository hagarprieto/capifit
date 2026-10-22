<#
.SYNOPSIS
  Gera um backup lógico do banco (mysqldump) compactado, com soma de verificação SHA-256 e relatório de contagens.
.DESCRIPTION
  Parte da história E00-07 (Documento 12 §4). Consistente (--single-transaction), com rotinas e triggers, em UTF-8.
  Saída: <OutDir>/<banco>_<AAAAMMDD_HHMMSS>.sql.gz + .sha256 + .contagens.json (linhas por tabela, para conferir a restauração).
  Senha: variável de ambiente MYSQL_PWD (nunca por parâmetro). Guarde os backups FORA do repositório e do servidor do banco.
.EXAMPLE
  $env:MYSQL_PWD='...'; ./tools/db/backup.ps1 -Port 3307 -User capifit_migrator -OutDir D:\backups\capifit
#>
param(
  [string]$DbHost = '127.0.0.1',
  [int]$Port = 3307,
  [string]$User = 'root',
  [string]$Database = 'capifit',
  [string]$OutDir = '',
  [string]$Mysql = 'mysql',
  [string]$Mysqldump = 'mysqldump'
)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Requer PowerShell 7+ (pwsh).' }
if (-not $OutDir) { throw 'Informe -OutDir (pasta fora do repositório).' }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$outFull = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir)
if ($outFull.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw "Não grave backups dentro do repositório: $outFull" }
New-Item -ItemType Directory -Force -Path $outFull | Out-Null

$conn = @('--no-defaults', "--host=$DbHost", "--port=$Port", "--user=$User")
$flavor = & $Mysql @conn --batch --skip-column-names -e 'SELECT VERSION()' 2>&1
if ($LASTEXITCODE -ne 0) { throw "Não foi possível conectar: $flavor" }

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$base = Join-Path $outFull "${Database}_$stamp"
$sql = "$base.sql"
$dumpArgs = $conn + @('--default-character-set=utf8mb4', '--single-transaction', '--routines', '--triggers', '--events', "--result-file=$sql")
# Opção só existe no MySQL (evita exigir o privilégio PROCESS para tablespaces); a MariaDB não a reconhece.
if ($flavor -notmatch 'MariaDB') { $dumpArgs += '--no-tablespaces' }
$dumpArgs += $Database

$watch = [System.Diagnostics.Stopwatch]::StartNew()
& $Mysqldump @dumpArgs
if ($LASTEXITCODE -ne 0) { Remove-Item -Force -ErrorAction SilentlyContinue $sql; throw 'mysqldump falhou.' }

# Compactação (GZip) e soma de verificação
$gz = "$base.sql.gz"
$in = [System.IO.File]::OpenRead($sql)
try {
  $out = [System.IO.File]::Create($gz)
  try {
    $zip = [System.IO.Compression.GZipStream]::new($out, [System.IO.Compression.CompressionLevel]::Optimal)
    try { $in.CopyTo($zip) } finally { $zip.Dispose() }
  } finally { $out.Dispose() }
} finally { $in.Dispose() }
Remove-Item -Force $sql
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $gz).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$gz.sha256" -Value "$hash  $(Split-Path -Leaf $gz)" -Encoding ascii

# Contagens por tabela (referência para conferir a restauração)
$tables = & $Mysql @conn --batch --skip-column-names -e "SELECT table_name FROM information_schema.tables WHERE table_schema='$Database' AND table_type='BASE TABLE' ORDER BY table_name"
$counts = [ordered]@{}
foreach ($t in $tables) { $counts[$t] = [int](& $Mysql @conn --batch --skip-column-names -e "SELECT COUNT(*) FROM ``$Database``.``$t``") }
$triggers = [int](& $Mysql @conn --batch --skip-column-names -e "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='$Database'")
[ordered]@{ banco = $Database; servidor = $flavor; gerado_em = (Get-Date).ToString('o'); triggers = $triggers; linhas = $counts } |
  ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$gz.contagens.json" -Encoding utf8
$watch.Stop()

$size = [math]::Round((Get-Item $gz).Length / 1KB, 1)
Write-Host "Backup: $gz ($size KB) em $([math]::Round($watch.Elapsed.TotalSeconds, 1)) s"
Write-Host "SHA-256: $hash"
$gz
