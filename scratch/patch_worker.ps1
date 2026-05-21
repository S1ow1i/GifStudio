# Read the decoded worker
$decodedPath = 'scratch/decoded_worker.js'
$content = [System.IO.File]::ReadAllText($decodedPath)

# 1. Patch getImagePixels
$oldGetPixels = 'GIFEncoder.prototype.getImagePixels=function(){var w=this.width;var h=this.height;this.pixels=new Uint8Array(w*h*3);var data=this.image;var srcPos=0;var count=0;for(var i=0;i<h;i++){for(var j=0;j<w;j++){this.pixels[count++]=data[srcPos++];this.pixels[count++]=data[srcPos++];this.pixels[count++]=data[srcPos++];srcPos++}}}'
$newGetPixels = 'GIFEncoder.prototype.getImagePixels=function(){var w=this.width;var h=this.height;this.pixels=new Uint8Array(w*h*3);var data=this.image;var srcPos=0;var count=0;for(var i=0;i<h;i++){for(var j=0;j<w;j++){var r=data[srcPos++];var g=data[srcPos++];var b=data[srcPos++];var a=data[srcPos++];if(this.transparent!==null&&a<128){this.pixels[count++]=(this.transparent&16711680)>>16;this.pixels[count++]=(this.transparent&65280)>>8;this.pixels[count++]=this.transparent&255}else{this.pixels[count++]=r;this.pixels[count++]=g;this.pixels[count++]=b}}}}'

if ($content.Contains($oldGetPixels)) {
    $content = $content.Replace($oldGetPixels, $newGetPixels)
    Write-Output "Patched getImagePixels successfully."
} else {
    Write-Error "Could not find old getImagePixels in worker code."
    exit 1
}

# 2. Patch analyzePixels to calculate transIndex before indexPixels
$oldAnalyze = 'GIFEncoder.prototype.analyzePixels=function(){if(!this.colorTab){this.neuQuant=new NeuQuant(this.pixels,this.sample);this.neuQuant.buildColormap();this.colorTab=this.neuQuant.getColormap()}if(this.dither){this.ditherPixels(this.dither.replace("-serpentine",""),this.dither.match(/-serpentine/)!==null)}else{this.indexPixels()}this.pixels=null;this.colorDepth=8;this.palSize=7;if(this.transparent!==null){this.transIndex=this.findClosest(this.transparent,true)}}'
$newAnalyze = 'GIFEncoder.prototype.analyzePixels=function(){if(!this.colorTab){this.neuQuant=new NeuQuant(this.pixels,this.sample);this.neuQuant.buildColormap();this.colorTab=this.neuQuant.getColormap()}if(this.transparent!==null){this.transIndex=this.findClosest(this.transparent,true)}if(this.dither){this.ditherPixels(this.dither.replace("-serpentine",""),this.dither.match(/-serpentine/)!==null)}else{this.indexPixels()}this.pixels=null;this.colorDepth=8;this.palSize=7}'

if ($content.Contains($oldAnalyze)) {
    $content = $content.Replace($oldAnalyze, $newAnalyze)
    Write-Output "Patched analyzePixels successfully."
} else {
    Write-Error "Could not find old analyzePixels in worker code."
    exit 1
}

# 3. Patch indexPixels to enforce exact transparent index matching
$oldIndex = 'GIFEncoder.prototype.indexPixels=function(imgq){var nPix=this.pixels.length/3;this.indexedPixels=new Uint8Array(nPix);var k=0;for(var j=0;j<nPix;j++){var index=this.findClosestRGB(this.pixels[k++]&255,this.pixels[k++]&255,this.pixels[k++]&255);this.usedEntry[index]=true;this.indexedPixels[j]=index}}'
$newIndex = 'GIFEncoder.prototype.indexPixels=function(imgq){var nPix=this.pixels.length/3;this.indexedPixels=new Uint8Array(nPix);var k=0;var transR=null,transG=null,transB=null;if(this.transparent!==null){transR=(this.transparent&16711680)>>16;transG=(this.transparent&65280)>>8;transB=this.transparent&255}for(var j=0;j<nPix;j++){var r=this.pixels[k++]&255;var g=this.pixels[k++]&255;var b=this.pixels[k++]&255;var index;if(this.transparent!==null&&r===transR&&g===transG&&b===transB){index=this.transIndex}else{index=this.findClosestRGB(r,g,b)}this.usedEntry[index]=true;this.indexedPixels[j]=index}}'

if ($content.Contains($oldIndex)) {
    $content = $content.Replace($oldIndex, $newIndex)
    Write-Output "Patched indexPixels successfully."
} else {
    Write-Error "Could not find old indexPixels in worker code."
    exit 1
}

# Save the patched content back to scratch/decoded_worker.js
[System.IO.File]::WriteAllText($decodedPath, $content)

# Encode back to Base64
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
$base64 = [System.Convert]::ToBase64String($bytes)

# Write to js/lib/gif.worker.b64.js
$b64Content = "window.GIF_WORKER_B64 = ""$base64"";`n"
[System.IO.File]::WriteAllText('js/lib/gif.worker.b64.js', $b64Content)
Write-Output "Updated js/lib/gif.worker.b64.js with patched base64."

# Write to js/lib/gif.worker.js
[System.IO.File]::WriteAllText('js/lib/gif.worker.js', $content)
Write-Output "Updated js/lib/gif.worker.js with patched code."
