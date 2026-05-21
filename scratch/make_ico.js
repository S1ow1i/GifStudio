const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, '..', 'icon.png');
const icoPath = path.join(__dirname, '..', 'icon.ico');

if (!fs.existsSync(pngPath)) {
    console.error("Errore: icon.png non trovato!");
    process.exit(1);
}

const pngData = fs.readFileSync(pngPath);
const pngSize = pngData.length;

// Prepara l'header di 22 byte per il formato ICO (con dentro il PNG raw)
const icoHeader = Buffer.alloc(22);

// ICONDIR Header (6 byte)
icoHeader.writeUInt16LE(0, 0);  // Reserved
icoHeader.writeUInt16LE(1, 2);  // Type (1 = Icon)
icoHeader.writeUInt16LE(1, 4);  // Image Count (1)

// ICONDIRENTRY (16 byte)
icoHeader.writeUInt8(0, 6);     // Width (0 = 256px o superiore)
icoHeader.writeUInt8(0, 7);     // Height (0 = 256px o superiore)
icoHeader.writeUInt8(0, 8);     // Color count (0)
icoHeader.writeUInt8(0, 9);     // Reserved (0)
icoHeader.writeUInt16LE(1, 10); // Color planes (1)
icoHeader.writeUInt16LE(32, 12);// Bits per pixel (32)
icoHeader.writeUInt32LE(pngSize, 14); // Size of PNG data
icoHeader.writeUInt32LE(22, 18);      // Offset of PNG data (header size = 22)

// Scrivi l'unione dei buffer nel file .ico
const finalIcoData = Buffer.concat([icoHeader, pngData]);
fs.writeFileSync(icoPath, finalIcoData);

console.log(`Successo! Icona .ico creata correttamente a: ${icoPath} (Dimensione: ${finalIcoData.length} byte)`);
