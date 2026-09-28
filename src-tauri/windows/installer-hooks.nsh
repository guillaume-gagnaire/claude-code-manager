; Escouade was called « Claude Code Manager » up to 0.1.2, and the installer names its folder,
; its uninstall entry and its shortcuts after the product: installed over it (the update from
; 0.1.2), Escouade removes that install first, keeping the user's data, then recreates the
; shortcuts, which an update does not create.

!ifndef OLD_PRODUCTNAME
  !define OLD_PRODUCTNAME "Claude Code Manager"
!endif
!define OLD_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${OLD_PRODUCTNAME}"

Var OldInstallDir
Var OldUninstaller
Var OldQuote
Var OldHadDesktopShortcut
Var MigratedFromOldName

!macro NSIS_HOOK_PREINSTALL
  StrCpy $MigratedFromOldName 0
  StrCpy $OldHadDesktopShortcut 0
  ReadRegStr $OldUninstaller HKCU "${OLD_UNINSTKEY}" "UninstallString"
  ReadRegStr $OldInstallDir HKCU "${OLD_UNINSTKEY}" "InstallLocation"
  ${If} $OldUninstaller != ""
  ${AndIf} $OldInstallDir != ""
    ; The location is stored between quotes.
    StrCpy $OldQuote $OldInstallDir 1
    ${If} $OldQuote == '"'
      StrCpy $OldInstallDir $OldInstallDir -1 1
    ${EndIf}
    ${If} ${FileExists} "$DESKTOP\${OLD_PRODUCTNAME}.lnk"
      StrCpy $OldHadDesktopShortcut 1
    ${EndIf}
    ; Silent, so the app's data stays (it is only deleted when asked, in the dialog). `_?=` runs
    ; the uninstaller in place, so that ExecWait waits for it; it cannot delete itself there.
    ExecWait '$OldUninstaller /S _?=$OldInstallDir'
    Delete "$OldInstallDir\uninstall.exe"
    RMDir "$OldInstallDir"
    DeleteRegKey HKCU "Software\${MANUFACTURER}\${OLD_PRODUCTNAME}"
    StrCpy $MigratedFromOldName 1
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $MigratedFromOldName = 1
  ${AndIf} $UpdateMode = 1
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${If} $OldHadDesktopShortcut = 1
      CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend
