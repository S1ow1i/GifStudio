const fs = require('fs');

let indexHtml = fs.readFileSync('index.html', 'utf-8');
let appJs = fs.readFileSync('js/app.js', 'utf-8');

// 1. INDEX.HTML
const magicWandHtml = `                                <button id="draw-tool-magic-wand" class="tool-btn" title="Crea una maschera di protezione intelligente">
                                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/>
                                        <line x1="16" y1="8" x2="2" y2="22"/>
                                        <line x1="17.5" y1="15" x2="19" y2="16.5"/>
                                        <line x1="22" y1="9.5" x2="20.5" y2="8"/>
                                    </svg>
                                    <span>Bacchetta Magica</span>
                                </button>`;

const shapesHtmlBtn = `                                <button id="draw-tool-shapes" class="tool-btn" title="Disegna rettangoli, cerchi o linee">
                                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><circle cx="16.5" cy="6.5" r="3.5"></circle><path d="M4 15l4 6h-8z"></path><line x1="14" y1="18" x2="21" y2="18"></line><line x1="17.5" y1="14.5" x2="17.5" y2="21.5"></line></svg>
                                    <span>Forme Geomet.</span>
                                </button>`;

indexHtml = indexHtml.replace(/<button id="draw-tool-magic-wand"[\s\S]*?<\/button>/, magicWandHtml + '\n' + shapesHtmlBtn);

const lassoHtml = `                                <button id="draw-tool-lasso" class="tool-btn" title="Seleziona una porzione libera o rettangolare">
                                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M12 21.5c-4.4 0-8-3.6-8-8 0-4.4 3.6-8 8-8s8 3.6 8 8"/>
                                        <path d="M12 13.5v8"/>
                                        <path d="M15.5 21l-3.5-3.5-3.5 3.5"/>
                                        <circle cx="12" cy="3.5" r="2" stroke-dasharray="2 2"/>
                                    </svg>
                                    <span>Selezione Taglio</span>
                                </button>`;
indexHtml = indexHtml.replace(/<button id="draw-tool-lasso"[\s\S]*?<\/button>/, lassoHtml);

const lassoSettingsHtml = `                        <!-- Opzioni Lasso -->
                        <div class="control-group" id="lasso-settings-group" style="display: none;">
                            <label id="tut-title-lasso-settings">Impostazioni Lazo</label>
                            <div class="input-row props-grid-2" style="margin-bottom: 12px;">
                                <button type="button" id="lasso-mode-free" class="mode-btn active" title="Seleziona un'area libera a mano libera">A Mano Libera</button>
                                <button type="button" id="lasso-mode-rect" class="mode-btn" title="Seleziona un'area quadrata/rettangolare">Rettangolare</button>
                            </div>
                            
                            <button id="btn-lasso-cut" class="primary-btn" style="width: 100%; padding: 10px; border-radius: 6px; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                                Ritaglia ed Estrai Livello
                            </button>
                            <button id="btn-lasso-clear" class="danger-btn" style="width: 100%; padding: 10px; border-radius: 6px; cursor: pointer; border: 1px solid var(--danger-color); background: rgba(255,59,48,0.1); color: var(--danger-color); display: flex; justify-content: center; align-items: center; gap: 8px;">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                Pulisci Area (Taglia Solco)
                            </button>
                        </div>`;

const shapesSettingsHtml = `                        <!-- Opzioni Forme -->
                        <div class="control-group" id="shapes-settings-group" style="display: none;">
                            <label id="tut-title-shapes-settings">Impostazioni Forme</label>
                            <div class="input-row props-grid-3" style="margin-bottom: 12px;">
                                <button type="button" id="shape-type-rect" class="mode-btn active" title="Rettangolo">Rettangolo</button>
                                <button type="button" id="shape-type-circle" class="mode-btn" title="Cerchio">Cerchio</button>
                                <button type="button" id="shape-type-line" class="mode-btn" title="Linea">Linea</button>
                            </div>
                            <div class="input-row props-grid-2">
                                <div class="input-field">
                                    <span>Bordo px:</span>
                                    <input type="number" id="shape-stroke-width" value="2" min="0" max="100">
                                </div>
                                <div class="input-field" style="border-left: 2px solid var(--bg-hover);">
                                    <input type="color" id="shape-stroke-color" value="#00ffcc" style="width: 100%; cursor: pointer;">
                                </div>
                            </div>
                            <div class="input-row props-grid-2" style="margin-top: 8px;">
                                <div class="input-field" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                                    <input type="checkbox" id="shape-fill-enabled" style="width: 16px; height: 16px; cursor: pointer;">
                                    <span>Riempimento</span>
                                </div>
                                <div class="input-field" style="border-left: 2px solid var(--bg-hover);">
                                    <input type="color" id="shape-fill-color" value="#ffffff" style="width: 100%; cursor: pointer; opacity: 0.3;" disabled>
                                </div>
                            </div>
                        </div>`;

