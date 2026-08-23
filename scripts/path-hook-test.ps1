#Requires -Version 5.1
# Exercises the PATH edit the NSIS installer hook performs, against a scratch
# registry key instead of the user's real HKCU\Environment.
#
# The body under test is read out of `installer-hooks.nsh` and un-escaped, not
# copied here: a test holding its own copy of the command would keep passing
# after the hook it is meant to cover changed. What this cannot cover is the
# NSIS side of the same file (that it compiles, and that `$INSTDIR` and the
# doubled quote arrive intact) — build the installer for that, or compile the
# hook on its own with the makensis Tauri downloads.
#
# The cases are the ways this edit destroys a developer's environment when it is
# written the obvious way: a PATH past the NSIS 1024-character string limit read
# with ReadRegStr comes back truncated, an ExpandString value rewritten as a
# plain string freezes %USERPROFILE% into whatever it meant at install time, and
# an append with no comparison grows the value on every upgrade.
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$HookFile = Join-Path $RepoRoot "apps\desktop\src-tauri\installer-hooks.nsh"
$TestKey = "HKCU:\Software\pets-driven-path-hook-test"

if (-not (Test-Path -LiteralPath $HookFile)) { throw "hook file not found: $HookFile" }
$hookSource = Get-Content -LiteralPath $HookFile -Raw

# The single-quoted NSIS string handed to nsExec, then the PowerShell inside the
# -Command "..." within it.
$call = [regex]::Match($hookSource, "(?m)nsExec::ExecToLog\s+'(.*)'\s*$")
if (-not $call.Success) { throw "no nsExec::ExecToLog line in $HookFile" }
$command = [regex]::Match($call.Groups[1].Value, '-Command\s+"(.*)"$')
if (-not $command.Success) { throw "no -Command payload on the nsExec line" }

