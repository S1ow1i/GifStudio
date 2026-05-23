[Setup]
AppName=Gif Studio
AppVersion=1.0.19
DefaultDirName={pf}\Gif Studio
DefaultGroupName=Gif Studio
OutputBaseFilename=GifStudio_Setup
Compression=lzma
SolidCompression=yes
; Richiede i privilegi di amministratore per poter installare il certificato nel sistema
PrivilegesRequired=admin
; Evita schermate non necessarie
DisableProgramGroupPage=yes
DisableReadyPage=yes
; Icona del setup stesso
SetupIconFile=icon.ico


[Files]
; Include the native Electron folder and public certificate
Source: "Applicazione_Portable\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "gifstudio-public.cer"; DestDir: "{app}"; Flags: ignoreversion
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion


[Icons]
Name: "{autodesktop}\Gif Studio"; Filename: "{app}\Gif Studio.exe"; IconFilename: "{app}\icon.ico"
Name: "{group}\Gif Studio"; Filename: "{app}\Gif Studio.exe"; IconFilename: "{app}\icon.ico"

[Run]
; Esegue certutil in background in modalità silenziosa durante l'installazione
Filename: "certutil.exe"; Parameters: "-addstore -f ""Root"" ""{app}\gifstudio-public.cer"""; Flags: runhidden
; Avvia l'app alla fine dell'installazione
Filename: "{app}\Gif Studio.exe"; Description: "Avvia Gif Studio adesso"; Flags: postinstall nowait skipifsilent
