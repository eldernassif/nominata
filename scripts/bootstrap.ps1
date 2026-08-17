# scripts/bootstrap.ps1 - F0.7, sobe o ambiente local do zero (plano 9.1,
# com a divergencia declarada na evidencia F0.0): o stack em uso MANTEM o
# Studio - o contrato F0.0 exige Studio acessivel - e exclui analytics e
# edge-runtime, que nenhuma verificacao usa e pesam memoria; logflare, vector
# e imgproxy ficam de fora como no plano 9.1.
# Idempotente: com o banco ja de pe, pula o start e so regenera o .env.local
# (.env.* esta no .gitignore - credencial de dev local jamais versionada).
# ASCII puro de proposito: o PowerShell 5.1 le .ps1 sem BOM na codepage ANSI
# e acentos viram tokens quebrados no parse.
$ErrorActionPreference = 'Stop'

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Desktop nao esta rodando. Abra o Docker Desktop e repita.'
}

$bancoDePe = docker ps --filter 'name=supabase_db_nominata' --format '{{.Names}}'
if ($bancoDePe -match 'supabase_db_nominata') {
  Write-Output 'stack ja rodando (banco supabase_db_nominata) - start ignorado'
} else {
  npx supabase start -x logflare,vector,imgproxy,analytics,edge-runtime
  if ($LASTEXITCODE -ne 0) {
    throw 'supabase start falhou - veja a saida acima.'
  }
}

# Sem pipe e sem Set-Content/Out-File, de proposito: o Out-File quebra linhas
# na largura do console (o status tem linhas de ~1500 caracteres), e o
# Set-Content -Encoding utf8 do PS 5.1 grava COM BOM — o CLI do Supabase le
# este arquivo como environment file e recusa o BOM ("unexpected character
# in variable name" no db diff). UTF-8 SEM BOM e o unico formato aceito.
$caminhoEnv = Join-Path (Split-Path -Parent $PSScriptRoot) '.env.local'
# o arquivo e artefato DESTE script (a unica fonte e o status -o env); um
# legado corrompido — ex.: o BOM de um Set-Content antigo — quebraria o CLI
# no boot, antes do status rodar. Remove e regenera do zero.
if (Test-Path $caminhoEnv) {
  Remove-Item -Path $caminhoEnv -Force
}
$envConteudo = npx supabase status -o env
if ($LASTEXITCODE -ne 0) {
  throw 'supabase status falhou - veja a saida acima.'
}
[System.IO.File]::WriteAllText(
  $caminhoEnv,
  (($envConteudo -join "`n") + "`n"),
  (New-Object System.Text.UTF8Encoding($false))
)

Write-Output 'pronto: API 54321 | DB 54322 | Studio 54323 | Mailpit 54324'
