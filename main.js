/* ==========================================================================
   GIF STUDIO - ELECTRON DESKTOP ENTRYPOINT
   ========================================================================== */

const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const CURRENT_VERSION = '1.0.7';
const GITHUB_REPO = 'S1ow1i/GifStudio';

function getAppStatePath() {
    return path.join(app.getPath('userData'), 'gifstudio-app-state.json');
}

function readAppState(callback) {
    const filePath = getAppStatePath();
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            callback(null);
            return;
        }
        try {
            callback(JSON.parse(data));
        } catch (parseErr) {
            callback(null);
        }
    });
}

function writeAppState(body, callback) {
    const filePath = getAppStatePath();
    fs.mkdir(path.dirname(filePath), { recursive: true }, () => {
        fs.writeFile(filePath, body, 'utf8', (err) => {
            callback(err);
        });
    });
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon'
};

let server;

function startLocalServer() {
    server = http.createServer((req, res) => {
        let reqPath = req.url.split('?')[0];
        
        // Persistenza preferenze UI/layout (affidabile nel portable Electron)
        if (reqPath === '/api/app-state') {
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'GET') {
                readAppState((state) => {
                    res.end(JSON.stringify(state || {}));
                });
                return;
            }
            if (req.method === 'POST') {
                let body = '';
                req.on('data', (chunk) => { body += chunk; });
                req.on('end', () => {
                    writeAppState(body, (err) => {
                        if (err) {
                            res.statusCode = 500;
                            res.end(JSON.stringify({ ok: false, error: err.message }));
                            return;
                        }
                        res.end(JSON.stringify({ ok: true }));
                    });
                });
                return;
            }
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false }));
            return;
        }

        // 1. Gestione endpoint API speciale per l'Auto-Updater
        if (reqPath === '/api/check-update') {
            res.setHeader('Content-Type', 'application/json');
            
            if (!GITHUB_REPO || GITHUB_REPO.includes('YOUR_USERNAME') || GITHUB_REPO === '') {
                res.end(JSON.stringify({ updateAvailable: false }));
                return;
            }

            // Utilizziamo fetch nativo di Node.js (incluso in Node 18+)
            fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
                headers: { 'User-Agent': 'GifStudio-AutoUpdater' }
            })
            .then(apiRes => {
                if (!apiRes.ok) throw new Error(`Errore API GitHub: ${apiRes.status}`);
                return apiRes.json();
            })
            .then(data => {
                const latestVersion = data.tag_name.replace(/^v/, '');
                
                const semverCompare = (v1, v2) => {
                    const a = v1.split('.').map(Number);
                    const b = v2.split('.').map(Number);
                    for (let i = 0; i < 3; i++) {
                        if ((a[i] || 0) > (b[i] || 0)) return 1;
                        if ((a[i] || 0) < (b[i] || 0)) return -1;
                    }
                    return 0;
                };

                if (semverCompare(latestVersion, CURRENT_VERSION) > 0) {
                    const exeAsset = data.assets && data.assets.find(asset => asset.name.endsWith('.exe'));
                    const downloadUrl = exeAsset ? exeAsset.browser_download_url : data.html_url;

                    res.end(JSON.stringify({
                        updateAvailable: true,
                        currentVersion: CURRENT_VERSION,
                        latestVersion: latestVersion,
                        downloadUrl: downloadUrl,
                        releaseNotes: data.body || ''
                    }));
                } else {
                    res.end(JSON.stringify({ updateAvailable: false }));
                }
            })
            .catch(err => {
                console.warn('Impossibile verificare gli aggiornamenti su GitHub:', err.message);
                res.end(JSON.stringify({ updateAvailable: false, error: err.message }));
            });
            return;
        }

        // 2. Routing file statici tradizionali
        if (reqPath === '/' || reqPath === '') {
            reqPath = '/index.html';
        }

        const cleanPath = reqPath.replace(/^\//, '');
        const filePath = path.join(__dirname, cleanPath);

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.statusCode = 404;
                res.statusMessage = 'Not Found';
                res.end('File non trovato');
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            res.end(data);
        });
    });

    server.listen(PORT, 'localhost', () => {
        console.log(`Server HTTP locale in esecuzione su http://localhost:${PORT}`);
    });
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1300,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        title: "Gif Studio",
        icon: path.join(__dirname, 'icon.png'),
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
    });

    // Carica la pagina tramite il server HTTP locale (necessario per mantenere contesti sicuri per le API di File System)
    mainWindow.loadURL(`http://localhost:${PORT}/index.html`);

    mainWindow.on('closed', () => {
        if (server) {
            server.close();
        }
    });
}

// Avvia prima il server e poi la finestra di Electron
app.whenReady().then(() => {
    startLocalServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (server) {
            server.close();
        }
        app.quit();
    }
});
