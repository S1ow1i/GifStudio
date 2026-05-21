$content = Get-Content -Path 'js/lib/gif.worker.b64.js' -Raw
$parts = $content.Split('"')
$base64 = $parts[1]
$bytes = [System.Convert]::FromBase64String($base64)
$decoded = [System.Text.Encoding]::UTF8.GetString($bytes)
[System.IO.File]::WriteAllText('scratch/decoded_worker.js', $decoded)
Write-Output "Successfully decoded worker to scratch/decoded_worker.js"
