const fs = require('fs');
const content = fs.readFileSync('js/lib/gif.worker.b64.js', 'utf8');
const base64Match = content.match(/"([^"]+)"/);
if (base64Match) {
    const base64 = base64Match[1];
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    fs.writeFileSync('scratch/decoded_worker.js', decoded, 'utf8');
    console.log("Successfully decoded worker to scratch/decoded_worker.js");
} else {
    console.error("Could not find base64 string in gif.worker.b64.js");
}
