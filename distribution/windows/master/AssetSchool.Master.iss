; Inno Setup Script for AssetSchool Master
#define MyAppName "AssetSchool Master"
#define MyAppVersion "1.2.0"
#define MyAppPublisher "AssetSchool Inc."
#define MyAppURL "https://assetschool.lan"
#define MyAppExeName "AssetSchool.Master.exe"

[Setup]
AppId={{8B19C020-57D1-4E88-B391-7C65F8E21020}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\AssetSchool\Master
DefaultGroupName=AssetSchool
DisableProgramGroupPage=yes
OutputDir=..\..\..\dist\installers\windows
OutputBaseFilename=AssetSchool-Master-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\..\..\dist\bin\master-windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
// Configuración de firewall durante instalación
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    Exec('netsh.exe', 'advfirewall firewall add rule name="AssetSchool Master" dir=in action=allow program="' + ExpandConstant('{app}\{#MyAppExeName}') + '" enable=yes', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    Exec('netsh.exe', 'advfirewall firewall delete rule name="AssetSchool Master"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
