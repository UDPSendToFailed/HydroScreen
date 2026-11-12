!macro StopHydroScreenBridgeService
    nsExec::ExecToStack '"$SYSDIR\sc.exe" query HydroScreenSensorBridge'
    Pop $0
    Pop $1
    ${If} $0 == 0
        DetailPrint "Stopping HydroScreen Sensor Bridge service..."
        nsExec::ExecToStack '"$SYSDIR\sc.exe" stop HydroScreenSensorBridge'
        Pop $0
        Pop $1

        StrCpy $2 0
        ${DoWhile} $2 < 20
            nsExec::ExecToStack '"$SYSDIR\cmd.exe" /C ""$SYSDIR\sc.exe" query HydroScreenSensorBridge | "$SYSDIR\findstr.exe" /C:"STOPPED""'
            Pop $0
            Pop $1
            ${If} $0 == 0
                ${ExitDo}
            ${EndIf}
            Sleep 500
            IntOp $2 $2 + 1
        ${Loop}
    ${EndIf}

    ; Ensure any standalone/legacy lhm-bridge.exe is also stopped before install/upgrade
    nsExec::ExecToStack '"$SYSDIR\taskkill.exe" /F /IM lhm-bridge.exe'
    Pop $0
    Pop $1
!macroend

!macro MigrateLegacyCurrentUserInstall
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HydroScreen" "UninstallString"
    ${If} $0 != ""
        DetailPrint "Migrating previous per-user HydroScreen installation..."
        ReadRegStr $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HydroScreen" "InstallLocation"
        ${If} $1 != ""
            ; NSIS _?= requires an unquoted path even if InstallLocation is quoted in registry
            StrCpy $2 $1 1
            ${If} $2 == '"'
                StrCpy $1 $1 "" 1
            ${EndIf}
            StrCpy $2 $1 1 -1
            ${If} $2 == '"'
                StrCpy $1 $1 -1
            ${EndIf}
            ExecWait '$0 /S _?=$1'
            Delete "$1\uninstall.exe"
            RMDir "$1"
        ${Else}
            ExecWait '$0 /S'
        ${EndIf}
    ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
    !insertmacro StopHydroScreenBridgeService
    !insertmacro MigrateLegacyCurrentUserInstall
!macroend

!macro NSIS_HOOK_POSTINSTALL
    DetailPrint "Configuring HydroScreen Sensor Bridge service..."
    nsExec::ExecToStack '"$SYSDIR\sc.exe" query HydroScreenSensorBridge'
    Pop $0
    Pop $1
    ${If} $0 != 0
        nsExec::ExecToStack '"$SYSDIR\sc.exe" create HydroScreenSensorBridge binPath= "\"$INSTDIR\lhm-bridge.exe\" --service" start= auto DisplayName= "HydroScreen Sensor Bridge"'
        Pop $0
        Pop $1
    ${EndIf}

    nsExec::ExecToStack '"$SYSDIR\sc.exe" config HydroScreenSensorBridge binPath= "\"$INSTDIR\lhm-bridge.exe\" --service" start= auto DisplayName= "HydroScreen Sensor Bridge"'
    Pop $0
    Pop $1

    nsExec::ExecToStack '"$SYSDIR\sc.exe" description HydroScreenSensorBridge "Provides hardware sensor telemetry for HydroScreen."'
    Pop $0
    Pop $1

    nsExec::ExecToStack '"$SYSDIR\sc.exe" failure HydroScreenSensorBridge reset= 86400 actions= restart/5000/restart/10000/""/0'
    Pop $0
    Pop $1

    ; Update legacy HKCU autostart path if the user had autostart enabled
    ReadRegStr $2 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "HydroScreen"
    ${If} $2 != ""
        WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "HydroScreen" '"$INSTDIR\HydroScreen.exe"'
    ${EndIf}

    DetailPrint "Starting HydroScreen Sensor Bridge service..."
    nsExec::ExecToStack '"$SYSDIR\sc.exe" start HydroScreenSensorBridge'
    Pop $0
    Pop $1
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    !insertmacro StopHydroScreenBridgeService
    nsExec::ExecToStack '"$SYSDIR\sc.exe" query HydroScreenSensorBridge'
    Pop $0
    Pop $1
    ${If} $0 == 0
        DetailPrint "Removing HydroScreen Sensor Bridge service..."
        nsExec::ExecToStack '"$SYSDIR\sc.exe" delete HydroScreenSensorBridge'
        Pop $0
        Pop $1
    ${EndIf}
!macroend
