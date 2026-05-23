$WshShell = New-Object -ComObject WScript.Shell

# Ricrea collegamento Desktop
$shortcutDesktop = $WshShell.CreateShortcut("C:\Users\Public\Desktop\Gif Studio.lnk")
$shortcutDesktop.TargetPath = "C:\Program Files (x86)\Gif Studio\gifstudio-portable.exe"
$shortcutDesktop.IconLocation = "C:\Program Files (x86)\Gif Studio\icon.ico,0"
$shortcutDesktop.WorkingDirectory = "C:\Program Files (x86)\Gif Studio"
$shortcutDesktop.Description = "Gif Studio - Modifica Foto e GIF Premium"
$shortcutDesktop.Save()

# Ricrea collegamento Start Menu
$shortcutStart = $WshShell.CreateShortcut("C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Gif Studio\Gif Studio.lnk")
$shortcutStart.TargetPath = "C:\Program Files (x86)\Gif Studio\gifstudio-portable.exe"
$shortcutStart.IconLocation = "C:\Program Files (x86)\Gif Studio\icon.ico,0"
$shortcutStart.WorkingDirectory = "C:\Program Files (x86)\Gif Studio"
$shortcutStart.Description = "Gif Studio - Modifica Foto e GIF Premium"
$shortcutStart.Save()

# Refresh icone
ie4uinit.exe -show
