/* ==========================================================================
   GIF STUDIO - ELECTRON DESKTOP ENTRYPOINT
   ========================================================================== */

const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const CURRENT_VERSION = '1.0.18';
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
let mainWindowRef = null;

/** Browser esterni leggeri (Firefox/Brave) prima del browser di sistema. */
function getLightBrowserPaths() {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localApp = process.env.LOCALAPPDATA || '';
    return [
        path.join(pf, 'Mozilla Firefox', 'firefox.exe'),
        path.join(pf86, 'Mozilla Firefox', 'firefox.exe'),
        path.join(localApp, 'Mozilla', 'Firefox', 'firefox.exe'),
        path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        path.join(localApp, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
    ];
}

function openUrlInLightBrowser(url) {
    for (const browserPath of getLightBrowserPaths()) {
        if (!fs.existsSync(browserPath)) continue;
        try {
            spawn(browserPath, [url], { detached: true, stdio: 'ignore' }).unref();
            return { ok: true, browser: path.basename(browserPath, '.exe') };
        } catch (err) {
            console.warn('Apertura browser fallita:', browserPath, err.message);
        }
    }
    shell.openExternal(url);
    return { ok: true, browser: 'sistema' };
}

function downloadUpdateToDownloads(downloadUrl, version) {
    const downloadsDir = path.join(app.getPath('home'), 'Downloads');
    const safeVersion = String(version || 'latest').replace(/[^0-9.]/g, '') || 'latest';
    const fileName = `gifstudio-portable-v${safeVersion}.exe`;
    const targetPath = path.join(downloadsDir, fileName);
    const tempPath = `${targetPath}.download`;

    return fetch(downloadUrl, { headers: { 'User-Agent': 'GifStudio-AutoUpdater' } })
        .then((res) => {
            if (!res.ok) throw new Error(`Download fallito (${res.status})`);
            return res.arrayBuffer();
        })
        .then((buf) => {
            fs.mkdirSync(downloadsDir, { recursive: true });
            fs.writeFileSync(tempPath, Buffer.from(buf));
            if (fs.existsSync(targetPath)) {
                try { fs.unlinkSync(targetPath); } catch (_) { /* sovrascrivi se possibile */ }
            }
            fs.renameSync(tempPath, targetPath);
            return { ok: true, path: targetPath, fileName };
        })
        .catch((err) => {
            try {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch (_) { /* ignore */ }
            throw err;
        });
}

function attachExternalLinkGuards(win) {
    win.webContents.setWindowOpenHandler(({ url }) => {
        openUrlInLightBrowser(url);
        return { action: 'deny' };
    });

    win.webContents.session.on('will-download', (event) => {
        event.preventDefault();
    });
}

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
                        releasePageUrl: data.html_url || '',
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

        if (reqPath === '/api/open-update-download') {
            res.setHeader('Content-Type', 'application/json');
            const qs = new URL(`http://127.0.0.1${req.url}`).searchParams;
            const mode = qs.get('mode') || 'browser';
            const pageUrl = qs.get('pageUrl') || '';
            const downloadUrl = qs.get('downloadUrl') || '';
            const version = qs.get('version') || 'latest';

            if (mode === 'download' && downloadUrl) {
                downloadUpdateToDownloads(downloadUrl, version)
                    .then((result) => res.end(JSON.stringify(result)))
                    .catch((err) => {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ ok: false, error: err.message }));
                    });
                return;
            }

            const urlToOpen = pageUrl || downloadUrl;
            if (!urlToOpen) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'URL mancante' }));
                return;
            }
            const result = openUrlInLightBrowser(urlToOpen);
            res.end(JSON.stringify(result));
            return;
        }

        if (reqPath === '/api/test-results' && req.method === 'POST') {
            res.setHeader('Content-Type', 'application/json');
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                try {
                    fs.writeFileSync(path.join(__dirname, 'test-results.json'), body, 'utf8');
                    res.end(JSON.stringify({ ok: true }));
                    console.log('Automated test results saved to test-results.json');
                    if (process.argv.includes('--run-tests')) {
                        setTimeout(() => {
                            if (mainWindowRef) mainWindowRef.close();
                            app.quit();
                        }, 500);
                    }
                } catch (err) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ ok: false, error: err.message }));
                }
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
    const isTestMode = process.argv.includes('--run-tests');
    const mainWindow = new BrowserWindow({
        width: 1300,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        title: "Gif Studio",
        icon: path.join(__dirname, 'icon.ico'),
        autoHideMenuBar: true,
        show: !isTestMode,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindowRef = mainWindow;
    attachExternalLinkGuards(mainWindow);

    mainWindow.once('ready-to-show', () => {
        if (!isTestMode) {
            mainWindow.maximize();
            mainWindow.show();
        }
    });

    // Carica la pagina tramite il server HTTP locale (necessario per mantenere contesti sicuri per le API di File System)
    const startUrl = isTestMode ? `http://localhost:${PORT}/index.html?test=true` : `http://localhost:${PORT}/index.html`;
    mainWindow.loadURL(startUrl);

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
