!macro NSIS_HOOK_POSTINSTALL
  ; Add the one-click desktop entry automatically after installation.
  Call CreateOrUpdateDesktopShortcut
!macroend
