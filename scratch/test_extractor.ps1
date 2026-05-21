$exePath = "c:\Users\Matte\Desktop\Progetto\dist\gifstudio-portable.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "File non trovato!" -ForegroundColor Red
    exit
}

$bytes = [System.IO.File]::ReadAllBytes($exePath)
Write-Host "File size:" $bytes.Length

$sig = [byte[]](0x50, 0x4B, 0x03, 0x04) # PK\x03\x04

for ($i = 0; $i -lt $bytes.Length - 3; $i++) {
    if ($bytes[$i] -eq $sig[0] -and $bytes[$i+1] -eq $sig[1] -and $bytes[$i+2] -eq $sig[2] -and $bytes[$i+3] -eq $sig[3]) {
        Write-Host "Zip signature found at offset:" $i
    }
}
