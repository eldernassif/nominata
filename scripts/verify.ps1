# scripts/verify.ps1 - F0.7, envelope de evidencia do verify (plano 9.2 com
# a emenda de 2026-08-14): roda as SEIS pernas do npm run verify
# INDIVIDUALMENTE - a cadeia do package.json para na primeira falha e nao
# distingue "passou" de "nao ha o que rodar" - e grava a evidencia em
# .evidencia/verify-<timestamp>.txt com, nesta ordem:
#   1. resumo por perna no TOPO (passou / sem conteudo / falhou);
#   2. a saida completa de cada perna;
#   3. EXIT_CODE= na ultima linha.
#
# Perna "sem conteudo" e a que o PROPRIO script da perna declara a ausencia
# com o marcador "AVISO verify:<perna>: SEM CONTEUDO" (correcao F0.4: a
# ausencia so passa declarada, com a tarefa que a preenche - hoje so a e2e,
# que a F0.8 preenche). Os tres gates da F0.7 (anti-fraude, checar-drift,
# cobertura-operacoes) NAO entram nesta cadeia - a F0.9 os liga no CI
# (contrato F0.7: nenhum dos tres entra no verify nesta tarefa).
#
# ASCII puro de proposito: o PowerShell 5.1 le .ps1 sem BOM na codepage ANSI
# e acentos viram tokens quebrados no parse. Compatibilidade 5.1: sem &&,
# $LASTEXITCODE depois de comando nativo, *>&1 para o stderr nativo nao virar
# NativeCommandError, e [Console]::OutputEncoding em UTF-8 para os acentos do
# node nao se corromperem na decodificacao do pipeline.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$data = Get-Date -Format 'yyyyMMdd-HHmmss'
$diretorioEvidencia = Join-Path $raiz '.evidencia'
if (-not (Test-Path $diretorioEvidencia)) {
  New-Item -ItemType Directory -Path $diretorioEvidencia | Out-Null
}
$arquivoEvidencia = Join-Path $diretorioEvidencia "verify-$data.txt"

# a fonte de verdade das seis pernas e o package.json; o comando exato e o de
# cada script verify:<perna> (a cadeia completa continua existindo e e o
# criterio de aceite - este script e o envelope que enxerga perna a perna)
$pernas = @(
  @{ nome = 'types';    descricao = 'tsc --noEmit' },
  @{ nome = 'lint';     descricao = 'eslint . --max-warnings=0' },
  @{ nome = 'db';       descricao = 'supabase db lint && supabase test db' },
  @{ nome = 'unit';     descricao = 'vitest run --project unit' },
  @{ nome = 'contrato'; descricao = 'vitest run --project contrato' },
  @{ nome = 'e2e';      descricao = 'tsx scripts/verify-e2e.ts' }
)

$resultados = @()
foreach ($perna in $pernas) {
  Write-Host ''
  Write-Host ("===== perna {0} ({1}) =====" -f $perna.nome, $perna.descricao) -ForegroundColor Cyan

  $temporario = Join-Path $env:TEMP ("verify-{0}-{1}.txt" -f $perna.nome, $data)
  Push-Location $raiz
  try {
    # cmd /c com 2>&1 DENTRO do cmd: no PowerShell 5.1 o stderr nativo vira
    # ErrorRecord no pipeline e, com ErrorActionPreference=Stop, mata o
    # script no meio de uma perna (aconteceu na primeira execucao real, na
    # perna db, no "Connecting to local database..." do supabase). Fundindo
    # dentro do cmd, o PowerShell so ve stdout - zero NativeCommandError.
    # Tee-Object mostra ao vivo e grava o temporario.
    cmd /c ("npm run {0} 2>&1" -f ("verify:" + $perna.nome)) | Tee-Object -FilePath $temporario
    $codigo = $LASTEXITCODE
  } finally {
    Pop-Location
  }

  $estado = 'falhou'
  if ($codigo -eq 0) {
    $conteudo = Get-Content -Raw -Path $temporario
    if ($conteudo -match 'AVISO verify:\w+: SEM CONTEUDO') {
      $estado = 'sem conteudo'
    } else {
      $estado = 'passou'
    }
  }

  $resultados += @{
    nome       = $perna.nome
    estado     = $estado
    codigo     = $codigo
    temporario = $temporario
  }
  $cor = if ($estado -eq 'falhou') { 'Red' } else { 'Green' }
  Write-Host ("perna {0}: {1} (exit {2})" -f $perna.nome, $estado, $codigo) -ForegroundColor $cor
}

# -------- composicao da evidencia: resumo no topo, saidas, EXIT_CODE no fim --------
$linhas = New-Object 'System.Collections.Generic.List[string]'
$linhas.Add("VERIFY - Nominata - $data (emenda F0.7: resumo por perna no topo)")
$linhas.Add('')
$linhas.Add('RESUMO POR PERNA')
$linhas.Add('----------------')
foreach ($resultado in $resultados) {
  $linhas.Add(('{0,-10} {1}  (exit {2})' -f $resultado.nome, $resultado.estado, $resultado.codigo))
}
$linhas.Add('')
$linhas.Add('Legenda: passou = rodou e ficou verde; sem conteudo = a propria perna')
$linhas.Add("declarou a ausencia com 'AVISO verify:<perna>: SEM CONTEUDO' e a tarefa")
$linhas.Add('que a preenche (a e2e aponta a F0.8); falhou = exit diferente de zero.')
$linhas.Add('Gates da F0.7 (anti-fraude, checar-drift, cobertura-operacoes): fora desta')
$linhas.Add('cadeia por contrato - a F0.9 os liga no CI.')
$linhas.Add('')

foreach ($resultado in $resultados) {
  $linhas.Add('')
  $linhas.Add(('===== perna {0} =====' -f $resultado.nome))
  $linhas.Add('')
  foreach ($linha in (Get-Content -Path $resultado.temporario)) {
    $linhas.Add($linha)
  }
  Remove-Item -Path $resultado.temporario -Force
}

$falhas = @($resultados | Where-Object { $_.estado -eq 'falhou' }).Count
$codigoFinal = if ($falhas -gt 0) { 1 } else { 0 }
$linhas.Add('')
$linhas.Add("EXIT_CODE=$codigoFinal")

# UTF-8 sem BOM: evidencia e para ser lida por grep e colada em commit
[System.IO.File]::WriteAllLines(
  $arquivoEvidencia,
  $linhas,
  (New-Object System.Text.UTF8Encoding($false))
)

Write-Host ''
Write-Host 'RESUMO POR PERNA' -ForegroundColor Cyan
foreach ($resultado in $resultados) {
  $cor = if ($resultado.estado -eq 'falhou') { 'Red' } else { 'Green' }
  Write-Host ('  {0,-10} {1}  (exit {2})' -f $resultado.nome, $resultado.estado, $resultado.codigo) -ForegroundColor $cor
}
Write-Host ''
Write-Host ("evidencia gravada em {0}" -f $arquivoEvidencia)
Write-Host ("EXIT_CODE={0}" -f $codigoFinal)
exit $codigoFinal