indexHtml = indexHtml.replace(/<div class="control-group" id="magic-wand-settings-group".*?<\/div>\s*<\/div>\s*<\/div>/s, (match) => {
    return match + '\n' + shapesSettingsHtml + '\n' + lassoSettingsHtml;
});

fs.writeFileSync('index.html', indexHtml);

// 2. APP.JS
const appDomReplaceStr = `        drawToolPicker: document.getElementById("draw-tool-picker"),
        drawToolShapes: document.getElementById("draw-tool-shapes"),
        drawToolLasso: document.getElementById("draw-tool-lasso"),

        // Opzioni Strumenti
        shapesSettingsGroup: document.getElementById("shapes-settings-group"),
        shapeTypeRect: document.getElementById("shape-type-rect"),
        shapeTypeCircle: document.getElementById("shape-type-circle"),
        shapeTypeLine: document.getElementById("shape-type-line"),
        shapeStrokeWidth: document.getElementById("shape-stroke-width"),
        shapeStrokeColor: document.getElementById("shape-stroke-color"),
        shapeFillEnabled: document.getElementById("shape-fill-enabled"),
        shapeFillColor: document.getElementById("shape-fill-color"),

        lassoSettingsGroup: document.getElementById("lasso-settings-group"),
        lassoModeFree: document.getElementById("lasso-mode-free"),
        lassoModeRect: document.getElementById("lasso-mode-rect"),
        btnLassoCut: document.getElementById("btn-lasso-cut"),
        btnLassoClear: document.getElementById("btn-lasso-clear"),`;

appJs = appJs.replace(/drawToolPicker: document\.getElementById\("draw-tool-picker"\),/, appDomReplaceStr);

const stateReplaceStr = `        brush: {
            size: 10,
            blur: 0,
            isDrawing: false,
            lastX: 0,
            lastY: 0
        },
        shapes: {
            isDrawing: false,
            type: "rect",
            startX: 0, startY: 0, currentX: 0, currentY: 0,
            strokeColor: "#00ffcc",
            strokeWidth: 2,
            fillEnabled: false,
            fillColor: "#ffffff"
        },
        lasso: {
            isDrawing: false,
            mode: "free",
            points: [],
            hasSelection: false,
            startX: 0, startY: 0, currentX: 0, currentY: 0
        },`;

appJs = appJs.replace(/brush: \{[\s\S]*?lastY: 0\n        \},/, stateReplaceStr);

