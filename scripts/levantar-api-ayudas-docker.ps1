# Levanta el stack definido en docker-compose.yml en la raiz del repo.
# Pensado para ejecutarlo desde una tarea programada al iniciar sesion en Windows
# (tras arrancar Docker Desktop). Ver web/README.md seccion "Arranque automatico".

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if (-not (Test-Path (Join-Path $RepoRoot "docker-compose.yml"))) {
  throw "No se encontro docker-compose.yml en $RepoRoot"
}

$maxSeconds = 120
$step = 5
$waited = 0

while ($waited -lt $maxSeconds) {
  & docker version --format "{{.Server.Version}}" 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    break
  }
  Start-Sleep -Seconds $step
  $waited += $step
}

if ($waited -ge $maxSeconds) {
  throw "Docker no respondio en ${maxSeconds}s. Comprueba que Docker Desktop este en marcha."
}

& docker compose up -d
if ($LASTEXITCODE -ne 0) {
  throw "docker compose up -d fallo con codigo $LASTEXITCODE"
}
