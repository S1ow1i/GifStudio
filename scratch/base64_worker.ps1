$bytes = [System.IO.File]::ReadAllBytes("js/lib/gif.worker.js")
$base64 = [Convert]::ToBase64String($bytes)
$jsContent = "window.GIF_WORKER_B64 = `"$base64`";`n"
[System.IO.File]::WriteAllText("js/lib/gif.worker.b64.js", $jsContent)
Write-Host "gif.worker.b64.js generated successfully!"
