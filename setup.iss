[Setup]
AppName=Gif Studio
AppVersion=1.0
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

[Files]
; Include il tuo launcher portable e il certificato pubblico
Source: "gifstudio-portable.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "gifstudio-public.cer"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\Gif Studio"; Filename: "{app}\gifstudio-portable.exe"
Name: "{group}\Gif Studio"; Filename: "{app}\gifstudio-portable.exe"

[Run]
; Il colpo di genio: esegue certutil in background in modalità silenziosa durante l'installazione
Filename: "certutil.exe"; Parameters: "-addstore -f ""Root"" ""{app}\gifstudio-public.cer"""; Flags: runhidden
; Avvia l'app alla fine dell'installazione
Filename: "{app}\gifstudio-portable.exe"; Description: "Avvia Gif Studio adesso"; Flags: postinstall nowait skipifsilent
