; ==============================================================================
; ASSETSCHOOL STUDENT — ASISTENTE GRÁFICO PROFESIONAL DE INSTALACIÓN (WINDOWS 11)
; Genera el ejecutable único autocontenido: AssetSchool-Student-Setup.exe
; No requiere .NET Runtime previo, Git ni PowerShell en el equipo de destino.
; ==============================================================================

#define MyAppName "AssetSchool Student"
#define MyAppVersion "1.2.0"
#define MyAppPublisher "AssetSchool Inc."
#define MyAppURL "https://assetschool.lan"
#define MyServiceName "AssetSchoolStudentService"
#define MyServiceDisplayName "AssetSchool Student Background Service"
#define MyServiceExe "AssetSchool.Student.Service.exe"
#define MySessionExe "AssetSchool.Student.SessionAgent.exe"

[Setup]
; Identificador de aplicación GUID único para Windows
AppId={{7E57C000-57D1-4E88-B391-7C65F8E21000}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; Directorios y estructura
DefaultDirName={autopf}\AssetSchool\Student
DefaultGroupName=AssetSchool
DisableProgramGroupPage=yes
DisableWelcomePage=no

; Licencia y Términos de Uso (Pantalla 2)
LicenseFile=TERMS_STUDENT.txt

; Archivo ejecutable único autocontenido
OutputDir=..\..\..\dist\installers\windows
OutputBaseFilename=AssetSchool-Student-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

; Privilegios y Arquitectura (Windows 11 x64 nativo)
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
CloseApplications=yes
RestartApplications=no

; Integración con Panel de Control / Configuración de Windows 11
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\Service\{#MyServiceExe}

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; 1. Publicación autocontenida de Service (aislada sin fusión)
Source: "..\..\..\dist\bin\student-windows\Service\*"; DestDir: "{app}\Service"; Flags: ignoreversion recursesubdirs createallsubdirs
; 2. Publicación autocontenida de SessionAgent (aislada sin fusión)
Source: "..\..\..\dist\bin\student-windows\SessionAgent\*"; DestDir: "{app}\SessionAgent"; Flags: ignoreversion recursesubdirs createallsubdirs
; 3. Documentación y archivos de configuración
Source: "TERMS_STUDENT.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "student-config.sample.json"; DestDir: "{app}"; Flags: ignoreversion

[Run]
; Opción final para iniciar AssetSchool Student al finalizar la instalación
Filename: "{sys}\net.exe"; Parameters: "start {#MyServiceName}"; Description: "Iniciar el servicio de AssetSchool Student ahora"; Flags: postinstall runhidden; StatusMsg: "Iniciando servicio de fondo..."

[Code]
var
  ServerPage: TInputQueryWizardPage;
  AutoDiscoveryCheckBox: TCheckBox;

// ----------------------------------------------------------------------------
// 1. ASISTENTE GRÁFICO: PÁGINA PERSONALIZADA DE CONFIGURACIÓN DE SERVIDOR
// ----------------------------------------------------------------------------
procedure InitializeWizard;
begin
  // Página de configuración de servidor inmediatamente después de la aceptación de condiciones
  ServerPage := CreateInputQueryPage(
    wpLicense,
    'Configuración de Conexión del Servidor Docente',
    'Indique la dirección IP y puerto del servidor institucional AssetSchool.',
    'AssetSchool Student se comunicará con esta dirección en la red local para la supervisión pedagógica y recepción de directivas de aula.');

  // Campo 1: Host / IP del servidor
  ServerPage.Add('Dirección IP o Hostname del Servidor Docente:', False);
  ServerPage.Values[0] := '192.168.4.42'; // IP por defecto en entorno de homologación

  // Campo 2: Puerto TCP
  ServerPage.Add('Puerto de Señalización TCP (REST / WebSocket):', False);
  ServerPage.Values[1] := '3000';

  // CheckBox: Autodescubrimiento UDP
  AutoDiscoveryCheckBox := TCheckBox.Create(ServerPage);
  AutoDiscoveryCheckBox.Parent := ServerPage.Surface;
  AutoDiscoveryCheckBox.Caption := 'Habilitar autodescubrimiento en la red local (Escucha balizas UDP en puerto 48500)';
  AutoDiscoveryCheckBox.Checked := True;
  AutoDiscoveryCheckBox.Top := ServerPage.Edits[1].Top + ServerPage.Edits[1].Height + ScaleY(16);
  AutoDiscoveryCheckBox.Left := ServerPage.Edits[1].Left;
  AutoDiscoveryCheckBox.Width := ServerPage.SurfaceWidth - AutoDiscoveryCheckBox.Left;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  PortNum: Integer;
begin
  Result := True;
  if CurPageID = ServerPage.ID then
  begin
    if Trim(ServerPage.Values[0]) = '' then
    begin
      MsgBox('Debe ingresar una dirección IP o nombre de host válido para el servidor docente.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    PortNum := StrToIntDef(Trim(ServerPage.Values[1]), 0);
    if (PortNum <= 0) or (PortNum > 65535) then
    begin
      MsgBox('El puerto de señalización debe ser un número entero válido entre 1 y 65535.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

// ----------------------------------------------------------------------------
// 2. CICLO DE INSTALACIÓN: PRE-COPIA Y POST-INSTALACIÓN
// ----------------------------------------------------------------------------
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  DataDir: String;
  ConfigFile: String;
  ConfigContent: String;
  AutoDiscStr: String;
  ServerHost: String;
  ServerPort: String;
  ServiceExePath: String;
begin
  // A. PRE-INSTALACIÓN: Detener servicios y procesos previos para evitar bloqueos de archivos
  if CurStep = ssInstall then
  begin
    // Detener servicio existente si se está actualizando o reinstalando
    Exec('net.exe', 'stop {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('taskkill.exe', '/F /IM {#MySessionExe}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('taskkill.exe', '/F /IM {#MyServiceExe}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(1000);
  end;

  // B. POST-INSTALACIÓN: Crear ProgramData, blindar ACL NTFS, registrar servicio y firewall
  if CurStep = ssPostInstall then
  begin
    ServerHost := Trim(ServerPage.Values[0]);
    ServerPort := Trim(ServerPage.Values[1]);
    if AutoDiscoveryCheckBox.Checked then
      AutoDiscStr := 'true'
    else
      AutoDiscStr := 'false';

    // 1. Crear directorio protegido en ProgramData
    DataDir := ExpandConstant('{commonappdata}\AssetSchool\Student');
    if not DirExists(DataDir) then
      ForceDirectories(DataDir);
    if not DirExists(DataDir + '\logs') then
      ForceDirectories(DataDir + '\logs');

    // 2. Escribir student-config.json
    ConfigFile := DataDir + '\student-config.json';
    ConfigContent := '{\n' +
      '  "serverHost": "' + ServerHost + '",\n' +
      '  "serverPort": ' + ServerPort + ',\n' +
      '  "serverUrl": "http://' + ServerHost + ':' + ServerPort + '",\n' +
      '  "autoDiscovery": ' + AutoDiscStr + ',\n' +
      '  "institutionId": "",\n' +
      '  "classroomId": "",\n' +
      '  "enrollmentToken": "",\n' +
      '  "installedAt": "' + GetDateTimeString('yyyy/mm/dd hh:nn:ss', '-', ':') + '",\n' +
      '  "version": "{#MyAppVersion}-setup"\n' +
      '}\n';

    SaveStringToFile(ConfigFile, ConfigContent, False);

    // 3. Blindar permisos NTFS en student-config.json: Acceso exclusivo a SYSTEM y Administradores
    Exec('icacls.exe', '"' + ConfigFile + '" /inheritance:r /grant:r "SYSTEM:(F)" /grant:r "Administrators:(F)"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // 4. Registro seguro en Windows Service Control Manager (SCM) con autorrecuperación nativa
    ServiceExePath := ExpandConstant('{app}\Service\{#MyServiceExe}');

    // Eliminar registro de servicio anterior si existía para garantizar parámetros limpios
    Exec('sc.exe', 'delete {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(1000);

    // Crear servicio residente apuntando a la ruta segregada
    Exec('sc.exe', 'create {#MyServiceName} binPath= "\"' + ServiceExePath + '\"" start= auto DisplayName= "{#MyServiceDisplayName}"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    if ResultCode <> 0 then
    begin
      MsgBox('Advertencia al registrar el servicio en SCM (Código de salida: ' + IntToStr(ResultCode) + '). Revise los permisos administrativos.', mbInformation, MB_OK);
    end;

    // Configurar descripción y políticas de autorrecuperación nativa
    Exec('sc.exe', 'description {#MyServiceName} "Servicio residente de supervisión, administración remota e interactividad de AssetSchool Student."', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('sc.exe', 'failure {#MyServiceName} reset= 86400 actions= restart/5000/restart/10000/restart/30000', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // 5. Eliminar explícitamente cualquier clave previa en HKLM Run (exclusividad del servicio)
    RegDeleteValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Run', 'AssetSchoolStudentSessionAgent');

    // 6. Configurar Windows Firewall con las reglas estrictamente necesarias
    // Limpiar reglas previas
    Exec('netsh.exe', 'advfirewall firewall delete rule name="AssetSchool Student UDP Discovery"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('netsh.exe', 'advfirewall firewall delete rule name="AssetSchool Student (UDP Discovery)"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('netsh.exe', 'advfirewall firewall delete rule name="AssetSchool Student Outbound Signaling"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('netsh.exe', 'advfirewall firewall delete rule name="AssetSchool Student Service Program"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // REGLA 1 (Inbound): UDP 48500 limitada a perfil privado y subred local (solo si autodescubrimiento está activo)
    if AutoDiscoveryCheckBox.Checked then
    begin
      Exec('netsh.exe', 'advfirewall firewall add rule name="AssetSchool Student (UDP Discovery)" dir=in action=allow protocol=UDP localport=48500 profile=private remoteip=localsubnet enable=yes', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;

    // REGLA 2 (Outbound): Señalización TCP hacia el servidor Mac docente
    Exec('netsh.exe', 'advfirewall firewall add rule name="AssetSchool Student Outbound Signaling" dir=out action=allow protocol=TCP remoteport=' + ServerPort + ' remoteip=' + ServerHost + ' profile=private enable=yes', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // REGLA 3: Tráfico de aplicación de servicio acotado a la IP del servidor en perfil privado
    Exec('netsh.exe', 'advfirewall firewall add rule name="AssetSchool Student Service Program" dir=in action=allow program="' + ServiceExePath + '" profile=private remoteip=' + ServerHost + ' enable=yes', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

// ----------------------------------------------------------------------------
// 3. DESINSTALADOR INTEGRADO: LIMPIEZA PROFUNDA DE SERVICIO, PROCESOS Y FIREWALL
// ----------------------------------------------------------------------------
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
  DataDir: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    // 1. Detener el servicio Windows
    Exec('net.exe', 'stop {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // 2. Finalizar cualquier proceso activo de SessionAgent o Service
    Exec('taskkill.exe', '/F /IM {#MySessionExe}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('taskkill.exe', '/F /IM {#MyServiceExe}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(1000);

    // 3. Eliminar el registro del servicio en SCM
    Exec('sc.exe', 'delete {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // 4. Limpiar reglas de firewall
    Exec('netsh.exe', 'advfirewall firewall delete rule name="AssetSchool Student UDP Discovery"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('netsh.exe', 'advfirewall firewall delete rule name="AssetSchool Student (UDP Discovery)"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('netsh.exe', 'advfirewall firewall delete rule name="AssetSchool Student Outbound Signaling"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('netsh.exe', 'advfirewall firewall delete rule name="AssetSchool Student Service Program"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // 5. Eliminar claves de registro obsoletas si existiesen
    RegDeleteValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Run', 'AssetSchoolStudentSessionAgent');
  end;

  if CurUninstallStep = usPostUninstall then
  begin
    // 6. Preguntar o eliminar directorio de configuración en ProgramData
    DataDir := ExpandConstant('{commonappdata}\AssetSchool\Student');
    if DirExists(DataDir) then
    begin
      DelTree(DataDir, True, True, True);
    end;
  end;
end;
