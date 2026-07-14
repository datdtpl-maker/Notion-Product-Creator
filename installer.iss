; Script Inno Setup cho dự án Notion Product Creator
#define MyAppName "Notion Product Creator"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Khải Hoàn Skincare"
#define MyAppURL "https://github.com/khaihoanskincare"
#define MyAppExeName "run_hidden.vbs"

[Setup]
AppId={{C67D3A6F-D8E2-441F-9CE0-23428E619EFA}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={userappdata}\Programs\NotionProductCreator
DisableDirPage=no
ChangesAssociations=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=NotionProductCreatorSetup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
SetupIconFile=app_icon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "dist\notion-product-creator\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "wscript.exe"; Parameters: """{app}\{#MyAppExeName}"""; IconFilename: "{app}\app_icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "wscript.exe"; Parameters: """{app}\{#MyAppExeName}"""; Tasks: desktopicon; IconFilename: "{app}\app_icon.ico"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec nowait postinstall skipifsilent

[Code]
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  // Kill any running instances of the backend before installation starts
  Exec('taskkill', '/f /im notion-product-creator.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;