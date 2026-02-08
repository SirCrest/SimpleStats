param(
  [string]$Version = "",
  [string]$OutputDir = "dist",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Resolve-VersionFromTag([string]$tagOrVersion) {
  if ([string]::IsNullOrWhiteSpace($tagOrVersion)) {
    return ""
  }
  if ($tagOrVersion.StartsWith("v")) {
    return $tagOrVersion.Substring(1)
  }
  return $tagOrVersion
}

function Remove-PathWithRetry([string]$path, [int]$attempts = 8, [int]$delayMs = 250) {
  if (-not (Test-Path $path)) {
    return
  }
  for ($i = 1; $i -le $attempts; $i++) {
    try {
      Remove-Item $path -Force -Recurse -ErrorAction Stop
      return
    }
    catch {
      if ($i -eq $attempts) {
        throw
      }
      Start-Sleep -Milliseconds $delayMs
    }
  }
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$pluginId = "com.crest.simplestats.sdPlugin"
$pluginDir = Join-Path $repoRoot $pluginId
$manifestPath = Join-Path $pluginDir "manifest.json"
$helperProject = Join-Path $repoRoot "native\SimpleStatsHelper\SimpleStatsHelper.csproj"
$helperPublishDir = Join-Path $repoRoot "native\SimpleStatsHelper\bin\Release\net8.0\win-x64\publish"
$helperExe = Join-Path $helperPublishDir "SimpleStatsHelper.exe"
$helperPdb = Join-Path $helperPublishDir "SimpleStatsHelper.pdb"
$distDir = Join-Path $repoRoot $OutputDir
$packageRoot = Join-Path $distDir $pluginId

if (-not (Test-Path $manifestPath)) {
  throw "Manifest not found at '$manifestPath'."
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifestVersion = [string]$manifest.Version
if ([string]::IsNullOrWhiteSpace($manifestVersion)) {
  throw "Manifest version is missing."
}

$requestedVersion = Resolve-VersionFromTag $Version
if ([string]::IsNullOrWhiteSpace($requestedVersion)) {
  $requestedVersion = $manifestVersion
}

if ($requestedVersion -ne $manifestVersion) {
  throw "Version mismatch: requested '$requestedVersion' but manifest has '$manifestVersion'."
}

Write-Host "Packaging SimpleStats release $manifestVersion"
Push-Location $repoRoot
try {
  if (-not $SkipBuild) {
    Write-Host "Running npm build..."
    & npm run build
    if ($LASTEXITCODE -ne 0) {
      throw "npm run build failed with code $LASTEXITCODE."
    }

    Write-Host "Publishing helper (win-x64 single-file)..."
    & dotnet publish $helperProject -c Release -r win-x64 --self-contained true `
      /p:PublishSingleFile=true `
      /p:IncludeNativeLibrariesForSelfExtract=true `
      /p:EnableCompressionInSingleFile=true
    if ($LASTEXITCODE -ne 0) {
      throw "dotnet publish failed with code $LASTEXITCODE."
    }
  }

  if (-not (Test-Path $helperExe)) {
    throw "Helper executable not found at '$helperExe'."
  }

  New-Item -ItemType Directory -Path $distDir -Force | Out-Null
  if (Test-Path $packageRoot) {
    Remove-Item $packageRoot -Recurse -Force
  }

  New-Item -ItemType Directory -Path $packageRoot, (Join-Path $packageRoot "bin"), (Join-Path $packageRoot "imgs"), (Join-Path $packageRoot "libs"), (Join-Path $packageRoot "ui") -Force | Out-Null

  Copy-Item (Join-Path $pluginDir "manifest.json") (Join-Path $packageRoot "manifest.json") -Force
  Copy-Item (Join-Path $pluginDir "imgs\*") (Join-Path $packageRoot "imgs") -Recurse -Force
  Copy-Item (Join-Path $pluginDir "libs\*") (Join-Path $packageRoot "libs") -Recurse -Force
  Copy-Item (Join-Path $pluginDir "ui\*") (Join-Path $packageRoot "ui") -Recurse -Force
  Copy-Item (Join-Path $pluginDir "bin\plugin.js") (Join-Path $packageRoot "bin\plugin.js") -Force
  Copy-Item (Join-Path $pluginDir "bin\plugin.js.map") (Join-Path $packageRoot "bin\plugin.js.map") -Force
  Copy-Item $helperExe (Join-Path $packageRoot "bin\SimpleStatsHelper.exe") -Force
  if (Test-Path $helperPdb) {
    Copy-Item $helperPdb (Join-Path $packageRoot "bin\SimpleStatsHelper.pdb") -Force
  }

  $zipPath = Join-Path $distDir ("SimpleStats-v$manifestVersion-" + [Guid]::NewGuid().ToString("N") + ".zip")
  $assetPath = Join-Path $distDir "SimpleStats-v$manifestVersion.streamDeckPlugin"
  Remove-PathWithRetry $assetPath

  Compress-Archive -Path $packageRoot -DestinationPath $zipPath -CompressionLevel Optimal
  Move-Item -Path $zipPath -Destination $assetPath -Force

  $asset = Get-Item $assetPath
  Write-Host "Created package: $($asset.FullName) ($($asset.Length) bytes)"
  Write-Output $asset.FullName
}
finally {
  Pop-Location
}
