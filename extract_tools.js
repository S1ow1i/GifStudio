const fs = require('fs');
const appJs = fs.readFileSync('js/app.js', 'utf8');

const mousedownMatch = appJs.match(/function startDrawing\(e\) \{[\s\S]*?function draw\(e\)/);
const mousemoveMatch = appJs.match(/function draw\(e\) \{[\s\S]*?function stopDrawing\(e\)/);
const mouseupMatch = appJs.match(/function stopDrawing\(e\) \{[\s\S]*?function render\(\)/);

if(mousedownMatch) fs.writeFileSync('mousedown.txt', mousedownMatch[0]);
if(mousemoveMatch) fs.writeFileSync('mousemove.txt', mousemoveMatch[0]);
if(mouseupMatch) fs.writeFileSync('mouseup.txt', mouseupMatch[0]);

console.log("Functions extracted to txt files.");
