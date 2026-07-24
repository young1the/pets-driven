; pets-driven NSIS installer hooks: put the bundled `pdd` CLI on the user's PATH.
;
; The `pdd` sidecar (bundle.externalBin) is installed next to the app executable
; in $INSTDIR, so adding $INSTDIR to PATH makes `pdd` runnable from any terminal.
; Install mode is currentUser, so the user PATH lives in HKCU\Environment.
;
; !!! UNVERIFIED: written without a Windows/NSIS build to test it. Verify on a
; real `tauri build`:
;   * the installer compiles with this hook,
;   * `pdd` resolves in a NEW terminal after install (existing terminals keep
;     the old PATH until reopened),
;   * a reinstall does not append a duplicate entry (this simple version does
;     not de-duplicate — see the note below),
;   * decide whether uninstall should strip the entry.
; For de-duplication and clean uninstall removal, wire in the EnVar NSIS plugin
; (EnVar::AddValue / EnVar::DeleteValue) instead of the manual writes below.

!include "LogicLib.nsh"
!include "WinMessages.nsh"

!macro NSIS_HOOK_POSTINSTALL
  ReadRegStr $0 HKCU "Environment" "Path"
  ${If} $0 == ""
    WriteRegExpandStr HKCU "Environment" "Path" "$INSTDIR"
  ${Else}
    WriteRegExpandStr HKCU "Environment" "Path" "$0;$INSTDIR"
  ${EndIf}
  ; Broadcast so newly launched processes pick up the changed PATH.
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
