; pets-driven NSIS installer hooks: keep the bundled `pdd` CLI on the user's PATH.
;
; The `pdd` sidecar (bundle.externalBin) is installed next to the app executable
; in $INSTDIR, so putting $INSTDIR on the user PATH is what makes `pdd` runnable
; from any terminal. Install mode is currentUser, so that is HKCU\Environment.
;
; IMPORTANT: the edit is delegated to PowerShell instead of being done here,
; because NSIS cannot safely read this particular value. The toolchain Tauri
; downloads is built with NSIS_MAX_STRLEN=1024 (`makensis /HDRINFO` on NSIS
; v3.11 confirms it), so ReadRegStr silently truncates a user PATH longer than
; that — and writing the truncated value back is how a developer's environment
; gets eaten. Every developer this app ships to is exactly the user whose PATH
; runs long. PowerShell has no such limit, compares the entries so a reinstall
; cannot append a second copy, and puts the value back under the kind it already
; had, so a PATH holding %USERPROFILE% stays expandable rather than being frozen
; into a literal.
;
; Failure is deliberately non-fatal: a blocked or missing PowerShell costs the
; user a PATH entry — `pdd.exe` still ships, and still runs from $INSTDIR — and
; that is not worth failing an install over.

!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "WordFunc.nsh"

; One registry edit, driven from PowerShell. NEW_PARTS is the expression that
; builds the resulting entry list out of `$kept` (the current PATH minus this
; install directory), so adding and removing differ by that expression alone and
; the comparison that makes both idempotent is written once.
;
; `$$` is a literal dollar and `$\'` a literal quote — everything the installer
; hands to PowerShell has to survive NSIS's own expansion first.
!macro PDD_SYNC_PATH NEW_PARTS
  Push $R0
  Push $R1
  ; A PowerShell single-quoted literal escapes a quote by doubling it. Usernames
  ; do contain apostrophes, and $INSTDIR is under the user profile here.
  ${WordReplace} "$INSTDIR" "'" "''" "+" $R0
  nsExec::ExecToLog 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$ErrorActionPreference = $\'Stop$\'; $$dir = $\'$R0$\'; $$key = Get-Item -LiteralPath $\'HKCU:\Environment$\'; try { $$kind = [string]$$key.GetValueKind($\'Path$\') } catch { $$kind = $\'ExpandString$\' }; $$raw = [string]$$key.GetValue($\'Path$\', $\'$\', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); $$kept = @($$raw -split $\';$\' | Where-Object { $$_ -ne $\'$\' -and $$_.TrimEnd($\'\$\') -ne $$dir.TrimEnd($\'\$\') }); $$new = (@(${NEW_PARTS}) -join $\';$\'); if ($$new -ne $$raw) { New-ItemProperty -LiteralPath $\'HKCU:\Environment$\' -Name $\'Path$\' -Value $$new -PropertyType $$kind -Force | Out-Null }"'
  Pop $R1 ; nsExec's exit code: see the note above on why it is not checked.
  Pop $R1
  Pop $R0
  ; Newly launched processes read the changed PATH; terminals already open keep
  ; the old one until they are reopened.
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Putting the pdd CLI on your PATH..."
  !insertmacro PDD_SYNC_PATH "$$kept + $$dir"
!macroend

; Take the entry back out on the way out. Without this an uninstall leaves a
; dead directory on the user's PATH forever, and this app is one a developer may
; well try and drop.
!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Taking the pdd CLI off your PATH..."
  !insertmacro PDD_SYNC_PATH "$$kept"
!macroend
