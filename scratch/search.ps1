param(
    [string]$Pattern
)

$content = [System.IO.File]::ReadAllText('scratch/decoded_worker.js')
$index = $content.IndexOf($Pattern)
if ($index -ge 0) {
    $start = [Math]::Max(0, $index - 300)
    $length = [Math]::Min($content.Length - $start, 600)
    Write-Output "Found '$Pattern' at index $index. Context:"
    Write-Output "=================================================="
    Write-Output $content.Substring($start, $length)
    Write-Output "=================================================="
} else {
    Write-Output "Pattern '$Pattern' not found"
}