const toolsEventListenersStr = `        dom.drawToolShapes.addEventListener("click", () => {
            state.activeTool = "shapes";
            updateToolUI();
        });
        dom.drawToolLasso.addEventListener("click", () => {
            state.activeTool = "lasso";
            updateToolUI();
        });

        // Eventi Forme
        dom.shapeTypeRect.addEventListener("click", () => {
            state.shapes.type = "rect";
            dom.shapeTypeRect.classList.add("active");
            dom.shapeTypeCircle.classList.remove("active");
            dom.shapeTypeLine.classList.remove("active");
        });
        dom.shapeTypeCircle.addEventListener("click", () => {
            state.shapes.type = "circle";
            dom.shapeTypeCircle.classList.add("active");
            dom.shapeTypeRect.classList.remove("active");
            dom.shapeTypeLine.classList.remove("active");
        });
        dom.shapeTypeLine.addEventListener("click", () => {
            state.shapes.type = "line";
            dom.shapeTypeLine.classList.add("active");
            dom.shapeTypeRect.classList.remove("active");
            dom.shapeTypeCircle.classList.remove("active");
        });
        dom.shapeStrokeWidth.addEventListener("input", (e) => {
            state.shapes.strokeWidth = parseInt(e.target.value) || 0;
        });
        dom.shapeStrokeColor.addEventListener("input", (e) => {
            state.shapes.strokeColor = e.target.value;
        });
        dom.shapeFillEnabled.addEventListener("change", (e) => {
            state.shapes.fillEnabled = e.target.checked;
            dom.shapeFillColor.disabled = !e.target.checked;
            dom.shapeFillColor.style.opacity = e.target.checked ? "1" : "0.3";
        });
        dom.shapeFillColor.addEventListener("input", (e) => {
            state.shapes.fillColor = e.target.value;
        });

        // Eventi Lazo
        dom.lassoModeFree.addEventListener("click", () => {
            state.lasso.mode = "free";
            dom.lassoModeFree.classList.add("active");
            dom.lassoModeRect.classList.remove("active");
        });
        dom.lassoModeRect.addEventListener("click", () => {
            state.lasso.mode = "rect";
            dom.lassoModeRect.classList.add("active");
            dom.lassoModeFree.classList.remove("active");
        });
        
        dom.btnLassoCut.addEventListener("click", () => {
            if (!state.lasso.hasSelection || state.lasso.points.length < 3) return;
            const layer = getActiveLayer();
            if (!layer || layer.locked) return;
            saveState();

            const xs = state.lasso.points.map(p => p.x);
            const ys = state.lasso.points.map(p => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const w = maxX - minX;
            const h = maxY - minY;

            if (w <= 0 || h <= 0) return;

            const cutCanvas = document.createElement("canvas");
            cutCanvas.width = w;
            cutCanvas.height = h;
            const cCtx = cutCanvas.getContext("2d");

            cCtx.beginPath();
            state.lasso.points.forEach((p, i) => {
                const lx = p.x - minX;
                const ly = p.y - minY;
                if (i === 0) cCtx.moveTo(lx, ly);
                else cCtx.lineTo(lx, ly);
            });
            cCtx.closePath();
            cCtx.clip();

            if (layer.canvasImage || layer.img) {
                const renderSource = applyGlobalFilters(layer, layer.canvasImage || layer.img);
                const localMinX = minX - (layer.x + layer.w / 2);
                const localMinY = minY - (layer.y + layer.h / 2);
                
                cCtx.save();
                cCtx.translate(-localMinX, -localMinY);
                cCtx.drawImage(renderSource, 0, 0, layer.w, layer.h);
                cCtx.restore();
                
                if (!layer.drawingCanvas) {
                    layer.drawingCanvas = createDrawingCanvasForLayer(layer.w, layer.h);
                    const dCtx = layer.drawingCanvas.getContext("2d");
                    dCtx.drawImage(renderSource, 0, 0, layer.w, layer.h);
                    layer.canvasImage = layer.drawingCanvas;
                    layer.img = null;
                }
                const lCtx = layer.drawingCanvas.getContext("2d");
                lCtx.save();
                lCtx.globalCompositeOperation = "destination-out";
                lCtx.beginPath();
                state.lasso.points.forEach((p, i) => {
                    const lx = p.x - (layer.x + layer.w / 2) + layer.w / 2;
                    const ly = p.y - (layer.y + layer.h / 2) + layer.h / 2;
                    if (i === 0) lCtx.moveTo(lx, ly);
                    else lCtx.lineTo(lx, ly);
                });
                lCtx.closePath();
                lCtx.fill();
                lCtx.restore();
            }

            const newLayer = {
                id: generateId(),
                type: "image",
                visible: true,
                locked: false,
                opacity: 1,
                x: minX,
                y: minY,
                w: w,
                h: h,
                r: 0,
                canvasImage: cutCanvas,
                name: "Ritaglio Lazo"
            };

            const frame = getActiveFrame();
            frame.layers.push(newLayer);
            state.lasso.hasSelection = false;
            state.lasso.points = [];
            state.activeLayerId = newLayer.id;
            requestRender();
            if (typeof renderLayers === "function") renderLayers();
        });

        dom.btnLassoClear.addEventListener("click", () => {
            if (!state.lasso.hasSelection || state.lasso.points.length < 3) return;
            const layer = getActiveLayer();
            if (!layer || layer.locked) return;
            saveState();

            if (layer.canvasImage || layer.img) {
                const renderSource = applyGlobalFilters(layer, layer.canvasImage || layer.img);
                if (!layer.drawingCanvas) {
                    layer.drawingCanvas = createDrawingCanvasForLayer(layer.w, layer.h);
                    const dCtx = layer.drawingCanvas.getContext("2d");
                    dCtx.drawImage(renderSource, 0, 0, layer.w, layer.h);
                    layer.canvasImage = layer.drawingCanvas;
                    layer.img = null;
                }
                const lCtx = layer.drawingCanvas.getContext("2d");
                lCtx.save();
                lCtx.globalCompositeOperation = "destination-out";
                lCtx.beginPath();
                state.lasso.points.forEach((p, i) => {
                    const lx = p.x - (layer.x + layer.w / 2) + layer.w / 2;
                    const ly = p.y - (layer.y + layer.h / 2) + layer.h / 2;
                    if (i === 0) lCtx.moveTo(lx, ly);
                    else lCtx.lineTo(lx, ly);
                });
                lCtx.closePath();
                lCtx.fill();
                lCtx.restore();
            }
            state.lasso.hasSelection = false;
            state.lasso.points = [];
            requestRender();
        });`;

