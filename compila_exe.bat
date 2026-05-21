@echo off
title Compilazione Gif Studio Portable Desktop EXE
echo ======================================================================
echo           GIF STUDIO PORTABLE - PIPELINE DI COMPILAZIONE
echo ======================================================================
echo.

echo 1. Installazione delle dipendenze npm (Electron ed Electron-Packager)...
call "C:\Program Files\nodejs\npm.cmd" install
if %ERRORLEVEL% neq 0 (
    echo [ERRORE] Impossibile installare le dipendenze npm.
    goto error
)
echo.

echo 2. Pulizia artefatti di build precedenti...
if exist dist\launcher.exe del /f /q dist\launcher.exe
if exist dist\app.zip del /f /q dist\app.zip
if exist dist\gifstudio-portable.exe del /f /q dist\gifstudio-portable.exe
if exist "dist\Gif Studio-win32-x64" rmdir /s /q "dist\Gif Studio-win32-x64"
echo.

echo 3. Pacchettizzazione (esclude dist, node_modules, scratch, exe, script build)...
call "C:\Program Files\nodejs\npx.cmd" electron-packager . "Gif Studio" --platform=win32 --arch=x64 --out=dist --overwrite --icon=icon.ico --ignore="(^/dist|^/node_modules|^/scratch|gifstudio-portable\.exe$|^/compila_exe\.bat$|^/icon\.ico$|^/package-lock\.json$)"
if %ERRORLEVEL% neq 0 (
    echo [ERRORE] Errore durante l'esecuzione di electron-packager.
    goto error
)
echo.

echo 3b. Riduzione lingue Electron (solo inglese e italiano)...
powershell -Command "$loc='dist\Gif Studio-win32-x64\locales'; if (Test-Path $loc) { Get-ChildItem $loc -Filter '*.pak' | Where-Object { $_.Name -notin 'en-US.pak','it.pak' } | Remove-Item -Force }"
echo.

echo 4. Compressione dell'applicazione in formato ZIP (app.zip)...
powershell -Command "Compress-Archive -Path '.\dist\Gif Studio-win32-x64\*' -DestinationPath '.\dist\app.zip' -Force"
if %ERRORLEVEL% neq 0 (
    echo [ERRORE] Errore durante la creazione dell'archivio zip.
    goto error
)
echo.

echo 5. Compilazione del Launcher C# Nativo (.NET Framework 4.0)...
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /win32icon:icon.ico /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Windows.Forms.dll /out:dist\launcher.exe scratch\Launcher.cs
if %ERRORLEVEL% neq 0 (
    echo [ERRORE] Errore durante la compilazione del launcher C#.
    goto error
)
echo.

echo 6. Unione binaria (Launcher C# + Payload ZIP) -^> gifstudio-portable.exe...
copy /b dist\launcher.exe + dist\app.zip dist\gifstudio-portable.exe
if %ERRORLEVEL% neq 0 (
    echo [ERRORE] Errore durante l'unione dei binari.
    goto error
)
echo.

echo 7. Pulizia finale e copia eseguibile nella cartella progetto...
del /f /q dist\launcher.exe
del /f /q dist\app.zip
if exist "dist\Gif Studio-win32-x64" rmdir /s /q "dist\Gif Studio-win32-x64"
copy /y dist\gifstudio-portable.exe gifstudio-portable.exe
echo.

echo ======================================================================
echo  COMPILAZIONE COMPLETATA
echo  Eseguibile: dist\gifstudio-portable.exe e gifstudio-portable.exe
echo ======================================================================
echo.
pause
exit /b 0

:error
echo.
echo [ERRORE] La compilazione e' fallita. Controlla i log sopra.
echo.
pause
exit /b 1
