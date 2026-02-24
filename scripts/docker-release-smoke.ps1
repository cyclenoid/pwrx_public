# Docker release smoke test for PWRX
# Usage examples:
#   pwsh ./scripts/docker-release-smoke.ps1
#   pwsh ./scripts/docker-release-smoke.ps1 -SkipStart -ImportFixturePath "C:\data\sample.fit"

param(
    [string]$ComposeFile = "docker-compose.yml",
    [string]$ApiBaseUrl = "http://localhost:3001/api",
    [string]$DashboardUrl = "http://localhost:8088",
    [int]$MaxWaitSeconds = 180,
    [switch]$SkipStart,
    [switch]$SkipImportSmoke,
    [string]$ImportFixturePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Wait-HttpOk([string]$Url, [int]$MaxSeconds) {
    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 10
            if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300) {
                return $res
            }
        } catch {
            Start-Sleep -Seconds 3
        }
    }
    throw "Timeout waiting for HTTP OK: $Url"
}

function New-MinimalGpxFixture {
    $path = Join-Path ([System.IO.Path]::GetTempPath()) ("pwrx-smoke-" + [System.Guid]::NewGuid().ToString("N") + ".gpx")
    $suffix = [System.Guid]::NewGuid().ToString("N").Substring(0, 8)
    $gpx = @'
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="pwrx-smoke" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>PWRX Smoke GPX {SUFFIX}</name>
    <trkseg>
      <trkpt lat="52.520008" lon="13.404954">
        <ele>34.0</ele>
        <time>2026-01-01T10:00:00Z</time>
      </trkpt>
      <trkpt lat="52.520500" lon="13.405500">
        <ele>36.0</ele>
        <time>2026-01-01T10:02:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>
'@
    $gpx = $gpx.Replace('{SUFFIX}', $suffix)
    Set-Content -Path $path -Value $gpx -Encoding UTF8
    return $path
}

function Upload-ImportFile([string]$Url, [string]$Path) {
    $irm = Get-Command Invoke-RestMethod -ErrorAction Stop
    if ($irm.Parameters.ContainsKey("Form")) {
        $file = Get-Item $Path
        return Invoke-RestMethod -Uri $Url -Method Post -Form @{ file = $file } -TimeoutSec 60
    }

    $curl = Get-Command "curl.exe" -ErrorAction SilentlyContinue
    if (-not $curl) {
        $curl = Get-Command "curl" -ErrorAction SilentlyContinue
    }
    if (-not $curl) {
        throw "Neither Invoke-RestMethod -Form nor curl is available for multipart upload."
    }

    $raw = & $curl.Source -sS -X POST -F "file=@$Path" $Url
    if (-not $raw) {
        throw "Empty response from import upload endpoint."
    }
    return $raw | ConvertFrom-Json
}

Require-Command "docker"

Write-Host "=== PWRX Docker Release Smoke ===" -ForegroundColor Cyan
Write-Host "Compose file: $ComposeFile"
Write-Host "API: $ApiBaseUrl"
Write-Host "Dashboard: $DashboardUrl"

if (-not $SkipStart) {
    Write-Host "`n[1/5] Starting Docker stack..." -ForegroundColor Yellow
    docker compose -f $ComposeFile up -d | Out-Host
} else {
    Write-Host "`n[1/5] Skip start (using existing stack)." -ForegroundColor Yellow
}

Write-Host "`n[2/5] Waiting for API health..." -ForegroundColor Yellow
$healthRes = Wait-HttpOk -Url "$ApiBaseUrl/health" -MaxSeconds $MaxWaitSeconds
Write-Host "Health response: $($healthRes.Content)"

Write-Host "`n[3/5] Checking capabilities..." -ForegroundColor Yellow
$capRes = Wait-HttpOk -Url "$ApiBaseUrl/capabilities" -MaxSeconds 60
Write-Host "Capabilities status: $($capRes.StatusCode)"

Write-Host "`n[4/5] Checking dashboard..." -ForegroundColor Yellow
$dashRes = Wait-HttpOk -Url $DashboardUrl -MaxSeconds 60
Write-Host "Dashboard status: $($dashRes.StatusCode)"

if ($SkipImportSmoke) {
    Write-Host "`n[5/5] Skip import smoke (requested)." -ForegroundColor Yellow
    exit 0
}

Write-Host "`n[5/5] Running import smoke..." -ForegroundColor Yellow
$fixtureCreated = $false
$fixturePath = $ImportFixturePath

if (-not $fixturePath) {
    $fixturePath = New-MinimalGpxFixture
    $fixtureCreated = $true
}

if (-not (Test-Path $fixturePath)) {
    throw "Import fixture not found: $fixturePath"
}

try {
    $importRes = Upload-ImportFile -Url "$ApiBaseUrl/import/file" -Path $fixturePath
    $status = [string]($importRes.status)
    $allowed = @("done", "queued", "duplicate")
    if ($allowed -notcontains $status) {
        throw "Unexpected import status: '$status'"
    }
    Write-Host "Import status: $status"

    $importsRes = Invoke-RestMethod -Uri "$ApiBaseUrl/imports?limit=5" -Method Get -TimeoutSec 30
    $count = 0
    if ($importsRes -and $importsRes.imports) {
        $count = @($importsRes.imports).Count
    }
    Write-Host "Recent import runs fetched: $count"
    Write-Host "`nSmoke test passed." -ForegroundColor Green
} finally {
    if ($fixtureCreated -and (Test-Path $fixturePath)) {
        Remove-Item -Path $fixturePath -Force -ErrorAction SilentlyContinue
    }
}
