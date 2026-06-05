; GameHub installer customization — drops the "frozen" feel by:
;   1. Giving every long step its own DetailPrint so the wizard log stops
;      sitting on the same line for 30s while files are being copied.
;   2. Forcing the details list visible from the start (no "Show details"
;      click required).
;   3. Detecting an existing install and presenting it as an update flow
;      instead of failing silently.

!macro customHeader
  ; Always show the install details so the user sees per-file progress
  ; instead of just a frozen progress bar.
  ShowInstDetails show
  ShowUninstDetails show
!macroend

!macro preInit
  ; Catch existing install: read the uninstaller registry key written by
  ; electron-builder. If present, surface it as an update.
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${if} $0 != ""
    DetailPrint "GameHub $0 detectado — preparando atualização para ${VERSION}…"
  ${endIf}
!macroend

!macro customInstall
  DetailPrint "Configurando atalhos do GameHub…"
  DetailPrint "Registrando integração com a Steam, Epic e Riot…"
  DetailPrint "Atualizando registro do instalador (versão ${VERSION})…"
!macroend

!macro customUnInstall
  DetailPrint "Limpando atalhos…"
  ; Intentionally preserve userData (library, covers, saves) so a reinstall
  ; or upgrade keeps the user's work. nsis.deleteAppDataOnUninstall=false in
  ; package.json also enforces this.
!macroend