appJs = appJs.replace(/function setupEventListeners\(\) \{/, 'function setupEventListeners() {\n' + toolsEventListenersStr);

appJs = appJs.replace(/dom\.eraserModeGroup\.style\.display = "none";/, `dom.eraserModeGroup.style.display = "none";\n            dom.shapesSettingsGroup.style.display = "none";\n            dom.lassoSettingsGroup.style.display = "none";`);
appJs = appJs.replace(/dom\.dynamicSettingsWrapper\.appendChild\(dom\.eraserModeGroup\);/, `dom.dynamicSettingsWrapper.appendChild(dom.eraserModeGroup);\n            dom.dynamicSettingsWrapper.appendChild(dom.shapesSettingsGroup);\n            dom.dynamicSettingsWrapper.appendChild(dom.lassoSettingsGroup);`);
appJs = appJs.replace(/dom\.magicWandSettingsGroup\.style\.display = "block";/, `dom.magicWandSettingsGroup.style.display = "block";\n                } else if (state.activeTool === "shapes") {\n                    dom.shapesSettingsGroup.style.display = "block";\n                } else if (state.activeTool === "lasso") {\n                    dom.lassoSettingsGroup.style.display = "block";`);

const mouseLogicStr = `        if (state.activeTool === "shapes") {
            state.shapes.isDrawing = true;
            state.shapes.startX = coords.x;
            state.shapes.startY = coords.y;
            state.shapes.currentX = coords.x;
            state.shapes.currentY = coords.y;
            requestRender();
            return;
        }
        if (state.activeTool === "lasso") {
            state.lasso.isDrawing = true;
            state.lasso.hasSelection = false;
            state.lasso.points = [{ x: coords.x, y: coords.y }];
            state.lasso.startX = coords.x;
            state.lasso.startY = coords.y;
            state.lasso.currentX = coords.x;
            state.lasso.currentY = coords.y;
            requestRender();
            return;
        }`;
appJs = appJs.replace(/if \(layer\.locked\) \{/, mouseLogicStr + '\n\n        if (layer.locked) {');

const mouseMoveLogicStr = `        if (state.activeTool === "shapes" && state.shapes.isDrawing) {
            const coords = getCoordsOnCanvas(e);
            state.shapes.currentX = coords.x;
            state.shapes.currentY = coords.y;
            requestRender();
            return;
        }
        if (state.activeTool === "lasso" && state.lasso.isDrawing) {
            const coords = getCoordsOnCanvas(e);
            state.lasso.currentX = coords.x;
            state.lasso.currentY = coords.y;
            if (state.lasso.mode === "free") {
                state.lasso.points.push({ x: coords.x, y: coords.y });
            }
            requestRender();
            return;
        }`;
appJs = appJs.replace(/if \(\!state\.brush\.isDrawing\) return;/, mouseMoveLogicStr + '\n\n        if (!state.brush.isDrawing) return;');

const stopDrawingLogicStr = `        if (state.activeTool === "shapes" && state.shapes.isDrawing) {
            state.shapes.isDrawing = false;
            const sx = state.shapes.startX;
            const sy = state.shapes.startY;
            const ex = state.shapes.currentX;
            const ey = state.shapes.currentY;

            if (Math.abs(ex - sx) < 3 && Math.abs(ey - sy) < 3) {
                requestRender();
                return;
            }

            const minX = Math.min(sx, ex);
            const minY = Math.min(sy, ey);
            const w = Math.abs(ex - sx) || 4;
            const h = Math.abs(ey - sy) || 4;

            const shapeCanvas = document.createElement("canvas");
            const pad = state.shapes.strokeWidth;
            shapeCanvas.width = w + pad * 2;
            shapeCanvas.height = h + pad * 2;
            const sCtx = shapeCanvas.getContext("2d");

            sCtx.strokeStyle = state.shapes.strokeColor;
            sCtx.lineWidth = pad;
            if (state.shapes.fillEnabled) sCtx.fillStyle = state.shapes.fillColor;

            sCtx.beginPath();
            if (state.shapes.type === "rect") {
                if (state.shapes.fillEnabled) sCtx.fillRect(pad, pad, w, h);
                if (pad > 0) sCtx.strokeRect(pad, pad, w, h);
            } else if (state.shapes.type === "circle") {
                const rx = w / 2;
                const ry = h / 2;
                sCtx.ellipse(pad + rx, pad + ry, rx, ry, 0, 0, Math.PI * 2);
                if (state.shapes.fillEnabled) sCtx.fill();
                if (pad > 0) sCtx.stroke();
            } else if (state.shapes.type === "line") {
                const startX = (sx < ex) ? pad : pad + w;
                const startY = (sy < ey) ? pad : pad + h;
                const endX = (ex < sx) ? pad : pad + w;
                const endY = (ey < sy) ? pad : pad + h;
                sCtx.moveTo(startX, startY);
                sCtx.lineTo(endX, endY);
                if (pad > 0) sCtx.stroke();
            }

            saveState();
            const newLayer = {
                id: generateId(),
                type: "image",
                visible: true,
                locked: false,
                opacity: 1,
                x: minX - pad,
                y: minY - pad,
                w: shapeCanvas.width,
                h: shapeCanvas.height,
                r: 0,
                canvasImage: shapeCanvas,
                name: \`Forma (\${state.shapes.type})\`
            };

            const frame = getActiveFrame();
            if (frame) {
                frame.layers.push(newLayer);
                state.activeLayerId = newLayer.id;
            }

            requestRender();
            if (typeof renderLayers === "function") renderLayers();
            return;
        }

        if (state.activeTool === "lasso" && state.lasso.isDrawing) {
            state.lasso.isDrawing = false;
            state.lasso.hasSelection = true;
            if (state.lasso.mode === "rect") {
                const sx = state.lasso.startX;
                const sy = state.lasso.startY;
                const ex = state.lasso.currentX;
                const ey = state.lasso.currentY;
                state.lasso.points = [
                    { x: sx, y: sy }, { x: ex, y: sy },
                    { x: ex, y: ey }, { x: sx, y: ey }
                ];
            }
            requestRender();
            return;
        }`;
appJs = appJs.replace(/function stopDrawing\(\) \{/, 'function stopDrawing() {\n' + stopDrawingLogicStr);

const previewRenderStr = `        if (state.activeTool === "shapes" && state.shapes.isDrawing) {
            ctx.save();
            ctx.strokeStyle = state.shapes.strokeColor;
            ctx.lineWidth = state.shapes.strokeWidth / state.zoom;
            if (state.shapes.fillEnabled) ctx.fillStyle = state.shapes.fillColor;

            const sx = state.shapes.startX;
            const sy = state.shapes.startY;
            const cx = state.shapes.currentX;
            const cy = state.shapes.currentY;

            ctx.beginPath();
            if (state.shapes.type === "rect") {
                if (state.shapes.fillEnabled) ctx.fillRect(sx, sy, cx - sx, cy - sy);
                if (state.shapes.strokeWidth > 0) ctx.strokeRect(sx, sy, cx - sx, cy - sy);
            } else if (state.shapes.type === "circle") {
                const w = Math.abs(cx - sx);
                const h = Math.abs(cy - sy);
                const minX = Math.min(sx, cx);
                const minY = Math.min(sy, cy);
                const rx = w / 2;
                const ry = h / 2;
                ctx.ellipse(minX + rx, minY + ry, rx, ry, 0, 0, Math.PI * 2);
                if (state.shapes.fillEnabled) ctx.fill();
                if (state.shapes.strokeWidth > 0) ctx.stroke();
            } else if (state.shapes.type === "line") {
                ctx.moveTo(sx, sy);
                ctx.lineTo(cx, cy);
                if (state.shapes.strokeWidth > 0) ctx.stroke();
            }
            ctx.restore();
        }

        if (state.activeTool === "lasso" && (state.lasso.isDrawing || state.lasso.hasSelection) && state.lasso.points.length > 0) {
            ctx.save();
            ctx.setLineDash([5 / state.zoom, 5 / state.zoom]);
            ctx.lineDashOffset = -(Date.now() / 50) % 10;
            ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
            ctx.lineWidth = 1.5 / state.zoom;
            
            ctx.beginPath();
            state.lasso.points.forEach((p, i) => {
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            if (!state.lasso.isDrawing) ctx.closePath();
            ctx.stroke();
            
            ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
            ctx.lineDashOffset = -(Date.now() / 50) % 10 + 5;
            ctx.stroke();
            ctx.restore();
        }`;
appJs = appJs.replace(/\/\/ DISEGNO OVERLAY STRUMENTI/, '// DISEGNO OVERLAY STRUMENTI\n' + previewRenderStr);

const handleUploadRegex = /const isFirstImport = true;\s*state\.frames = \[\{\s*id: generateId\(\),\s*delay: 100,\s*layers: \[\]\s*\}\];\s*state\.activeFrameIndex = 0;/;
const handleUploadFix = `const isFirstImport = state.frames.length === 0 || (state.frames.length === 1 && state.frames[0].layers.length === 0);
                    if (isFirstImport) {
                        state.frames = [{
                            id: generateId(),
                            delay: 100,
                            layers: []
                        }];
                        state.activeFrameIndex = 0;
                    } else {
                        const newFrame = {
                            id: generateId(),
                            delay: 100,
                            layers: []
                        };
                        state.frames.push(newFrame);
                        state.activeFrameIndex = state.frames.length - 1;
                    }`;
appJs = appJs.replace(handleUploadRegex, handleUploadFix);

const referenceRegex = /name: "Rif: " \+ file\.name\.substring\(0, 12\),\s*type: "image",\s*x: Math\.round\(\(state\.canvasWidth - img\.width\) \/ 2\),\s*y: Math\.round\(\(state\.canvasHeight - img\.height\) \/ 2\),\s*w: img\.width,\s*h: img\.height,/;
const referenceFix = `name: "Rif: " + file.name.substring(0, 12),
                        type: "image",
                        x: Math.round((state.canvasWidth - (img.width * Math.min(state.canvasWidth / img.width, state.canvasHeight / img.height, 1))) / 2),
                        y: Math.round((state.canvasHeight - (img.height * Math.min(state.canvasWidth / img.width, state.canvasHeight / img.height, 1))) / 2),
                        w: Math.round(img.width * Math.min(state.canvasWidth / img.width, state.canvasHeight / img.height, 1)),
                        h: Math.round(img.height * Math.min(state.canvasWidth / img.width, state.canvasHeight / img.height, 1)),`;
appJs = appJs.replace(referenceRegex, referenceFix);

appJs = appJs.replace(/w: state\.canvasWidth,\s*h: state\.canvasHeight,\s*visible: true,\s*opacity: 0\.7,\s*r: 0,\s*keepRatio: true,\s*aspectRatio: 1,\s*img: null,/g, `w: state.canvasWidth, h: state.canvasHeight, visible: true, opacity: 0.7, r: 0, keepRatio: true, aspectRatio: 1, img: null,`);

fs.writeFileSync('js/app.js', appJs);
console.log("Patch successfully applied.");
