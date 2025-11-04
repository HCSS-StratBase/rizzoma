Param(
  [string]$RepoPath = 'C:\\Rizzoma',
  [string]$GDriveDir = 'G:\\My Drive\\Rizzoma-backup'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $RepoPath)) { throw "RepoPath not found: $RepoPath" }
New-Item -ItemType Directory -Force -Path $GDriveDir | Out-Null

$bundle = Join-Path $RepoPath 'rizzoma.bundle'
pushd $RepoPath
git bundle create $bundle --all
popd

Copy-Item -LiteralPath $bundle -Destination (Join-Path $GDriveDir 'rizzoma.bundle') -Force
Write-Host "Backup bundle written to $GDriveDir\rizzoma.bundle"

