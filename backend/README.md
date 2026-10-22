# CapiFit — API (backend)

API REST em PHP 8.2 (contrato: `docs/07_openapi.yaml`; regras: Documentos 05 e 06).

## Atenção: versão do PHP no Windows

Neste computador, o `php` do PATH é o **7.4** (`C:\tools\php74`). O projeto exige **PHP 8.2**: use o do XAMPP,
`C:\xampp\php\php.exe`, sem mudar o PATH (outros projetos podem depender do 7.4).

```powershell
$php = 'C:\xampp\php\php.exe'
& $php C:\ProgramData\ComposerSetup\bin\composer.phar install   # dependências
& $php vendor/bin/phpunit --testsuite unit                       # testes unitários
& $php vendor/bin/phpstan analyse --memory-limit=512M            # análise estática
& $php -S 127.0.0.1:8099 -t public public/index.php              # servidor local de desenvolvimento
```

## Testes de integração (banco)

Rodam só contra um **banco descartável** (deixam linhas de teste). Crie-o com `tools/db/apply-schema.ps1` e informe:

```powershell
$env:DB_HOST='127.0.0.1'; $env:DB_PORT='3307'; $env:DB_NAME='capifit'
$env:DB_USER='capifit_migrator'; $env:DB_PASSWORD='<senha>'; $env:CAPIFIT_ALLOW_DB_TESTS='1'
& $php vendor/bin/phpunit --testsuite integration
```

Sem `CAPIFIT_ALLOW_DB_TESTS=1` eles são ignorados (nunca rodam por acidente em um banco real).

## Configuração

Copie `.env.example` para `.env` (ignorado pelo Git). Em produção, o host virtual deve apontar **somente** para `public/`.
