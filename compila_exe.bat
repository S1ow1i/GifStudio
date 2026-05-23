@echo off
title Compilazione Gif Studio Portable Desktop EXE
set "PATH=%SystemRoot%\System32;%SystemRoot%;C:\Program Files\nodejs;%PATH%"
set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
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
call "C:\Program Files\nodejs\npx.cmd" electron-packager . "Gif Studio" --platform=win32 --arch=x64 --out=dist --overwrite --icon=icon.ico --ignore="(^/dist|^/node_modules|^/scratch|^/Output|gifstudio-portable\.exe$|^/compila_exe\.bat$|^/icon\.ico$|^/package-lock\.json$|^/GifStudio_Setup\.exe$|^/Applicazione_Portable)"
if %ERRORLEVEL% neq 0 (
    echo [ERRORE] Errore durante l'esecuzione di electron-packager.
    goto error
)
echo.

echo 3b. Riduzione lingue Electron (solo inglese e italiano)...
%POWERSHELL% -NoProfile -ExecutionPolicy Bypass -Command "$loc='dist\Gif Studio-win32-x64\locales'; if (Test-Path $loc) { Get-ChildItem $loc -Filter '*.pak' | Where-Object { $_.Name -notin 'en-US.pak','it.pak' } | Remove-Item -Force }"
echo.

echo 3c. Firma digitale dell'eseguibile interno Electron (Gif Studio.exe)...
%POWERSHELL% -NoProfile -ExecutionPolicy Bypass -Command "$cert = Get-Item Cert:\CurrentUser\My\4E7F3FC75C4F266E768B30DC6FCAA64561E80A01; Set-AuthenticodeSignature -Certificate $cert -FilePath '.\dist\Gif Studio-win32-x64\Gif Studio.exe' -TimestampServer 'http://timestamp.digicert.com'"
echo.

echo ======================================================================
echo  COMPILAZIONE COMPLETATA
echo  La cartella dell'app nativa e' pronta in: dist\Gif Studio-win32-x64
echo ======================================================================
echo.
if /i "%~1"=="--no-pause" exit /b 0
pause
exit /b 0

:error
echo.
echo [ERRORE] La compilazione e' fallita. Controlla i log sopra.
echo.
if /i "%~1"=="--no-pause" exit /b 1
pause
exit /b 1
