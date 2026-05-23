Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('icon.png')
$img.Save('icon_vera.png', [System.Drawing.Imaging.ImageFormat]::Png)