# NSIS escapes: `$\'` is a literal quote and `$$` a literal dollar. $R0 is the
# install directory the macro puts there.
$Body = $command.Groups[1].Value.Replace('$\' + "'", "'").Replace('$$', '$')

# The two hook macros differ only by the expression that rebuilds the entries.
$ADD = '$kept + $dir'
$REMOVE = '$kept'
foreach ($expression in @($ADD, $REMOVE)) {
  if ($hookSource -notlike "*PDD_SYNC_PATH `"$($expression.Replace('$', '$$'))`"*") {
    throw "no hook macro passes '$expression' — the test is covering an expression nothing uses"
  }
}

function Invoke-Hook($Dir, $Parts) {
  $script = $Body.Replace('$R0', $Dir).Replace('${NEW_PARTS}', $Parts)
  & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command $script
  if ($LASTEXITCODE -ne 0) { throw "the hook exited $LASTEXITCODE" }
}
function Add-Dir($Dir) { Invoke-Hook $Dir $ADD }
function Remove-Dir($Dir) { Invoke-Hook $Dir $REMOVE }

function Reset-Key($Value, $Kind) {
  if (Test-Path $TestKey) { Remove-Item -LiteralPath $TestKey -Recurse -Force }
  New-Item -Path $TestKey -Force | Out-Null
  if ($null -ne $Value) {
    New-ItemProperty -LiteralPath $TestKey -Name "Path" -Value $Value -PropertyType $Kind -Force | Out-Null
  }
}
# Read it back the way the hook does: expanding %VAR% here would hide the bug
# where the literal was lost.
function Get-RawPath {
  $key = Get-Item -LiteralPath $TestKey
  [string]$key.GetValue("Path", "", [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
}
function Get-Kind { (Get-Item -LiteralPath $TestKey).GetValueKind("Path").ToString() }

$failures = 0
function Check($Name, $Condition, $Detail) {
  if ($Condition) { Write-Host "  ok   $Name" }
  else { Write-Host "  FAIL $Name -- $Detail"; $script:failures++ }
}

# The hook runs against HKCU\Environment; point the extracted body at a scratch
# key so a failing run cannot touch the PATH of whoever is running the test.
$Body = $Body.Replace("HKCU:\Environment", $TestKey)
$INSTALL = "C:\Users\dev\AppData\Local\Pets Driven"

try {
  Write-Host "1. a PATH longer than the NSIS 1024-character limit survives intact"
  $long = (1..40 | ForEach-Object { "C:\some\reasonably\long\tool\directory\number-$_\bin" }) -join ";"
  Reset-Key $long "ExpandString"
  Check "the fixture is past the limit" ($long.Length -gt 1024) "length $($long.Length)"
  Add-Dir $INSTALL
  Check "every original entry is still there" ((Get-RawPath).StartsWith($long)) "got $((Get-RawPath).Length) chars, was $($long.Length)"
  Check "the install directory was appended" ((Get-RawPath) -eq "$long;$INSTALL") "tail mismatch"

  Write-Host "2. an expandable entry stays unexpanded, and the value keeps its kind"
  Reset-Key "%USERPROFILE%\bin;C:\tools" "ExpandString"
  Add-Dir $INSTALL
  Check "the %VAR% entry is still literal" ((Get-RawPath) -eq "%USERPROFILE%\bin;C:\tools;$INSTALL") "got $(Get-RawPath)"
  Check "the value is still ExpandString" ((Get-Kind) -eq "ExpandString") "got $(Get-Kind)"

  Write-Host "3. a plain REG_SZ PATH is not promoted behind the user's back"
  Reset-Key "C:\tools" "String"
  Add-Dir $INSTALL
  Check "the value is still String" ((Get-Kind) -eq "String") "got $(Get-Kind)"

  Write-Host "4. reinstalling does not append a second copy"
  Reset-Key "C:\tools" "ExpandString"
  Add-Dir $INSTALL
  Add-Dir $INSTALL
  Add-Dir $INSTALL
  Check "the entry appears exactly once" ((Get-RawPath) -eq "C:\tools;$INSTALL") "got $(Get-RawPath)"

  Write-Host "5. a trailing backslash is the same entry, not a new one"
  Reset-Key "C:\tools;$INSTALL\" "ExpandString"
  Add-Dir $INSTALL
  Check "no duplicate for the slash variant" ((Get-RawPath) -eq "C:\tools;$INSTALL") "got $(Get-RawPath)"

  Write-Host "6. uninstalling takes the entry back out and leaves the rest alone"
  Reset-Key "C:\tools;$INSTALL;D:\other" "ExpandString"
  Remove-Dir $INSTALL
  Check "the entry is gone" ((Get-RawPath) -eq "C:\tools;D:\other") "got $(Get-RawPath)"
  Remove-Dir $INSTALL
  Check "removing it again is a no-op" ((Get-RawPath) -eq "C:\tools;D:\other") "got $(Get-RawPath)"

  Write-Host "7. a user with no PATH value at all gets one"
  Reset-Key $null "ExpandString"
  Add-Dir $INSTALL
  Check "the value was created" ((Get-RawPath) -eq $INSTALL) "got $(Get-RawPath)"
  Check "created as ExpandString" ((Get-Kind) -eq "ExpandString") "got $(Get-Kind)"

  Write-Host "8. an apostrophe in the install path is escaped, not a syntax error"
  # What ${WordReplace} hands the command: the quote already doubled.
  Reset-Key "C:\tools" "ExpandString"
  Add-Dir "C:\Users\O''Brien\AppData\Local\Pets Driven"
  Check "the real path landed on PATH" ((Get-RawPath) -eq "C:\tools;C:\Users\O'Brien\AppData\Local\Pets Driven") "got $(Get-RawPath)"
}
finally {
  if (Test-Path $TestKey) { Remove-Item -LiteralPath $TestKey -Recurse -Force }
}

if ($failures -gt 0) {
  Write-Host ""
  Write-Host "$failures check(s) failed"
  exit 1
}

Write-Host ""
Write-Host "all checks passed"
