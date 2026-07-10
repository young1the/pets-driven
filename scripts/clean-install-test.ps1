#Requires -Version 5.1
# Reproduces a user installing on a fresh machine for the first time.
# Build -> remove old version -> unattended install -> delete app state -> launch.
#
# Runs unelevated, on purpose. The NSIS installer is built with
# installMode: "currentUser", so it installs under %LOCALAPPDATA% and never
# raises a UAC prompt. If this script ever needs elevation, something has
# regressed in tauri.conf.json.
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$NsisDir = Join-Path $RepoRoot "apps\desktop\src-tauri\target\release\bundle\nsis"
$ProductName = "Pets Driven"
# The generated NSIS script (installer.nsi) sets !define MAINBINARYNAME
# "pets-driven" and launches "$INSTDIR\${MAINBINARYNAME}.exe". The installed
# binary is named after this constant, not after $ProductName.
$MainBinaryName = "pets-driven"
$Identifier = "com.petsdriven.desktop"

$UserUninstallRoot = "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"

# Read-only. A per-machine install predating the NSIS switch still lives here,
# and removing it would need the administrator rights this script exists to avoid.
$MachineUninstallRoots = @(
  "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
)

# NSIS writes InstallLocation and UninstallString as $\"...$\", which bakes
# literal quote characters into the registry value. Strip them here, once,
# so no caller has to remember to. Trailing backslashes go too, because the
# _?= uninstall switch rejects a path that ends in one. Assumes the value is
# never a bare drive root ("C:\"), which TrimEnd('\') would turn into the
# drive-relative "C:" - not reachable today since a silent /S install defaults
# to %LOCALAPPDATA%\Pets Driven.
function Get-TrimmedRegistryPath($Value) {
  if (-not $Value) { return $Value }
  return $Value.Trim('"').TrimEnd('\')
}

function Find-InstalledUnder($Root) {
  if (-not (Test-Path $Root)) { return }
  foreach ($key in Get-ChildItem $Root) {
    $props = Get-ItemProperty -Path $key.PSPath -ErrorAction SilentlyContinue
    if ($props.DisplayName -eq $ProductName) {
      [pscustomobject]@{
        Key = $key.PSChildName
        InstallLocation = Get-TrimmedRegistryPath $props.InstallLocation
        UninstallString = Get-TrimmedRegistryPath $props.UninstallString
        QuietUninstallString = $props.QuietUninstallString
      }
    }
  }
}

function Find-InstalledForUser {
  Find-InstalledUnder $UserUninstallRoot
}

# Splits a command line of the form `"C:\path with spaces\file.exe" arg1 arg2`
# (or an unquoted `C:\path\file.exe arg1`) into its executable and the rest.
# Only used for QuietUninstallString, which may carry its own arguments.
function Split-CommandLine($CommandLine) {
  if ($CommandLine.StartsWith('"')) {
    $closingQuote = $CommandLine.IndexOf('"', 1)
    $filePath = $CommandLine.Substring(1, $closingQuote - 1)
    $arguments = $CommandLine.Substring($closingQuote + 1).Trim()
  } else {
    $parts = $CommandLine.Split(' ', 2)
    $filePath = $parts[0]
    $arguments = if ($parts.Count -gt 1) { $parts[1] } else { "" }
  }
  [pscustomobject]@{ FilePath = $filePath; Arguments = $arguments }
}

# Installer.nsi (as generated today) never writes QuietUninstallString, only
# UninstallString, so the fallback branch below is the one that actually
# runs. It appends /S _?=<install dir> as a single raw argument string. Both
# an -ArgumentList array and a raw string leave _?=<path> unquoted here (only
# quoting it yourself would break it); the raw string is used because it
# keeps the construction obvious. That switch must be the last thing on the
# command line and its path must not be quoted. Without it, `uninstall.exe
# /S` copies itself to %TEMP% and returns immediately while the real removal
# continues in the background (this is exactly why installer.nsi itself
# appends "_?=$INSTDIR" before its own ExecWait) - the install that follows
# here would then race a still-running uninstall. If QuietUninstallString
# ever does appear (a future Tauri could start writing one), prefer it, but
# it must be made synchronous too.
function Invoke-QuietUninstall($Entry, $InstallLocation) {
  if ($Entry.QuietUninstallString) {
    $parsed = Split-CommandLine $Entry.QuietUninstallString
    $filePath = $parsed.FilePath
    $argumentList = $parsed.Arguments
    if ($argumentList -notmatch '_\?=') {
      if (-not $InstallLocation) {
        throw "Cannot build a synchronous uninstall command: QuietUninstallString has no matching InstallLocation."
      }
      $argumentList = "$argumentList _?=$InstallLocation".Trim()
    }
  } elseif ($Entry.UninstallString) {
    if (-not $InstallLocation) {
      throw "Cannot build a synchronous uninstall command: registry entry has no InstallLocation."
    }
    $filePath = $Entry.UninstallString
    $argumentList = "/S _?=$InstallLocation"
  } else {
    throw "Registry entry for '$ProductName' has neither QuietUninstallString nor UninstallString."
  }

  if ($argumentList) {
    $proc = Start-Process -FilePath $filePath -ArgumentList $argumentList -Wait -PassThru
  } else {
    $proc = Start-Process -FilePath $filePath -Wait -PassThru
  }
  if ($proc.ExitCode -ne 0) {
    throw "Uninstall failed with exit code $($proc.ExitCode)."
  }
}

function Invoke-Executable($FilePath, $Arguments, $What) {
  $proc = Start-Process -FilePath $FilePath -ArgumentList $Arguments -Wait -PassThru
  if ($proc.ExitCode -ne 0) {
    throw "$What failed with exit code $($proc.ExitCode)."
  }
}

Write-Host "==> Building the installer" -ForegroundColor Cyan
Push-Location $RepoRoot
try {
  & pnpm --filter pets-driven tauri build --bundles nsis
  if ($LASTEXITCODE -ne 0) { throw "tauri build failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

# The version is baked into the filename, so the path isn't hardcoded. If a
# stale build is still around it's ambiguous which one to install, so fail.
if (-not (Test-Path $NsisDir -PathType Container)) {
  throw "NSIS bundle directory not found: $NsisDir. Run the build first."
}
$found = @(Get-ChildItem -Path $NsisDir -Filter *-setup.exe)
if ($found.Count -ne 1) {
  throw "Expected exactly one *-setup.exe in $NsisDir but found $($found.Count). Remove stale builds and retry."
}
$SetupPath = $found[0].FullName
Write-Host "==> Built $($found[0].Name)" -ForegroundColor Cyan

# Warn, never act. Uninstalling this would need administrator rights.
foreach ($stale in @($MachineUninstallRoots | ForEach-Object { Find-InstalledUnder $_ })) {
  Write-Warning "A per-machine '$ProductName' is still registered at $($stale.InstallLocation). It predates the NSIS switch and this script will not remove it. Uninstall it once from an elevated shell or Settings > Installed apps."
}

foreach ($existing in @(Find-InstalledForUser)) {
  $installLocation = $existing.InstallLocation
  Write-Host "==> Uninstalling $($existing.Key)" -ForegroundColor Cyan
  Invoke-QuietUninstall $existing $installLocation

  # The reinstall this script performs should reproduce a first install on a
  # fresh machine. With _?=, NSIS deliberately leaves uninstall.exe (and
  # possibly the whole directory) behind, so clean it up ourselves. Guarded
  # below.
  # -LiteralPath throughout: without it these cmdlets read the path as a
  # wildcard pattern, so a registry value of "...\Local\App[1]" would silently
  # resolve to a different directory, "...\Local\App1". The guard below then
  # vouches for a directory the registry never named.
  if ($installLocation -and (Test-Path -LiteralPath $installLocation -PathType Container)) {
    $hasContents = @(Get-ChildItem -LiteralPath $installLocation -Force -ErrorAction SilentlyContinue).Count -gt 0
    if ($hasContents) {
      # A path read out of the registry must never be handed to
      # Remove-Item -Recurse -Force unchecked. A bare StartsWith is not
      # enough: "C:\...\AppData\LocalLow\Evil" passes a prefix test against
      # "C:\...\AppData\Local" (no separator boundary), and if LOCALAPPDATA
      # were ever empty every path would "start with" it. So require
      # LOCALAPPDATA to be set, and compare against its full path with a
      # single trailing separator forced onto both sides. Equality is
      # rejected too: %LOCALAPPDATA% itself is not a leftover install
      # directory, and deleting it would take the user's whole Local AppData
      # tree.
      if ([string]::IsNullOrEmpty($env:LOCALAPPDATA)) {
        throw "Refusing to delete leftover install directory: %LOCALAPPDATA% is not set."
      }
      $resolved = (Resolve-Path -LiteralPath $installLocation).ProviderPath
      $localAppDataFull = [IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd('\')
      $localAppDataRoot = $localAppDataFull + '\'
      if ($resolved.TrimEnd('\').Equals($localAppDataFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to delete %LOCALAPPDATA% itself, which is not a leftover install directory: $resolved"
      }
      if (-not ($resolved + '\').StartsWith($localAppDataRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to delete leftover install directory outside LOCALAPPDATA: $resolved"
      }
      # Delete $resolved, not $installLocation: the guard above vouched for the
      # former. Passing the raw registry string back in would re-glob it.
      Remove-Item -Recurse -Force -LiteralPath $resolved
      Write-Host "==> Removed leftover $resolved" -ForegroundColor Cyan
    }
  }
}

Write-Host "==> Installing" -ForegroundColor Cyan
Invoke-Executable $SetupPath @("/S") "Install"

# Wiping state after the install, not before, keeps a failed install from
# costing the developer their data: installing does not create these
# directories, the app creates them on its first run. So a clean first run is
# still what gets launched below.
#
# These are the app_data_dir that state_store.rs writes to and the directory
# where WebView2 keeps localStorage. ~/.codex/pets is untouched — it's a
# user-owned asset that pet_assets.rs only reads.
foreach ($dir in @((Join-Path $env:APPDATA $Identifier), (Join-Path $env:LOCALAPPDATA $Identifier))) {
  if (Test-Path $dir) {
    Remove-Item -Recurse -Force $dir
    Write-Host "==> Removed $dir" -ForegroundColor Cyan
  }
}

$installed = @(Find-InstalledForUser)
if ($installed.Count -ne 1) {
  throw "Expected one per-user entry for '$ProductName' after install but found $($installed.Count)."
}

$location = $installed[0].InstallLocation
if (-not $location -or -not (Test-Path $location)) {
  throw "Installed entry has no usable InstallLocation: '$location'"
}

# By name, not "the only .exe": an NSIS install directory also holds
# uninstall.exe, and launching that would be a spectacular way to pass.
$exe = Join-Path $location "$MainBinaryName.exe"
if (-not (Test-Path $exe)) {
  throw "Expected $exe after install but it is missing."
}

Write-Host "==> Launching $exe" -ForegroundColor Green
Start-Process $exe
