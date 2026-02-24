param(
  [string]$Source = (Resolve-Path ".").Path,
  [string]$Destination = "C:\DEV\pwrx-public-beta",
  [switch]$InitGit
)

$ErrorActionPreference = "Stop"

$excludeDirNames = @(
  ".git",
  ".claude",
  "private",
  "backups",
  "data",
  "tmp",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".pnpm-store",
  ".vscode",
  ".idea"
)

$excludeFileNames = @(
  ".env",
  "docker-compose.local.yml",
  "tmp_activity_minus1.json",
  "nul"
)

function Test-ExcludedPath {
  param(
    [string]$RelativePath,
    [bool]$IsDirectory
  )

  $normalized = $RelativePath -replace '/', '\'
  if ([string]::IsNullOrWhiteSpace($normalized)) {
    return $false
  }

  if ($normalized -like "apps\strava\storage*" ) {
    return $true
  }

  $segments = $normalized.Split('\') | Where-Object { $_ -ne "" }
  foreach ($segment in $segments) {
    if ($excludeDirNames -contains $segment) {
      return $true
    }
  }

  if (-not $IsDirectory) {
    $leaf = Split-Path -Path $normalized -Leaf
    if ($excludeFileNames -contains $leaf) {
      return $true
    }
    if ($leaf -like "*.log") {
      return $true
    }
  }

  return $false
}

if (Test-Path -LiteralPath $Destination) {
  Remove-Item -LiteralPath $Destination -Recurse -Force
}
New-Item -ItemType Directory -Path $Destination | Out-Null

$sourceRoot = (Resolve-Path -LiteralPath $Source).Path

Get-ChildItem -LiteralPath $sourceRoot -Force -Recurse | ForEach-Object {
  $fullPath = $_.FullName
  $relativePath = $fullPath.Substring($sourceRoot.Length).TrimStart('\')
  if (-not $relativePath) {
    return
  }

  if (Test-ExcludedPath -RelativePath $relativePath -IsDirectory $_.PSIsContainer) {
    return
  }

  $targetPath = Join-Path $Destination $relativePath

  if ($_.PSIsContainer) {
    if (-not (Test-Path -LiteralPath $targetPath)) {
      New-Item -ItemType Directory -Path $targetPath | Out-Null
    }
    return
  }

  $targetDir = Split-Path -Path $targetPath -Parent
  if (-not (Test-Path -LiteralPath $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  }
  Copy-Item -LiteralPath $fullPath -Destination $targetPath -Force
}

if ($InitGit) {
  git -C $Destination init -b main | Out-Null
}

Write-Output "Public snapshot created: $Destination"
