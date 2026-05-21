/* ==========================================================================
   GIF STUDIO - LOGICA APPLICAZIONE & FUNZIONALITÀ INTERFACCIA
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // ======================================================================
    // 1. STATO GLOBALE DELL'APPLICAZIONE
    // ======================================================================
    const state = {
        canvasWidth: 800,
        canvasHeight: 600,
        zoom: 1.0,
        gridActive: false,
        
        // Sequenza delle immagini GIF
        frames: [
            {
                id: generateId(),
                delay: 100, // tempo in millisecondi (ms)
                layers: []  // Livelli presenti in questo specifico fotogramma
            }
        ],
        activeFrameIndex: 0,
        activeLayerId: null,
        
        // Strumento di disegno in uso
        activeTool: "select", // "select" (sposta), "brush" (pennello), "eraser" (gomma), "picker" (copia colore)
        eraserMode: "brush", // "brush" (tratti) o "gif" (pixel sfondo GIF)
        editScope: "frame",  // "frame" (singolo frame) o "global" (tutta la GIF)
        colorReplacements: [], // lista sostituzioni globali
        brush: {
            size: 5,
            color: "#00ffcc",
            hardness: 100,
            isDrawing: false,
            lastX: 0,
            lastY: 0
        },
        
        // Riproduzione della GIF
        isPlaying: false,
        playInterval: null,
        
        // Registro delle posizioni e grandezze delle finestre
        windows: {},

        // Stacks storici per Undo & Redo
        undoStack: [],
        redoStack: [],
        
        // Target attivo per la pipetta (copia colore)
        colorPickerTarget: "brush", // "brush", "chroma", "replace-from", "replace-to"
        exportDirectoryHandle: null
    };

    let layoutRestoreComplete = false;
    let lastKnownScreen = { w: window.innerWidth, h: window.innerHeight };
    let cachedLayoutPayload = null;

    // ======================================================================
    // 2. ELEMENTI DELLA SCHERMATA (DOM)
    // ======================================================================
    const dom = {
        desktop: document.getElementById("desktop"),
        windowContainer: document.getElementById("window-container"),
        mainCanvas: document.getElementById("main-canvas"),
        canvasViewport: document.getElementById("canvas-viewport"),
        scrollContainer: document.getElementById("canvas-scroll-container"),
        zoomText: document.getElementById("zoom-text"),
        statusCanvasSize: document.getElementById("status-canvas-size"),
        statusActiveLayer: document.getElementById("status-active-layer"),
        statusFramesCount: document.getElementById("status-frames-count"),
        
        // Undo e Redo
        btnUndo: document.getElementById("btn-undo"),
        btnRedo: document.getElementById("btn-redo"),
        
        // Importazione ed Esportazione
        ioWidth: document.getElementById("io-canvas-width"),
        ioHeight: document.getElementById("io-canvas-height"),
        applyCanvasSize: document.getElementById("btn-apply-canvas-size"),
        fileInput: document.getElementById("file-input"),
        fileDropzone: document.getElementById("file-dropzone"),
        exportFormat: document.getElementById("export-format"),
        exportFile: document.getElementById("btn-export-file"),
        
        // Livelli (Layers)
        layerList: document.getElementById("layer-list"),
        addTextLayer: document.getElementById("btn-add-text-layer"),
        deleteLayer: document.getElementById("btn-delete-layer"),
        
        // Muovi XYZ
        xyzX: document.getElementById("xyz-val-x"),
        xyzY: document.getElementById("xyz-val-y"),
        xyzZ: document.getElementById("xyz-val-z"),
        xyzW: document.getElementById("xyz-val-w"),
        xyzH: document.getElementById("xyz-val-h"),
        xyzR: document.getElementById("xyz-val-r"),
        xyzOpacity: document.getElementById("xyz-val-opacity"),
        xyzKeepRatio: document.getElementById("xyz-keep-ratio"),
        xyzNoWarning: document.getElementById("xyz-no-layer-warning"),
        xyzControls: document.getElementById("xyz-controls"),
        
        // Gestione scritte di testo
        xyzTextEditGroup: document.getElementById("xyz-text-edit-group"),
        xyzTextContent: document.getElementById("xyz-text-content"),
        xyzTextFont: document.getElementById("xyz-text-font"),
        xyzTextColor: document.getElementById("xyz-text-color"),
        xyzTextStartFrame: document.getElementById("xyz-text-start-frame"),
        xyzTextEndFrame: document.getElementById("xyz-text-end-frame"),
        
        // Strumenti Disegno
        drawSelect: document.getElementById("draw-tool-select"),
        drawBrush: document.getElementById("draw-tool-brush"),
        drawEraser: document.getElementById("draw-tool-eraser"),
        drawPicker: document.getElementById("draw-tool-picker"),
        brushSettings: document.getElementById("brush-settings-group"),
        brushSize: document.getElementById("brush-size"),
        brushColor: document.getElementById("brush-color"),
        brushHardness: document.getElementById("brush-hardness"),
        brushHardnessText: document.getElementById("brush-hardness-text"),
        
        // Filtri e Trasparenza Sfondo
        bgRemoveActive: document.getElementById("bg-remove-active"),
        bgRemoveColor: document.getElementById("bg-remove-color"),
        btnPickBgColor: document.getElementById("btn-pick-bg-color"),
        bgRemoveTolerance: document.getElementById("bg-remove-tolerance"),
        bgRemoveToleranceSlider: document.getElementById("bg-remove-tolerance-slider"),
        filterBorderRadius: document.getElementById("filter-border-radius"),
        btnApplyCorners: document.getElementById("btn-apply-corners"),
        
        // Timeline e Riproduttore
        framesTrack: document.getElementById("timeline-frames-box"),
        btnPlayGif: document.getElementById("btn-play-gif"),
        btnPauseGif: document.getElementById("btn-pause-gif"),
        timelineDelay: document.getElementById("timeline-delay"),
        btnApplyDelayAll: document.getElementById("btn-apply-delay-all"),
        btnDuplicateFrame: document.getElementById("btn-duplicate-frame"),
        btnDeleteFrame: document.getElementById("btn-delete-frame"),
        btnReverseFrames: document.getElementById("btn-reverse-frames"),
        timelineSpeed: document.getElementById("timeline-speed-scale"),
        btnOptimizeGif: document.getElementById("btn-optimize-gif"),
        
        // UI Customizer (Temi e Colori)
        themeDark: document.getElementById("theme-dark"),
        themeCyber: document.getElementById("theme-cyber"),
        themeTerminal: document.getElementById("theme-terminal"),
        themeLight: document.getElementById("theme-light"),
        uiColorBg: document.getElementById("ui-color-bg"),
        uiColorWin: document.getElementById("ui-color-win"),
        uiColorText: document.getElementById("ui-color-text"),
        uiColorAccent: document.getElementById("ui-color-accent"),
        uiFontFamily: document.getElementById("ui-font-family"),
        uiFontSize: document.getElementById("ui-font-size"),
        uiWindowRadius: document.getElementById("ui-window-radius"),
        uiRadiusVal: document.getElementById("ui-radius-val"),
        btnResetLayout: document.getElementById("btn-reset-layout"),

        // Gomma avanzata e sostituzione colore
        xyzTextSize: document.getElementById("xyz-text-size"),
        eraserModeGroup: document.getElementById("eraser-mode-group"),
        eraserModeBrush: document.getElementById("eraser-mode-brush"),
        eraserModeGif: document.getElementById("eraser-mode-gif"),
        replaceColorFrom: document.getElementById("replace-color-from"),
        replaceColorTo: document.getElementById("replace-color-to"),
        replaceColorTolerance: document.getElementById("replace-color-tolerance"),
        btnAddReplacement: document.getElementById("btn-add-replacement"),
        replacementsListBox: document.getElementById("replacements-list-box"),
        btnPickReplaceFrom: document.getElementById("btn-pick-replace-from"),
        btnPickReplaceTo: document.getElementById("btn-pick-replace-to"),

        // Riferimento bloccato
        btnImportReference: document.getElementById("btn-import-reference"),
        fileInputReference: document.getElementById("file-input-reference"),

        // Scope modifiche
        btnScopeFrame: document.getElementById("btn-scope-frame"),
        btnScopeGlobal: document.getElementById("btn-scope-global")
    };

    const ctx = dom.mainCanvas.getContext("2d");

    // Cache temporanea per velocizzare il Chroma Key
    const filterCache = new Map();

    // ======================================================================
    // 3. FUNZIONI UTILI DI SUPPORTO (HELPERS)
    // ======================================================================
    function generateId() {
        return 'livello_' + Math.random().toString(36).substr(2, 9);
    }

    function getActiveFrame() {
        return state.frames[state.activeFrameIndex];
    }

    function getActiveLayer() {
        const frame = getActiveFrame();
        if (!frame) return null;
        return frame.layers.find(l => l.id === state.activeLayerId);
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    function rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    // Clona un elemento canvas in modo profondo preservandone il contenuto grafico
    function cloneCanvas(oldCanvas) {
        if (!oldCanvas) return null;
        const newCanvas = document.createElement("canvas");
        newCanvas.width = oldCanvas.width;
        newCanvas.height = oldCanvas.height;
        const destCtx = newCanvas.getContext("2d");
        destCtx.drawImage(oldCanvas, 0, 0);
        return newCanvas;
    }

    // Esegue una clonazione profonda dei fotogrammi e dei livelli (inclusi i canvas interni)
    function cloneFrames(framesArray) {
        return framesArray.map(f => {
            return {
                id: f.id,
                delay: f.delay,
                layers: f.layers.map(l => {
                    return {
                        ...l,
                        canvasImage: l.canvasImage ? cloneCanvas(l.canvasImage) : null,
                        drawingCanvas: l.drawingCanvas ? cloneCanvas(l.drawingCanvas) : null,
                        gifFrames: l.gifFrames ? cloneGifFrameCanvases(l.gifFrames) : undefined
                    };
                })
            };
        });
    }

    function cloneGifFrameCanvases(gifFrames) {
        if (!gifFrames || !gifFrames.length) return [];
        return gifFrames.map(fc => {
            const c = document.createElement("canvas");
            c.width = fc.width;
            c.height = fc.height;
            c.getContext("2d").drawImage(fc, 0, 0);
            return c;
        });
    }

    function getFilterCacheKey(layer, sourceImg) {
        const replacementsHash = JSON.stringify(state.colorReplacements);
        const bgRemoveHash = layer.bgRemoveActive
            ? `bg_${layer.bgRemoveColor}_${layer.bgRemoveTolerance}_${layer.bgRemoveSeedX}_${layer.bgRemoveSeedY}`
            : "bg_none";
        let framePart = `tl_${state.activeFrameIndex}`;
        if (layer.isAnimatedGif && layer.gifFrames && layer.gifFrames.length > 0) {
            const refFrameIdx = state.activeFrameIndex % layer.gifFrames.length;
            framePart += `_gif_${refFrameIdx}`;
        }
        const srcPart = sourceImg && sourceImg.width ? `_s${sourceImg.width}x${sourceImg.height}` : "";
        return `${layer.id}_${framePart}${srcPart}_filters_${replacementsHash}_${bgRemoveHash}`;
    }

    const TAB_DEFAULT_ORIGINS = {
        "tab-canvas-content": "win-canvas",
        "tab-project-file": "win-project",
        "tab-project-style": "win-project",
        "tab-tools-draw": "win-tools",
        "tab-tools-layers": "win-tools",
        "tab-prop-xyz": "win-properties",
        "tab-prop-bg": "win-properties",
        "tab-prop-colors": "win-properties",
        "tab-timeline-content": "win-timeline"
    };

    let prefsSaveTimer = null;

    function initAllTabOrigins() {
        document.querySelectorAll(".tab-btn").forEach(tab => {
            const tabId = tab.getAttribute("data-tab");
            if (!tab.hasAttribute("data-origin-win")) {
                const origin = TAB_DEFAULT_ORIGINS[tabId] || (tab.closest(".window") && tab.closest(".window").id);
                if (origin) tab.setAttribute("data-origin-win", origin);
            }
        });
    }

    function collectUiPreferences() {
        const root = document.documentElement;
        const themeClass = [...root.classList].find(c => c.startsWith("theme-")) || "theme-dark";
        return {
            themeClass,
            colorBg: dom.uiColorBg ? dom.uiColorBg.value : "#0f1013",
            colorWin: dom.uiColorWin ? dom.uiColorWin.value : "#1a1c23",
            colorText: dom.uiColorText ? dom.uiColorText.value : "#f1f5f9",
            colorAccent: dom.uiColorAccent ? dom.uiColorAccent.value : "#00ffcc",
            fontFamily: dom.uiFontFamily ? dom.uiFontFamily.value : "Inter",
            fontSize: dom.uiFontSize ? dom.uiFontSize.value : "13",
            windowRadius: dom.uiWindowRadius ? dom.uiWindowRadius.value : "10",
            editScope: state.editScope
        };
    }

    function readWindowGeometry(win) {
        return {
            top: parseInt(win.style.top, 10) || 0,
            left: parseInt(win.style.left, 10) || 0,
            width: parseInt(win.style.width, 10) || win.offsetWidth || 300,
            height: parseInt(win.style.height, 10) || win.offsetHeight || 200,
            zIndex: parseInt(win.style.zIndex, 10) || 0,
            isMinimized: win.classList.contains("minimized-window"),
            visible: win.style.display !== "none",
            pinned: win.classList.contains("pinned-window"),
            isFloating: win.classList.contains("floating-window")
        };
    }

    function normalizeWindowGeometry(geo, screenW, screenH) {
        const sw = Math.max(1, screenW);
        const sh = Math.max(1, screenH);
        return {
            ...geo,
            leftRatio: geo.left / sw,
            topRatio: geo.top / sh,
            widthRatio: geo.width / sw,
            heightRatio: geo.height / sh
        };
    }

    function denormalizeWindowGeometry(val, screenW, screenH) {
        const sw = Math.max(1, screenW);
        const sh = Math.max(1, screenH);

        if (val.leftRatio !== undefined && val.topRatio !== undefined) {
            return {
                ...val,
                left: Math.round(val.leftRatio * sw),
                top: Math.round(val.topRatio * sh),
                width: Math.max(220, Math.round(val.widthRatio * sw)),
                height: Math.max(100, Math.round(val.heightRatio * sh))
            };
        }

        return val;
    }

    function collectWindowLayout() {
        const sw = window.innerWidth;
        const sh = window.innerHeight;
        const layoutData = {};
        document.querySelectorAll(".window").forEach(win => {
            if (!win.id) return;
            layoutData[win.id] = normalizeWindowGeometry(readWindowGeometry(win), sw, sh);
        });
        return layoutData;
    }

    function applyGeometryToWindow(win, val) {
        win.style.top = `${val.top}px`;
        win.style.left = `${val.left}px`;
        win.style.width = `${val.width}px`;
        win.style.height = `${val.height}px`;
        win.style.display = val.visible ? "flex" : "none";

        if (val.zIndex) {
            win.style.zIndex = `${val.zIndex}`;
        }

        if (val.isMinimized) {
            win.classList.add("minimized-window");
            const minBtn = win.querySelector(".win-minimize");
            if (minBtn) minBtn.innerHTML = "&#43;";
        } else {
            win.classList.remove("minimized-window");
            const minBtn = win.querySelector(".win-minimize");
            if (minBtn) minBtn.innerHTML = "&#8722;";
        }

        const isPinned = !!val.pinned;
        win.classList.toggle("pinned-window", isPinned);
        const pinBtn = win.querySelector(".win-pin");
        if (pinBtn) pinBtn.classList.toggle("pinned-active", isPinned);

        const launcherBtn = document.querySelector(`.launcher-btn[data-target="${win.id}"]`);
        if (launcherBtn) {
            launcherBtn.classList.toggle("active-launcher", val.visible);
        }

        if (!win.classList.contains("floating-window")) {
            state.windows[win.id] = {
                top: val.top,
                left: val.left,
                width: val.width,
                height: val.height,
                isMinimized: val.isMinimized,
                visible: val.visible,
                pinned: isPinned
            };
        }
    }

    function clampWindowToViewport(win) {
        const width = parseInt(win.style.width, 10) || win.offsetWidth || 300;
        const height = parseInt(win.style.height, 10) || win.offsetHeight || 200;
        let left = parseInt(win.style.left, 10) || 0;
        let top = parseInt(win.style.top, 10) || 0;

        left = Math.max(-width + 120, Math.min(left, window.innerWidth - 120));
        top = Math.max(48, Math.min(top, window.innerHeight - 48));

        win.style.left = `${left}px`;
        win.style.top = `${top}px`;
    }

    function collectTabLayout() {
        const tabAssignments = [];
        const floatingWindows = [];
        document.querySelectorAll(".window").forEach(win => {
            if (!win.id) return;
            const tabs = [...win.querySelectorAll(".tab-btn")];
            if (win.classList.contains("floating-window")) {
                const geo = normalizeWindowGeometry(readWindowGeometry(win), window.innerWidth, window.innerHeight);
                floatingWindows.push({
                    left: geo.left,
                    top: geo.top,
                    width: geo.width,
                    height: geo.height,
                    leftRatio: geo.leftRatio,
                    topRatio: geo.topRatio,
                    widthRatio: geo.widthRatio,
                    heightRatio: geo.heightRatio,
                    zIndex: geo.zIndex,
                    visible: geo.visible,
                    pinned: geo.pinned,
                    isMinimized: geo.isMinimized,
                    tabs: tabs.map(t => t.getAttribute("data-tab"))
                });
            }
            tabs.forEach((tab, order) => {
                tabAssignments.push({
                    tabId: tab.getAttribute("data-tab"),
                    windowId: win.id,
                    originWin: tab.getAttribute("data-origin-win"),
                    order,
                    isActive: tab.classList.contains("active")
                });
            });
        });
        return { tabAssignments, floatingWindows };
    }

    function saveAllAppPreferences() {
        const payload = {
            version: 3,
            ui: collectUiPreferences(),
            layout: collectWindowLayout(),
            screen: { w: window.innerWidth, h: window.innerHeight },
            tabs: collectTabLayout(),
            names: {}
        };

        document.querySelectorAll(".window").forEach(win => {
            const titleEl = win.querySelector(".window-title");
            if (titleEl && titleEl.innerText) payload.names[win.id] = titleEl.innerText;
        });
        document.querySelectorAll(".tab-btn").forEach(tab => {
            const tabId = tab.getAttribute("data-tab");
            if (tabId && tab.innerText) payload.names[tabId] = tab.innerText;
        });

        try {
            localStorage.setItem("gifstudio_ui_prefs_v1", JSON.stringify(payload.ui));
            localStorage.setItem("gifstudio_layout_v5", JSON.stringify(payload.layout));
            localStorage.setItem("gifstudio_layout_v5_screen", JSON.stringify(payload.screen));
            localStorage.setItem("gifstudio_tab_layout_v1", JSON.stringify(payload.tabs));
            localStorage.setItem("gifstudio_custom_names_v1", JSON.stringify(payload.names));
        } catch (e) {
            console.warn("Salvataggio localStorage non riuscito:", e);
        }

        fetch("/api/app-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }).catch(() => {});
    }

    function scheduleSaveAllAppPreferences() {
        clearTimeout(prefsSaveTimer);
        prefsSaveTimer = setTimeout(saveAllAppPreferences, 200);
    }

    function saveUiPreferences() {
        scheduleSaveAllAppPreferences();
    }

    function saveTabLayoutToLocalStorage() {
        scheduleSaveAllAppPreferences();
    }

    function applyUiPreferences(prefs) {
        if (!prefs) return;
        const root = document.documentElement;

        if (prefs.themeClass) {
            root.className = "";
            root.classList.add(prefs.themeClass);
            const themeKey = prefs.themeClass.replace("theme-", "");
            document.querySelectorAll(".theme-btn").forEach(btn => {
                btn.classList.toggle("active", btn.dataset.theme === themeKey);
            });
        }
        if (dom.uiColorBg && prefs.colorBg) dom.uiColorBg.value = prefs.colorBg;
        if (dom.uiColorWin && prefs.colorWin) dom.uiColorWin.value = prefs.colorWin;
        if (dom.uiColorText && prefs.colorText) dom.uiColorText.value = prefs.colorText;
        if (dom.uiColorAccent && prefs.colorAccent) dom.uiColorAccent.value = prefs.colorAccent;
        if (dom.uiFontFamily && prefs.fontFamily) {
            dom.uiFontFamily.value = prefs.fontFamily;
            root.style.setProperty("--font-primary", prefs.fontFamily);
        }
        if (dom.uiFontSize && prefs.fontSize) {
            dom.uiFontSize.value = prefs.fontSize;
            root.style.setProperty("--font-size-base", `${prefs.fontSize}px`);
        }
        if (dom.uiWindowRadius && prefs.windowRadius !== undefined) {
            dom.uiWindowRadius.value = prefs.windowRadius;
            root.style.setProperty("--window-radius", `${prefs.windowRadius}px`);
            if (dom.uiRadiusVal) dom.uiRadiusVal.innerText = `${prefs.windowRadius}px`;
        }
        if (prefs.editScope === "global" && dom.btnScopeGlobal && dom.btnScopeFrame) {
            state.editScope = "global";
            dom.btnScopeGlobal.classList.add("active");
            dom.btnScopeFrame.classList.remove("active");
        } else if (prefs.editScope === "frame" && dom.btnScopeGlobal && dom.btnScopeFrame) {
            state.editScope = "frame";
            dom.btnScopeFrame.classList.add("active");
            dom.btnScopeGlobal.classList.remove("active");
        }
        if (typeof window._gifStudioUpdateThemeColors === "function") {
            window._gifStudioUpdateThemeColors();
        }
    }

    function applySavedWindowLayout(layoutData, referenceScreen) {
        if (!layoutData) return;

        const requiredIds = ["win-project", "win-tools", "win-properties", "win-canvas", "win-timeline"];
        if (!requiredIds.every(id => layoutData.hasOwnProperty(id))) return;

        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const refW = (referenceScreen && referenceScreen.w) || screenW;
        const refH = (referenceScreen && referenceScreen.h) || screenH;

        for (const [id, val] of Object.entries(layoutData)) {
            const win = document.getElementById(id);
            if (!win) continue;

            let stored = val;
            if (stored.leftRatio === undefined) {
                stored = normalizeWindowGeometry(stored, refW, refH);
            }

            const geometry = denormalizeWindowGeometry(stored, screenW, screenH);
            applyGeometryToWindow(win, geometry);
            clampWindowToViewport(win);
        }
    }

    function applySavedFloatingLayouts(floatingLayouts) {
        if (!floatingLayouts || !floatingLayouts.length) return;

        const liveFloating = [...document.querySelectorAll(".window.floating-window")];
        floatingLayouts.forEach((saved, index) => {
            let targetWin = liveFloating[index] || null;

            if (!targetWin && saved.tabs && saved.tabs.length) {
                const tabSignature = saved.tabs.join("|");
                targetWin = liveFloating.find(win => {
                    const winTabs = [...win.querySelectorAll(".tab-btn")].map(t => t.getAttribute("data-tab")).join("|");
                    return winTabs === tabSignature;
                }) || null;
            }

            if (!targetWin) return;

            let stored = saved;
            if (stored.leftRatio === undefined) {
                stored = normalizeWindowGeometry(
                    {
                        left: saved.left,
                        top: saved.top,
                        width: saved.width,
                        height: saved.height,
                        visible: saved.visible !== false,
                        pinned: !!saved.pinned,
                        isMinimized: !!saved.isMinimized
                    },
                    window.innerWidth,
                    window.innerHeight
                );
            }

            const geometry = denormalizeWindowGeometry(stored, window.innerWidth, window.innerHeight);
            applyGeometryToWindow(targetWin, {
                left: geometry.left,
                top: geometry.top,
                width: geometry.width,
                height: geometry.height,
                zIndex: saved.zIndex || targetWin.style.zIndex,
                visible: saved.visible !== false,
                pinned: !!saved.pinned,
                isMinimized: !!saved.isMinimized
            });
            clampWindowToViewport(targetWin);
        });
    }

    function reapplyProportionalLayout() {
        if (!cachedLayoutPayload) return;

        if (cachedLayoutPayload.layout) {
            applySavedWindowLayout(cachedLayoutPayload.layout, cachedLayoutPayload.screen);
        }

        if (cachedLayoutPayload.tabs && cachedLayoutPayload.tabs.floatingWindows) {
            applySavedFloatingLayouts(cachedLayoutPayload.tabs.floatingWindows);
        }
    }

    function applySavedTabLayout(tabData) {
        if (!tabData) return;

        try {
            const assignments = tabData.tabAssignments || tabData;
            const floatingWindows = tabData.floatingWindows || [];

            document.querySelectorAll(".tab-btn").forEach(tab => {
                const originId = tab.getAttribute("data-origin-win");
                const tabId = tab.getAttribute("data-tab");
                const originWin = document.getElementById(originId);
                const tabContent = document.getElementById(tabId);
                if (!originWin || !tabContent) return;
                const originHeader = originWin.querySelector(".window-tabs-header");
                const originContent = originWin.querySelector(".window-content");
                if (originHeader && originContent) {
                    originHeader.appendChild(tab);
                    originContent.appendChild(tabContent);
                }
            });
            document.querySelectorAll(".window.floating-window").forEach(w => w.remove());

            floatingWindows.forEach(fw => {
                if (!fw.tabs || !fw.tabs.length) return;

                let stored = fw;
                if (fw.leftRatio === undefined && cachedLayoutPayload && cachedLayoutPayload.screen) {
                    stored = normalizeWindowGeometry(
                        {
                            left: fw.left,
                            top: fw.top,
                            width: fw.width,
                            height: fw.height
                        },
                        cachedLayoutPayload.screen.w,
                        cachedLayoutPayload.screen.h
                    );
                } else if (fw.leftRatio === undefined) {
                    stored = normalizeWindowGeometry(
                        { left: fw.left, top: fw.top, width: fw.width, height: fw.height },
                        window.innerWidth,
                        window.innerHeight
                    );
                }
                const geo = denormalizeWindowGeometry(stored, window.innerWidth, window.innerHeight);

                let floatWin = null;
                fw.tabs.forEach((tabId, i) => {
                    const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
                    const tabContent = document.getElementById(tabId);
                    if (!tabBtn || !tabContent) return;
                    if (i === 0) {
                        floatWin = createNewFloatingWindow(geo.left, geo.top, tabBtn, tabContent);
                        if (floatWin) {
                            applyGeometryToWindow(floatWin, {
                                left: geo.left,
                                top: geo.top,
                                width: geo.width,
                                height: geo.height,
                                zIndex: fw.zIndex,
                                visible: fw.visible !== false,
                                pinned: !!fw.pinned,
                                isMinimized: !!fw.isMinimized
                            });
                            clampWindowToViewport(floatWin);
                        }
                    } else if (floatWin) {
                        const header = floatWin.querySelector(".window-tabs-header");
                        const content = floatWin.querySelector(".window-content");
                        if (header && content) {
                            header.appendChild(tabBtn);
                            content.appendChild(tabContent);
                        }
                    }
                });
            });

            const byWindow = {};
            assignments.forEach(a => {
                if (!a.tabId || !a.windowId) return;
                if (a.windowId.startsWith("win-dyn-")) return;
                if (!byWindow[a.windowId]) byWindow[a.windowId] = [];
                byWindow[a.windowId].push(a);
            });

            Object.entries(byWindow).forEach(([windowId, tabs]) => {
                tabs.sort((a, b) => (a.order || 0) - (b.order || 0));
                const targetWin = document.getElementById(windowId);
                if (!targetWin) return;
                const header = targetWin.querySelector(".window-tabs-header");
                const content = targetWin.querySelector(".window-content");
                if (!header || !content) return;

                tabs.forEach(a => {
                    const tabBtn = document.querySelector(`.tab-btn[data-tab="${a.tabId}"]`);
                    const tabContent = document.getElementById(a.tabId);
                    if (!tabBtn || !tabContent) return;
                    header.appendChild(tabBtn);
                    content.appendChild(tabContent);
                    if (a.isActive) activateTabInWindow(tabBtn, targetWin);
                });
            });

            setupTabHandlers();
            updateTabHeadersDropzones();
            if (typeof window.updateDynamicUI === "function") window.updateDynamicUI();
        } catch (e) {
            console.warn("Layout schede non ripristinato:", e);
        }
    }

    function buildPayloadFromLocalStorage() {
        try {
            const ui = localStorage.getItem("gifstudio_ui_prefs_v1");
            const layout = localStorage.getItem("gifstudio_layout_v5");
            const screen = localStorage.getItem("gifstudio_layout_v5_screen");
            const tabs = localStorage.getItem("gifstudio_tab_layout_v1");
            const names = localStorage.getItem("gifstudio_custom_names_v1");
            if (!ui && !layout && !tabs) return null;
            return {
                ui: ui ? JSON.parse(ui) : null,
                layout: layout ? JSON.parse(layout) : null,
                screen: screen ? JSON.parse(screen) : null,
                tabs: tabs ? JSON.parse(tabs) : null,
                names: names ? JSON.parse(names) : null
            };
        } catch (e) {
            return null;
        }
    }

    function applySavedLayoutPayload(payload) {
        if (!payload) return;

        if (payload.ui) applyUiPreferences(payload.ui);
        if (payload.names) {
            try {
                document.querySelectorAll(".window").forEach(win => {
                    const titleEl = win.querySelector(".window-title");
                    if (titleEl && payload.names[win.id]) titleEl.innerText = payload.names[win.id];
                });
                document.querySelectorAll(".tab-btn").forEach(tab => {
                    const tabId = tab.getAttribute("data-tab");
                    if (tabId && payload.names[tabId]) tab.innerText = payload.names[tabId];
                });
            } catch (e) {}
        }

        if (payload.tabs) {
            applySavedTabLayout(payload.tabs);
        }

        if (payload.layout) {
            applySavedWindowLayout(payload.layout, payload.screen);
        }

        if (payload.tabs && payload.tabs.floatingWindows) {
            applySavedFloatingLayouts(payload.tabs.floatingWindows);
        }
    }

    async function loadAllAppPreferences() {
        let payload = null;

        try {
            const res = await fetch("/api/app-state");
            if (res.ok) {
                const data = await res.json();
                if (data && (data.ui || data.layout || data.tabs)) {
                    payload = data;
                }
            }
        } catch (e) {
            console.warn("Lettura preferenze da file non disponibile, uso localStorage:", e);
        }

        if (!payload) {
            payload = buildPayloadFromLocalStorage();
        }

        if (!payload) return null;

        cachedLayoutPayload = payload;
        applySavedLayoutPayload(payload);
        return payload;
    }

    function restoreTabLayoutFromLocalStorage() {
        const saved = localStorage.getItem("gifstudio_tab_layout_v1");
        if (!saved) return;
        try {
            applySavedTabLayout(JSON.parse(saved));
        } catch (e) {
            console.warn("Layout schede non ripristinato:", e);
        }
    }

    function activateTabInWindow(tabBtn, targetWin) {
        if (!tabBtn || !targetWin) return;
        const tabId = tabBtn.getAttribute("data-tab");
        targetWin.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));
        tabBtn.classList.add("active");
        targetWin.querySelectorAll(".tab-content").forEach(content => {
            content.classList.toggle("active-content", content.id === tabId);
        });
    }

    function syncAnimatedReferenceToAllFrames(layerId, gifFrames, meta) {
        if (!layerId || !gifFrames || !gifFrames.length) return;

        state.frames.forEach(frame => {
            const tl = frame.layers.find(l => l.id === layerId);
            if (!tl) return;

            tl.isAnimatedGif = true;
            tl.gifFrames = cloneGifFrameCanvases(gifFrames);
            tl.w = meta.w;
            tl.h = meta.h;
            tl.aspectRatio = meta.aspectRatio;
            tl.x = meta.x;
            tl.y = meta.y;
            tl.keepRatio = meta.keepRatio !== undefined ? meta.keepRatio : true;

            const img = new Image();
            img.src = tl.gifFrames[0].toDataURL("image/png");
            tl.img = img;
            filterCache.delete(tl.id);
        });

        requestRender();
        updateLayersListUI();
        updateXYZControlsUI();
    }

    // Propaga le modifiche geometriche ed estetiche ai livelli corrispondenti negli altri fotogrammi
    function propagateLayerChanges(activeLayer, properties, forceGlobal = false) {
        if (!activeLayer) return;
        
        // Se lo scope è "frame" (singolo frame) e non stiamo forzando una modifica globale (es. Scritte), non facciamo nulla.
        if (state.editScope === "frame" && !forceGlobal) {
            return;
        }

        // Propaga a tutti gli altri fotogrammi
        state.frames.forEach((frame) => {
            // Cerchiamo il livello omologo in questo frame:
            // 1. Per ID (perfetto per le scritte create con lo stesso ID)
            let targetLayer = frame.layers.find(l => l.id === activeLayer.id);
            
            // 2. Per Indice (perfetto per i frame delle immagini GIF il cui ID varia per fotogramma)
            if (!targetLayer) {
                const activeFrame = getActiveFrame();
                if (activeFrame) {
                    const activeLayerIndex = activeFrame.layers.findIndex(l => l.id === activeLayer.id);
                    if (activeLayerIndex !== -1 && activeLayerIndex < frame.layers.length) {
                        targetLayer = frame.layers[activeLayerIndex];
                    }
                }
            }

            if (targetLayer && targetLayer !== activeLayer) {
                // Copia le proprietà passate
                for (const [key, value] of Object.entries(properties)) {
                    if ((key === "canvasImage" || key === "drawingCanvas" || key === "img" || key === "gifFrames") && !activeLayer.isReference) {
                        continue;
                    }
                    if (key === "gifFrames" && Array.isArray(value)) {
                        targetLayer[key] = cloneGifFrameCanvases(value);
                    } else if (key === "img" && value && value.src) {
                        const imgCopy = new Image();
                        imgCopy.src = value.src;
                        targetLayer[key] = imgCopy;
                    } else {
                        targetLayer[key] = value;
                    }
                }
                // Rimuoviamo la cache dei filtri per questo livello
                filterCache.delete(targetLayer.id);
            }
        });
    }

    // Decodifica la GIF di riferimento animata in background salvando i frame
    function decodeUploadedReferenceGif(arrayBuffer, layer) {
        try {
            let rawFrames = [];
            let gifWidth = 0;
            let gifHeight = 0;

            const TargetGIFClass = window.GifReader || window.GIF;

            if (typeof TargetGIFClass === "function" && !TargetGIFClass.parseGIF) {
                const gifInstance = new TargetGIFClass(arrayBuffer);
                rawFrames = gifInstance.decompressFrames(true);
                if (gifInstance.raw && gifInstance.raw.lsd) {
                    gifWidth = gifInstance.raw.lsd.width;
                    gifHeight = gifInstance.raw.lsd.height;
                } else {
                    throw new Error("Dati LSD del file GIF non trovati.");
                }
            } else {
                let parseGIF_fn = window.parseGIF || (TargetGIFClass && TargetGIFClass.parseGIF) || (window.gifuctJS && window.gifuctJS.parseGIF);
                let decompressFrames_fn = window.decompressFrames || (TargetGIFClass && TargetGIFClass.decompressFrames) || (window.gifuctJS && window.gifuctJS.decompressFrames);
                
                if (!parseGIF_fn || !decompressFrames_fn) {
                    throw new Error("Libreria di lettura GIF non caricata o non compatibile.");
                }
                
                const gifData = parseGIF_fn(arrayBuffer);
                rawFrames = decompressFrames_fn(gifData, true);
                if (gifData && gifData.lsd) {
                    gifWidth = gifData.lsd.width;
                    gifHeight = gifData.lsd.height;
                }
            }

            if (!rawFrames || rawFrames.length === 0) {
                console.error("Questa GIF di riferimento non contiene fotogrammi validi.");
                return;
            }

            layer.gifFrames = [];
            layer.isAnimatedGif = true;

            const tempCanvas = document.createElement("canvas");
            const tempCtx = tempCanvas.getContext("2d");
            tempCanvas.width = gifWidth;
            tempCanvas.height = gifHeight;

            rawFrames.forEach((rawFrame, idx) => {
                const disposal = rawFrame.disposalType;
                if (idx === 0 || disposal === 2 || disposal === 3) {
                    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                }

                const frameCanvas = document.createElement("canvas");
                frameCanvas.width = rawFrame.dims.width;
                frameCanvas.height = rawFrame.dims.height;
                const frameCtx = frameCanvas.getContext("2d");
                
                const imageData = frameCtx.createImageData(rawFrame.dims.width, rawFrame.dims.height);
                imageData.data.set(rawFrame.patch);
                frameCtx.putImageData(imageData, 0, 0);

                tempCtx.drawImage(frameCanvas, rawFrame.dims.left, rawFrame.dims.top);

                const savedCanvas = document.createElement("canvas");
                savedCanvas.width = gifWidth;
                savedCanvas.height = gifHeight;
                savedCanvas.getContext("2d").drawImage(tempCanvas, 0, 0);

                layer.gifFrames.push(savedCanvas);
            });

            // Centra il livello e imposta le proporzioni reali
            layer.w = gifWidth;
            layer.h = gifHeight;
            layer.aspectRatio = gifWidth / gifHeight;
            layer.x = Math.round((state.canvasWidth - gifWidth) / 2);
            layer.y = Math.round((state.canvasHeight - gifHeight) / 2);

            const firstFrameImg = new Image();
            firstFrameImg.onload = () => {
                requestRender();
                updateLayersListUI();
                updateXYZControlsUI();
            };
            firstFrameImg.src = layer.gifFrames[0].toDataURL("image/png");
            layer.img = firstFrameImg;

            syncAnimatedReferenceToAllFrames(layer.id, layer.gifFrames, {
                w: layer.w,
                h: layer.h,
                aspectRatio: layer.aspectRatio,
                x: layer.x,
                y: layer.y,
                keepRatio: layer.keepRatio
            });

            console.log(`GIF di riferimento decodificata. Frame totali: ${layer.gifFrames.length}`);
        } catch (err) {
            console.error("Errore durante la decodifica della GIF di riferimento animata:", err);
        }
    }

    // Salva lo stato corrente nello stack Undo, svuotando il Redo
    function saveState() {
        state.undoStack.push({
            frames: cloneFrames(state.frames),
            activeFrameIndex: state.activeFrameIndex,
            activeLayerId: state.activeLayerId
        });
        if (state.undoStack.length > 40) {
            state.undoStack.shift();
        }
        state.redoStack = [];
        updateUndoRedoButtons();
    }

    // Aggiorna lo stato visivo dei pulsanti Undo e Redo
    function updateUndoRedoButtons() {
        if (dom.btnUndo) {
            const canUndo = state.undoStack.length > 0;
            dom.btnUndo.disabled = !canUndo;
            dom.btnUndo.style.opacity = canUndo ? "1" : "0.3";
        }
        if (dom.btnRedo) {
            const canRedo = state.redoStack.length > 0;
            dom.btnRedo.disabled = !canRedo;
            dom.btnRedo.style.opacity = canRedo ? "1" : "0.3";
        }
    }

    // Ripristina l'ultimo stato salvato
    function undo() {
        if (state.undoStack.length === 0) return;
        
        state.redoStack.push({
            frames: cloneFrames(state.frames),
            activeFrameIndex: state.activeFrameIndex,
            activeLayerId: state.activeLayerId
        });

        const prevState = state.undoStack.pop();
        state.frames = prevState.frames;
        state.activeFrameIndex = prevState.activeFrameIndex;
        state.activeLayerId = prevState.activeLayerId;

        filterCache.clear();
        updateUndoRedoButtons();
        
        buildTimelineUI();
        updateLayersListUI();
        updateXYZControlsUI();
        requestRender();
    }

    // Ripristina lo stato annullato
    function redo() {
        if (state.redoStack.length === 0) return;

        state.undoStack.push({
            frames: cloneFrames(state.frames),
            activeFrameIndex: state.activeFrameIndex,
            activeLayerId: state.activeLayerId
        });

        const nextState = state.redoStack.pop();
        state.frames = nextState.frames;
        state.activeFrameIndex = nextState.activeFrameIndex;
        state.activeLayerId = nextState.activeLayerId;

        filterCache.clear();
        updateUndoRedoButtons();

        buildTimelineUI();
        updateLayersListUI();
        updateXYZControlsUI();
        requestRender();
    }

    function setupTabHandlers() {
        document.querySelectorAll(".window-tabs-header").forEach(header => {
            const tabs = header.querySelectorAll(".tab-btn");
            const win = header.closest(".window");
            if (!win) return;
            tabs.forEach(tab => {
                tab.removeEventListener("click", handleTabBtnClick);
                tab.addEventListener("click", handleTabBtnClick);
            });
        });
        if (typeof updateTabHeadersDropzones === "function") {
            updateTabHeadersDropzones();
        }
    }

    function handleTabBtnClick(e) {
        const tab = e.currentTarget;
        const win = tab.closest(".window");
        if (!win) return;
        activateTabInWindow(tab, win);
    }

    function clearTabDragHighlights() {
        document.querySelectorAll(".window.drag-over-window").forEach(w => w.classList.remove("drag-over-window"));
        document.querySelectorAll(".window-tabs-header.drag-over-tabs").forEach(h => h.classList.remove("drag-over-tabs"));
    }

    function isTabDragEvent(e) {
        const types = e.dataTransfer ? Array.from(e.dataTransfer.types) : [];
        return types.includes("application/x-gifstudio-tab") || types.includes("text/plain");
    }

    function moveTabToWindow(tabBtn, tabContent, targetWin) {
        if (!tabBtn || !tabContent || !targetWin) return;
        const header = targetWin.querySelector(".window-tabs-header");
        const targetContentContainer = targetWin.querySelector(".window-content");
        if (!header || !targetContentContainer) return;

        const sourceWin = tabBtn.closest(".window");
        header.appendChild(tabBtn);
        targetContentContainer.appendChild(tabContent);
        activateTabInWindow(tabBtn, targetWin);

        if (sourceWin && sourceWin !== targetWin) {
            if (sourceWin.classList.contains("floating-window")) {
                const remainingTabs = sourceWin.querySelectorAll(".tab-btn");
                if (remainingTabs.length === 0) {
                    sourceWin.remove();
                } else {
                    const firstTab = sourceWin.querySelector(".tab-btn");
                    if (firstTab) activateTabInWindow(firstTab, sourceWin);
                }
            } else {
                const remainingTabs = sourceWin.querySelectorAll(".tab-btn");
                if (remainingTabs.length > 0) {
                    const firstTab = sourceWin.querySelector(".tab-btn");
                    if (firstTab) activateTabInWindow(firstTab, sourceWin);
                }
            }
        }

        setupTabHandlers();
        updateTabHeadersDropzones();
        saveLayoutToLocalStorage();
        if (typeof window.updateDynamicUI === "function") window.updateDynamicUI();
    }

    function bindWindowDropTargets() {
        document.querySelectorAll(".window").forEach(win => {
            win.removeEventListener("dragover", handleWindowDragOver);
            win.addEventListener("dragover", handleWindowDragOver);
            win.removeEventListener("dragleave", handleWindowDragLeave);
            win.addEventListener("dragleave", handleWindowDragLeave);
            win.removeEventListener("drop", handleWindowDrop);
            win.addEventListener("drop", handleWindowDrop);
        });
    }

    function handleWindowDragOver(e) {
        if (!isTabDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        e.currentTarget.classList.add("drag-over-window");
    }

    function handleWindowDragLeave(e) {
        const win = e.currentTarget;
        if (!win.contains(e.relatedTarget)) {
            win.classList.remove("drag-over-window");
        }
    }

    function handleWindowDrop(e) {
        if (e.target.closest(".window-tabs-header")) return;
        if (!isTabDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();

        const targetWin = e.currentTarget;
        targetWin.classList.remove("drag-over-window");

        const tabId = e.dataTransfer.getData("text/plain");
        const tabBtn = document.querySelector(`.tab-btn[data-tab='${tabId}']`);
        const tabContent = document.getElementById(tabId);
        if (!tabBtn || !tabContent) return;

        const sourceWin = tabBtn.closest(".window");
        if (sourceWin === targetWin) return;

        moveTabToWindow(tabBtn, tabContent, targetWin);
    }

    function initTabDockingSystem() {
        const winContainer = dom.windowContainer || document.getElementById("window-container");
        if (!winContainer) return;

        initAllTabOrigins();
        
        document.addEventListener("dragover", (e) => {
            if (isTabDragEvent(e)) e.preventDefault();
        });

        document.addEventListener("drop", (e) => {
            if (e.target.closest(".window-tabs-header")) return;
            if (e.target.closest(".window")) return;

            if (!isTabDragEvent(e)) return;

            const tabId = e.dataTransfer.getData("text/plain");
            if (!tabId) return;

            const tabBtn = document.querySelector(`.tab-btn[data-tab='${tabId}']`);
            if (!tabBtn) return;

            const tabContent = document.getElementById(tabId);
            if (!tabContent) return;

            const sourceWin = tabBtn.closest(".window");

            const rect = winContainer.getBoundingClientRect();
            // Calcola le coordinate relative a winContainer
            let x = e.clientX - rect.left - 100;
            let y = e.clientY - rect.top - 15;

            // Limiti protettivi per non far nascere la finestra fuori dallo schermo
            x = Math.max(10, Math.min(x, window.innerWidth - 320));
            y = Math.max(10, Math.min(y, window.innerHeight - 340));

            const newWin = createNewFloatingWindow(x, y, tabBtn, tabContent);
            if (newWin) activateTabInWindow(tabBtn, newWin);

            if (sourceWin && sourceWin.classList.contains("floating-window")) {
                const remainingTabs = sourceWin.querySelectorAll(".tab-btn");
                if (remainingTabs.length === 0) {
                    sourceWin.remove();
                } else {
                    const firstTab = sourceWin.querySelector(".tab-btn");
                    if (firstTab) activateTabInWindow(firstTab, sourceWin);
                }
            } else if (sourceWin) {
                const remainingTabs = sourceWin.querySelectorAll(".tab-btn");
                if (remainingTabs.length > 0) {
                    const firstTab = sourceWin.querySelector(".tab-btn");
                    if (firstTab) activateTabInWindow(firstTab, sourceWin);
                }
            }
            
            updateTabHeadersDropzones();
            saveLayoutToLocalStorage();
        });

        updateTabHeadersDropzones();
        bindWindowDropTargets();
    }

    function updateTabHeadersDropzones() {
        document.querySelectorAll(".window-tabs-header").forEach(header => {
            header.removeEventListener("dragover", handleHeaderDragOver);
            header.addEventListener("dragover", handleHeaderDragOver);

            header.removeEventListener("dragleave", handleHeaderDragLeave);
            header.addEventListener("dragleave", handleHeaderDragLeave);

            header.removeEventListener("drop", handleHeaderDrop);
            header.addEventListener("drop", handleHeaderDrop);
        });

        document.querySelectorAll(".tab-btn").forEach(tab => {
            tab.setAttribute("draggable", "true");

            const tabId = tab.getAttribute("data-tab");
            if (!tab.hasAttribute("data-origin-win")) {
                const origin = TAB_DEFAULT_ORIGINS[tabId] || (tab.closest(".window") && tab.closest(".window").id);
                if (origin) tab.setAttribute("data-origin-win", origin);
            }

            tab.removeEventListener("dragstart", handleTabDragStart);
            tab.addEventListener("dragstart", handleTabDragStart);

            tab.removeEventListener("dragend", handleTabDragEnd);
            tab.addEventListener("dragend", handleTabDragEnd);
        });

        bindWindowDropTargets();
    }

    function handleHeaderDragOver(e) {
        if (!isTabDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        e.currentTarget.classList.add("drag-over-tabs");
        const win = e.currentTarget.closest(".window");
        if (win) win.classList.add("drag-over-window");
    }

    function handleHeaderDragLeave(e) {
        const header = e.currentTarget;
        if (!header.contains(e.relatedTarget)) {
            header.classList.remove("drag-over-tabs");
            const win = header.closest(".window");
            if (win && !win.contains(e.relatedTarget)) {
                win.classList.remove("drag-over-window");
            }
        }
    }

    function handleHeaderDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        const header = e.currentTarget;
        header.classList.remove("drag-over-tabs");
        const targetWin = header.closest(".window");
        if (targetWin) targetWin.classList.remove("drag-over-window");

        const tabId = e.dataTransfer.getData("text/plain");
        const tabBtn = document.querySelector(`.tab-btn[data-tab='${tabId}']`);
        const tabContent = document.getElementById(tabId);
        if (!tabBtn || !tabContent || !targetWin) return;

        const sourceWin = tabBtn.closest(".window");
        if (sourceWin === targetWin) return;

        moveTabToWindow(tabBtn, tabContent, targetWin);
    }

    function handleTabDragStart(e) {
        e.stopPropagation();
        const tabId = e.currentTarget.getAttribute("data-tab");
        e.dataTransfer.setData("text/plain", tabId);
        e.dataTransfer.setData("application/x-gifstudio-tab", tabId);
        e.currentTarget.classList.add("tab-dragging");
        e.dataTransfer.effectAllowed = "move";
    }

    function handleTabDragEnd(e) {
        e.currentTarget.classList.remove("tab-dragging");
        clearTabDragHighlights();
    }

    function createNewFloatingWindow(x, y, tabBtn, tabContent) {
        const uniqueId = "win-dyn-" + generateId();
        
        const win = document.createElement("div");
        win.id = uniqueId;
        win.className = "window floating-window active-window";
        win.style.position = "absolute";
        win.style.left = `${x}px`;
        win.style.top = `${y}px`;
        win.style.width = "300px";
        win.style.height = "320px";
        win.style.zIndex = "5000";
        win.style.display = "flex";
        win.style.flexDirection = "column";

        win.innerHTML = `
            <div class="window-header">
                <span class="window-title">${tabBtn.innerText.trim()}</span>
                <div class="window-controls">
                    <button class="win-btn win-pin" title="Sopra Tutto (Mantieni in primo piano)">
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M5 9l7-7 7 7"/></svg>
                    </button>
                    <button class="win-btn win-minimize">&#8722;</button>
                    <button class="win-btn win-close" title="Chiudi Finestra" style="font-size: 14px; font-weight: bold; margin-left: 4px;">&times;</button>
                </div>
            </div>
            <div class="window-tabs-header"></div>
            <div class="window-content" style="flex: 1; position: relative; display: flex; flex-direction: column;"></div>
            <div class="win-resize-handle-br"></div>
            <div class="win-resize-handle-bl"></div>
            <div class="win-resize-handle-tr"></div>
            <div class="win-resize-handle-tl"></div>
        `;

        const winContainer = dom.windowContainer || document.getElementById("window-container");
        winContainer.appendChild(win);

        const tabsHeader = win.querySelector(".window-tabs-header");
        const winContent = win.querySelector(".window-content");

        tabsHeader.appendChild(tabBtn);
        winContent.appendChild(tabContent);

        activateTabInWindow(tabBtn, win);

        bindWindowEvents(win);

        const closeBtn = win.querySelector(".win-close");
        if (closeBtn) {
            closeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const tabs = win.querySelectorAll(".tab-btn");
                tabs.forEach(tab => {
                    const originWinId = tab.getAttribute("data-origin-win") || "win-properties";
                    const originWin = document.getElementById(originWinId);
                    const tabId = tab.getAttribute("data-tab");
                    const tabContent = document.getElementById(tabId);
                    if (originWin && tabContent) {
                        const originHeader = originWin.querySelector(".window-tabs-header");
                        const originContent = originWin.querySelector(".window-content");
                        if (originHeader && originContent) {
                            originHeader.appendChild(tab);
                            originContent.appendChild(tabContent);
                            originWin.style.display = "flex";
                            tab.click();
                        }
                    }
                });
                win.remove();
                setupTabHandlers();
                saveLayoutToLocalStorage();
            });
        }

        setupTabHandlers();
        updateTabHeadersDropzones();
        saveLayoutToLocalStorage();

        return win;
    }

    function updateReplacementsUI() {
            if (!dom.replacementsListBox) return;
            
            dom.replacementsListBox.innerHTML = "";
            let replCount = 0;

            state.colorReplacements.forEach((rep, idx) => {
                const item = document.createElement("div");
                item.className = "replacement-item";
                
                replCount++;
                const fromSwatch = `<span class="replacement-color-swatch" style="background-color: ${rep.from};" title="${rep.from}"></span>`;
                const toSwatch = `<span class="replacement-color-swatch" style="background-color: ${rep.to};" title="${rep.to}"></span>`;
                item.innerHTML = `
                    <div class="replacement-colors">
                        ${fromSwatch} <span class="replacement-color-arrow">&rarr;</span> ${toSwatch}
                    </div>
                    <div class="replacement-details">
                        <span class="replacement-tolerance">Toll: ${rep.tolerance}</span>
                    </div>
                    <button type="button" class="replacement-btn-delete" data-index="${idx}" title="Elimina regola">
                         <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                             <line x1="18" y1="6" x2="6" y2="18"></line>
                             <line x1="6" y1="6" x2="18" y2="18"></line>
                         </svg>
                    </button>
                `;
                item.querySelector(".replacement-btn-delete").addEventListener("click", () => {
                    state.colorReplacements.splice(idx, 1);
                    updateReplacementsUI();
                    filterCache.clear();
                    requestRender();
                });
                dom.replacementsListBox.appendChild(item);
            });
    }

    // ======================================================================
    // 4. GESTIONE FINESTRE FLUTTUANTI (WINDOW MANAGER) CON COORD. INTELLIGENTI
    // ======================================================================
    let highestNormalZ = 1000;
    let highestPinnedZ = 9500;

    function focusWindow(win) {
        document.querySelectorAll(".window").forEach(w => w.classList.remove("active-window"));
        win.classList.add("active-window");

        const isPinned = win.classList.contains("pinned-window");
        if (isPinned) {
            highestPinnedZ += 2;
            win.style.zIndex = highestPinnedZ;
        } else {
            highestNormalZ += 2;
            win.style.zIndex = highestNormalZ;
        }
    }

    function toggleMinimize(win) {
        const winId = win.id;
        const isMin = win.classList.toggle("minimized-window");
        if (state.windows[winId]) {
            state.windows[winId].isMinimized = isMin;
        }
        
        const btn = win.querySelector(".win-minimize");
        if (btn) btn.innerHTML = isMin ? "&#43;" : "&#8722;";
        saveLayoutToLocalStorage();
    }

    function bindWindowEvents(win) {
        const header = win.querySelector(".window-header");
        const resizeHandles = win.querySelectorAll(".win-resize-handle-br, .win-resize-handle-bl, .win-resize-handle-tr, .win-resize-handle-tl");
        const minimizeBtn = win.querySelector(".win-minimize");
        const winId = win.id;

        win.addEventListener("mousedown", () => {
            focusWindow(win);
        });

        const pinBtn = win.querySelector(".win-pin");
        if (pinBtn) {
            pinBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                
                const isPinnedNow = win.classList.toggle("pinned-window");
                pinBtn.classList.toggle("pinned-active", isPinnedNow);
                
                if (state.windows[winId]) {
                    state.windows[winId].pinned = isPinnedNow;
                }
                
                focusWindow(win);
                saveLayoutToLocalStorage();
            });
        }

        if (header) {
            header.addEventListener("mousedown", (e) => {
                if (e.target.classList.contains("win-btn") || e.target.closest(".win-btn") || e.target.classList.contains("tab-btn")) return;
                
                focusWindow(win);
                win.classList.add("dragging");
                
                let startX = e.clientX;
                let startY = e.clientY;
                let startLeft = parseInt(win.style.left) || 0;
                let startTop = parseInt(win.style.top) || 0;

                function onMouseMove(moveEvent) {
                    let deltaX = moveEvent.clientX - startX;
                    let deltaY = moveEvent.clientY - startY;
                    
                    let newLeft = startLeft + deltaX;
                    let newTop = startTop + deltaY;

                    newTop = Math.max(48, Math.min(window.innerHeight - 40, newTop));
                    newLeft = Math.max(-100, Math.min(window.innerWidth - 100, newLeft));

                    win.style.left = newLeft + "px";
                    win.style.top = newTop + "px";
                    
                    if (state.windows[winId]) {
                        state.windows[winId].left = newLeft;
                        state.windows[winId].top = newTop;
                    }
                }

                function onMouseUp() {
                    win.classList.remove("dragging");
                    document.removeEventListener("mousemove", onMouseMove);
                    document.removeEventListener("mouseup", onMouseUp);
                    saveLayoutToLocalStorage();
                }

                document.addEventListener("mousemove", onMouseMove);
                document.addEventListener("mouseup", onMouseUp);
            });

            header.addEventListener("dblclick", (e) => {
                if (e.target.classList.contains("win-btn") || e.target.closest(".win-btn") || e.target.classList.contains("tab-btn")) return;
                toggleMinimize(win);
            });
        }

        resizeHandles.forEach(handle => {
            handle.addEventListener("mousedown", (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                focusWindow(win);
                win.classList.add("resizing");

                let startWidth = parseInt(win.style.width) || win.offsetWidth;
                let startHeight = parseInt(win.style.height) || win.offsetHeight;
                let startLeft = parseInt(win.style.left) || 0;
                let startTop = parseInt(win.style.top) || 0;
                let startX = e.clientX;
                let startY = e.clientY;

                let isLeft = handle.classList.contains("win-resize-handle-bl") || handle.classList.contains("win-resize-handle-tl");
                let isTop = handle.classList.contains("win-resize-handle-tr") || handle.classList.contains("win-resize-handle-tl");

                function onMouseMove(moveEvent) {
                    let deltaX = moveEvent.clientX - startX;
                    let deltaY = moveEvent.clientY - startY;

                    let newW = startWidth + (isLeft ? -deltaX : deltaX);
                    let newH = startHeight + (isTop ? -deltaY : deltaY);

                    if (newW < 220) {
                        deltaX = isLeft ? (startWidth - 220) : (220 - startWidth);
                        newW = 220;
                    }
                    if (newH < 100) {
                        deltaY = isTop ? (startHeight - 100) : (100 - startHeight);
                        newH = 100;
                    }

                    win.style.width = newW + "px";
                    win.style.height = newH + "px";
                    
                    if (isLeft) win.style.left = (startLeft + deltaX) + "px";
                    if (isTop) win.style.top = (startTop + deltaY) + "px";
                    
                    if (state.windows[winId]) {
                        state.windows[winId].width = newW;
                        state.windows[winId].height = newH;
                        if (isLeft) state.windows[winId].left = startLeft + deltaX;
                        if (isTop) state.windows[winId].top = startTop + deltaY;
                    }
                }

                function onMouseUp() {
                    win.classList.remove("resizing");
                    document.removeEventListener("mousemove", onMouseMove);
                    document.removeEventListener("mouseup", onMouseUp);
                    saveLayoutToLocalStorage();
                }

                document.addEventListener("mousemove", onMouseMove);
                document.addEventListener("mouseup", onMouseUp);
            });
        });

        if (minimizeBtn) {
            minimizeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleMinimize(win);
            });
        }
    }

    function setupWindowManager() {
        const windows = document.querySelectorAll(".window");
        windows.forEach(win => {
            bindWindowEvents(win);
        });

    const windowIconsMap = {
        "win-project": `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3"/></svg>`,
        "win-tools": `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
        "win-canvas": `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>`,
        "win-properties": `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>`,
        "win-timeline": `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`
    };

    window.updateDynamicUI = function() {
        const quickLauncher = document.getElementById("quick-launcher");
        if (!quickLauncher) return;
        quickLauncher.innerHTML = "";
        
        document.querySelectorAll(".window").forEach(win => {
            const tabs = win.querySelectorAll(".tab-btn");
            const titleSpan = win.querySelector(".window-title");
            
            if (tabs.length > 0) {
                const firstOrigin = tabs[0].getAttribute("data-origin-win");
                const svgIcon = windowIconsMap[firstOrigin] || windowIconsMap["win-tools"];
                
                if (titleSpan && !titleSpan.querySelector("input")) {
                    const existingIcon = titleSpan.querySelector(".win-title-icon");
                    if (existingIcon) {
                        existingIcon.outerHTML = `<span class="win-title-icon" style="margin-right:6px; display:inline-flex; align-items:center;">${svgIcon.replace('width="18"', 'width="14"').replace('height="18"', 'height="14"')}</span>`;
                    } else {
                        let currentText = titleSpan.innerText;
                        titleSpan.innerHTML = `<span class="win-title-icon" style="margin-right:6px; display:inline-flex; align-items:center;">${svgIcon.replace('width="18"', 'width="14"').replace('height="18"', 'height="14"')}</span>${currentText}`;
                    }
                }
                
                const btn = document.createElement("button");
                btn.className = "launcher-btn";
                if (win.style.display !== "none") btn.classList.add("active-launcher");
                btn.setAttribute("data-target", win.id);
                btn.title = `Mostra/Nascondi: ${titleSpan ? titleSpan.innerText.trim() : win.id}`;
                btn.innerHTML = svgIcon;
                
                btn.addEventListener("click", () => {
                    if (win.style.display === "none") {
                        win.style.display = "flex";
                        win.classList.remove("minimized-window");
                        btn.classList.add("active-launcher");
                        if (state.windows[win.id]) state.windows[win.id].visible = true;
                    } else {
                        win.style.display = "none";
                        btn.classList.remove("active-launcher");
                        if (state.windows[win.id]) state.windows[win.id].visible = false;
                    }
                    saveLayoutToLocalStorage();
                });
                quickLauncher.appendChild(btn);
            } else {
                if (titleSpan && !titleSpan.querySelector("input")) {
                    const iconSpan = titleSpan.querySelector('.win-title-icon');
                    if (iconSpan) iconSpan.remove();
                }
            }
        });
    };

        dom.btnResetLayout.addEventListener("click", () => {
            // Sposta TUTTI i tab nelle loro cartelle originali (se non ci sono già)
            document.querySelectorAll(".tab-btn").forEach(tab => {
                const originWinId = tab.getAttribute("data-origin-win");
                if (originWinId) {
                    const originWin = document.getElementById(originWinId);
                    const tabContent = document.getElementById(tab.getAttribute("data-tab"));
                    if (originWin && tabContent && !originWin.contains(tab)) {
                        const originHeader = originWin.querySelector(".window-tabs-header");
                        const originContent = originWin.querySelector(".window-content");
                        if (originHeader && originContent) {
                            originHeader.appendChild(tab);
                            originContent.appendChild(tabContent);
                        }
                    }
                }
            });
            // Elimina tutte le finestre fluttuanti
            document.querySelectorAll(".window.floating-window").forEach(win => {
                win.remove();
            });
            arrangeWindowsDefault();
            setupTabHandlers();
            if (typeof window.updateDynamicUI === "function") window.updateDynamicUI();
            layoutRestoreComplete = true;
            lastKnownScreen = { w: window.innerWidth, h: window.innerHeight };
            saveLayoutToLocalStorage();
        });
    }

    // ======================================================================
    // 5. DISPOSIZIONE AUTOMATICA INTELLIGENTE ED EVITAMENTO ACCAVALLAMENTI
    // ======================================================================
    function adaptLayoutToScreenSize(prevW, prevH, currentW, currentH, force = false) {
        if (!prevW || !prevH || !currentW || !currentH) return;
        if (!force && prevW === currentW && prevH === currentH) return;

        const gap = 12;
        const topBarH = 48;
        const requiredIds = ["win-project", "win-tools", "win-properties", "win-canvas", "win-timeline"];

        requiredIds.forEach(id => {
            const win = document.getElementById(id);
            if (!win) return;

            let left = parseInt(win.style.left) || 0;
            let top = parseInt(win.style.top) || 0;
            let width = parseInt(win.style.width) || win.offsetWidth;
            let height = parseInt(win.style.height) || win.offsetHeight;

            // 1. Adatta la coordinata X (left) e larghezza (width)
            if (id === "win-project") {
                left = gap;
                width = (win && parseInt(win.style.width)) || 300;
            } else if (id === "win-tools") {
                const projectWin = document.getElementById("win-project");
                const projectW = (projectWin && parseInt(projectWin.style.width)) || 300;
                left = gap + projectW + gap;
                width = (win && parseInt(win.style.width)) || 300;
            } else if (id === "win-properties") {
                width = (win && parseInt(win.style.width)) || 320;
                left = currentW - width - gap;
            } else if (id === "win-canvas" || id === "win-timeline") {
                const projectWin = document.getElementById("win-project");
                const projectW = (projectWin && parseInt(projectWin.style.width)) || 300;
                const toolsWin = document.getElementById("win-tools");
                const toolsW = (toolsWin && parseInt(toolsWin.style.width)) || 300;
                const leftCanvas = gap + projectW + gap + toolsW + gap;
                
                left = leftCanvas;
                const propertiesWin = document.getElementById("win-properties");
                const propertiesW = (propertiesWin && parseInt(propertiesWin.style.width)) || 320;
                width = Math.max(400, currentW - leftCanvas - propertiesW - gap * 2);
            } else {
                left = Math.round(left * (currentW / prevW));
                width = Math.round(width * (currentW / prevW));
            }

            // 2. Adatta la coordinata Y (top) e l'altezza (height)
            if (id === "win-project" || id === "win-tools" || id === "win-properties") {
                top = topBarH + gap;
                height = Math.max(500, currentH - topBarH - gap - 80);
            } else if (id === "win-canvas") {
                top = topBarH + gap;
                const timelineWin = document.getElementById("win-timeline");
                const timelineH = (timelineWin && parseInt(timelineWin.style.height)) || 170;
                height = Math.max(300, currentH - topBarH - timelineH - gap * 3 - 80);
            } else if (id === "win-timeline") {
                const canvasWin = document.getElementById("win-canvas");
                const canvasH = (canvasWin && parseInt(canvasWin.style.height)) || 300;
                top = topBarH + gap + canvasH + gap;
                height = (win && parseInt(win.style.height)) || 170;
            } else {
                top = Math.round(top * (currentH / prevH));
                height = Math.round(height * (currentH / prevH));
            }

            // Applica stili
            win.style.left = left + "px";
            win.style.top = top + "px";
            win.style.width = width + "px";
            win.style.height = height + "px";

            // Aggiorna lo stato in memoria
            state.windows[id] = {
                left: left,
                top: top,
                width: width,
                height: height,
                isMinimized: win.classList.contains("minimized-window"),
                visible: win.style.display !== "none",
                pinned: win.classList.contains("pinned-window")
            };
        });

        // Salva le nuove coordinate
        const layoutData = {};
        for (const [id, data] of Object.entries(state.windows)) {
            const w = document.getElementById(id);
            if (w) {
                layoutData[id] = {
                    top: parseInt(w.style.top),
                    left: parseInt(w.style.left),
                    width: parseInt(w.style.width),
                    height: parseInt(w.style.height),
                    isMinimized: w.classList.contains("minimized-window"),
                    visible: w.style.display !== "none",
                    pinned: w.classList.contains("pinned-window")
                };
            }
        }
        localStorage.setItem("gifstudio_layout_v5", JSON.stringify(layoutData));
        localStorage.setItem("gifstudio_layout_v5_screen", JSON.stringify({ w: currentW, h: currentH }));
    }

    function arrangeWindowsDefault() {
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        const topBarH = 48;
        const gap = 12;

        // Columns:
        // Col 1 (Project): Width 300px
        const colProject_W = 300;
        // Col 2 (Tools): Width 300px
        const colTools_W = 300;
        // Col 4 (Properties): Width 320px
        const colProperties_W = 320;
        
        // Calculated height for sidebars (leaves ~80px for dock and margins)
        const sidebarH = Math.max(500, screenH - topBarH - gap - 80);

        // Calcola dinamicamente la larghezza del canvas centrale
        const left_canvas = gap + colProject_W + gap + colTools_W + gap; // 636px
        const canvas_W = Math.max(400, screenW - left_canvas - colProperties_W - gap * 2);
        
        // Altezze per canvas centrale e timeline
        const timelineH = 170;
        const canvasH = Math.max(300, screenH - topBarH - timelineH - gap * 3 - 80);

        const defaults = {
            "win-project": {
                top: topBarH + gap,
                left: gap,
                width: colProject_W,
                height: sidebarH,
                visible: true,
                isMinimized: false
            },
            "win-tools": {
                top: topBarH + gap,
                left: gap + colProject_W + gap,
                width: colTools_W,
                height: sidebarH,
                visible: true,
                isMinimized: false
            },
            "win-properties": {
                top: topBarH + gap,
                left: screenW - colProperties_W - gap,
                width: colProperties_W,
                height: sidebarH,
                visible: true,
                isMinimized: false
            },
            "win-canvas": {
                top: topBarH + gap,
                left: left_canvas,
                width: canvas_W,
                height: canvasH,
                visible: true,
                isMinimized: false
            },
            "win-timeline": {
                top: topBarH + gap + canvasH + gap,
                left: left_canvas,
                width: canvas_W,
                height: timelineH,
                visible: true,
                isMinimized: false
            }
        };

        for (const [id, val] of Object.entries(defaults)) {
            const win = document.getElementById(id);
            if (win) {
                win.style.top = val.top + "px";
                win.style.left = val.left + "px";
                win.style.width = val.width + "px";
                win.style.height = val.height + "px";
                win.style.display = val.visible ? "flex" : "none";
                win.classList.remove("minimized-window");
                
                const minBtn = win.querySelector(".win-minimize");
                if (minBtn) minBtn.innerHTML = "&#8722;";
                
                const btn = document.querySelector(`.launcher-btn[data-target="${id}"]`);
                if (btn) {
                    btn.classList.toggle("active-launcher", val.visible);
                }

                // Memorizza nello stato
                state.windows[id] = {
                    top: val.top,
                    left: val.left,
                    width: val.width,
                    height: val.height,
                    isMinimized: false,
                    visible: val.visible,
                    pinned: state.windows[id] ? !!state.windows[id].pinned : false
                };
            }
        }
        saveLayoutToLocalStorage();
    }

    // ======================================================================
    // 6. SALVATAGGIO E CARICAMENTO AUTOMATICO (LOCALSTORAGE)
    // ======================================================================
    function saveLayoutToLocalStorage() {
        scheduleSaveAllAppPreferences();
    }

    function loadLayoutFromLocalStorage() {
        const saved = localStorage.getItem("gifstudio_layout_v5");
        if (!saved) {
            arrangeWindowsDefault();
            return;
        }
        try {
            const layoutData = JSON.parse(saved);
            let screen = null;
            const savedScreenStr = localStorage.getItem("gifstudio_layout_v5_screen");
            if (savedScreenStr) {
                screen = JSON.parse(savedScreenStr);
            }
            applySavedWindowLayout(layoutData, screen);
        } catch (e) {
            console.error("Errore nel ripristino del layout:", e);
            arrangeWindowsDefault();
        }
    }

    // ======================================================================
    // 7. MOTORE DI RENDERING E GESTIONE AREA CANVAS
    // ======================================================================
    function initCanvasWorkspace() {
        applyWorkspaceDimensions(800, 600);
        
        dom.scrollContainer.addEventListener("wheel", (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const zoomFactor = 0.1;
                if (e.deltaY < 0) adjustZoom(state.zoom + zoomFactor);
                else adjustZoom(state.zoom - zoomFactor);
            }
        });

        document.getElementById("btn-zoom-in").addEventListener("click", () => adjustZoom(state.zoom + 0.1));
        document.getElementById("btn-zoom-out").addEventListener("click", () => adjustZoom(state.zoom - 0.1));
        document.getElementById("btn-zoom-reset").addEventListener("click", () => {
            adjustZoom(1.0);
            setTimeout(centerCanvas, 10);
        });
        
        document.getElementById("btn-toggle-grid").addEventListener("click", (e) => {
            state.gridActive = !state.gridActive;
            e.currentTarget.classList.toggle("active", state.gridActive);
            requestRender();
        });
    }

    function applyWorkspaceDimensions(w, h) {
        state.canvasWidth = w;
        state.canvasHeight = h;
        dom.mainCanvas.width = w;
        dom.mainCanvas.height = h;
        
        dom.ioWidth.value = w;
        dom.ioHeight.value = h;
        dom.statusCanvasSize.innerText = `${w}x${h} px`;
        
        adjustZoom(state.zoom);
        requestRender();
    }

    function adjustZoom(newZoom) {
        state.zoom = Math.max(0.1, Math.min(30.0, newZoom));
        dom.mainCanvas.style.transform = `scale(${state.zoom})`;
        dom.zoomText.innerText = `${Math.round(state.zoom * 100)}%`;
        
        const extraPadding = 200;
        dom.canvasViewport.style.width = `${(state.canvasWidth * state.zoom) + extraPadding}px`;
        dom.canvasViewport.style.height = `${(state.canvasHeight * state.zoom) + extraPadding}px`;
    }

    function centerCanvas() {
        const container = dom.scrollContainer;
        const viewport = dom.canvasViewport;
        if (container && viewport) {
            container.scrollLeft = (viewport.scrollWidth - container.clientWidth) / 2;
            container.scrollTop = (viewport.scrollHeight - container.clientHeight) / 2;
        }
    }

    // Calcola lo zoom ottimale per inserire perfettamente il canvas all'interno del contenitore visibile
    function autoZoomToFit(w, h) {
        const containerW = dom.scrollContainer.clientWidth || 600;
        const containerH = dom.scrollContainer.clientHeight || 400;
        
        // Lascia un piccolo margine laterale protettivo per estetica premium
        const margin = 32;
        const targetW = containerW - margin;
        const targetH = containerH - margin;
        
        let zoomFactor = Math.min(targetW / w, targetH / h);
        // Limita lo zoom adattivo tra 0.1x e 20.0x per adattarsi magnificamente a file giganti e icone microscopiche
        zoomFactor = Math.max(0.1, Math.min(20.0, zoomFactor));
        
        adjustZoom(zoomFactor);
        setTimeout(centerCanvas, 10);
    }

    // ======================================================================
    // 8. LOGICA LIVELLI (LAYERS) E COORDINATE XYZ DI PRECISIONE
    // ======================================================================
    function addLayer(layerObj) {
        const frame = getActiveFrame();
        if (!frame) return;

        saveState(); // Salva lo stato per l'Undo prima di aggiungere il livello

        const maxZ = frame.layers.reduce((max, l) => Math.max(max, isNaN(l.z) ? 0 : (l.z || 0)), 0);
        layerObj.z = maxZ + 1;
        
        frame.layers.push(layerObj);
        state.activeLayerId = layerObj.id;
        
        updateLayersListUI();
        updateXYZControlsUI();
        requestRender();
    }

    function removeActiveLayer() {
        const frame = getActiveFrame();
        if (!frame || !state.activeLayerId) return;

        const layerToDelete = frame.layers.find(l => l.id === state.activeLayerId);
        if (!layerToDelete) return;

        saveState(); // Salva lo stato per l'Undo prima di rimuovere il livello

        if (layerToDelete.type === "text" || layerToDelete.isReference === true) {
            // Rimuovi da TUTTI i fotogrammi
            state.frames.forEach(f => {
                f.layers = f.layers.filter(l => l.id !== state.activeLayerId);
            });
        } else {
            frame.layers = frame.layers.filter(l => l.id !== state.activeLayerId);
        }
        
        filterCache.delete(state.activeLayerId);
        state.activeLayerId = frame.layers.length > 0 ? frame.layers[frame.layers.length - 1].id : null;
        
        updateLayersListUI();
        updateXYZControlsUI();
        requestRender();
    }

    function createDrawingCanvasForLayer(w, h) {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        return canvas;
    }

    function updateLayersListUI() {
        dom.layerList.innerHTML = "";
        const frame = getActiveFrame();
        if (!frame) return;

        const sortedLayers = [...frame.layers].sort((a, b) => b.z - a.z);

        if (sortedLayers.length === 0) {
            dom.layerList.innerHTML = `<li class="layer-warning">Nessun livello inserito</li>`;
            dom.statusActiveLayer.innerText = "Nessuno";
            return;
        }

        sortedLayers.forEach(layer => {
            const li = document.createElement("li");
            li.className = `layer-item ${layer.id === state.activeLayerId ? 'active-layer' : ''}`;
            li.dataset.id = layer.id;
            
            let thumbContent = "";
            if (layer.type === "image" && layer.img) {
                thumbContent = `<img src="${layer.img.src}" alt="preview">`;
            } else if (layer.type === "text") {
                thumbContent = `<span style="font-weight:bold; font-size:10px;">Scritta</span>`;
            }

            li.innerHTML = `
                <div class="layer-info">
                    <div class="layer-thumbnail">${thumbContent}</div>
                    <span class="layer-name">${layer.locked ? '🔒 ' : ''}${layer.name}</span>
                </div>
                <div class="layer-visibility" title="Mostra/Nascondi Livello">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="opacity: ${layer.visible ? 1 : 0.3}">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                </div>
            `;

            li.addEventListener("click", (e) => {
                if (e.target.closest(".layer-visibility")) {
                    layer.visible = !layer.visible;
                    updateLayersListUI();
                    requestRender();
                    return;
                }
                state.activeLayerId = layer.id;
                
                // Switch automatico a select quando un livello bloccato viene selezionato
                if (layer.locked && state.activeTool !== "select") {
                    dom.drawSelect.click();
                }

                updateLayersListUI();
                updateXYZControlsUI();
                requestRender();
            });

            dom.layerList.appendChild(li);
        });

        const active = getActiveLayer();
        dom.statusActiveLayer.innerText = active ? active.name : "Nessuno";
    }

    function updateBgRemoveActiveUI(isActive) {
        const label = document.getElementById("label-bg-remove-active");
        if (!label) return;
        
        if (isActive) {
            label.style.background = "linear-gradient(135deg, #00ffcc 0%, #0099ff 100%)";
            label.style.color = "#0d0e12";
            label.style.boxShadow = "0 0 15px rgba(0, 255, 204, 0.4)";
            label.style.border = "none";
            label.innerHTML = `<span class="status-icon">🟢</span> <span class="status-text">Trasparenza Sfondo Attiva</span>`;
        } else {
            label.style.background = "rgba(255, 255, 255, 0.05)";
            label.style.color = "var(--text-secondary)";
            label.style.boxShadow = "none";
            label.style.border = "1px solid rgba(255, 255, 255, 0.1)";
            label.innerHTML = `<span class="status-icon">⚪</span> <span class="status-text">Attiva Trasparenza Sfondo</span>`;
        }
    }

    function updateXYZControlsUI() {
        const layer = getActiveLayer();
        if (!layer) {
            dom.xyzNoWarning.style.display = "block";
            dom.xyzControls.classList.add("disabled-content");
            dom.xyzTextEditGroup.style.display = "none";
            return;
        }

        dom.xyzNoWarning.style.display = "none";
        dom.xyzControls.classList.remove("disabled-content");

        dom.xyzX.value = Math.round(layer.x);
        dom.xyzY.value = Math.round(layer.y);
        dom.xyzZ.value = layer.z;
        dom.xyzW.value = Math.round(layer.w);
        dom.xyzH.value = Math.round(layer.h);
        dom.xyzR.value = layer.r;
        dom.xyzOpacity.value = Math.round(layer.opacity * 100);
        dom.xyzKeepRatio.checked = layer.keepRatio;
        
        // Filtri e Trasparenza Sfondo
        dom.filterBorderRadius.value = layer.borderRadius || 0;
        
        if (dom.bgRemoveActive) {
            dom.bgRemoveActive.checked = !!layer.bgRemoveActive;
            updateBgRemoveActiveUI(!!layer.bgRemoveActive);
        }
        if (dom.bgRemoveColor) {
            dom.bgRemoveColor.value = layer.bgRemoveColor || "#ffffff";
        }
        if (dom.bgRemoveTolerance) {
            dom.bgRemoveTolerance.value = layer.bgRemoveTolerance !== undefined ? layer.bgRemoveTolerance : 20;
        }
        if (dom.bgRemoveToleranceSlider) {
            dom.bgRemoveToleranceSlider.value = layer.bgRemoveTolerance !== undefined ? layer.bgRemoveTolerance : 20;
        }

        // Disabilitazione intelligente dei tab Filtri e Colori per i livelli di Riferimento Bloccati
        const filtersTabs = document.querySelectorAll("#win-properties .window-tabs-header [data-tab='tab-prop-bg'], #win-properties .window-tabs-header [data-tab='tab-prop-colors']");
        if (layer.locked) {
            filtersTabs.forEach(tab => {
                tab.style.opacity = "0.3";
                tab.style.pointerEvents = "none";
            });
            const activeTab = document.querySelector("#win-properties .window-tabs-header .tab-btn.active");
            if (activeTab && (activeTab.getAttribute("data-tab") === "tab-prop-bg" || activeTab.getAttribute("data-tab") === "tab-prop-colors")) {
                const xyzTab = document.querySelector("#win-properties .window-tabs-header [data-tab='tab-prop-xyz']");
                if (xyzTab) xyzTab.click();
            }
        } else {
            filtersTabs.forEach(tab => {
                tab.style.opacity = "1";
                tab.style.pointerEvents = "auto";
            });
        }

        // Pannello scritte e intervallo di frame
        if (layer.type === "text") {
            dom.xyzTextEditGroup.style.display = "block";
            dom.xyzTextContent.value = layer.text;
            dom.xyzTextFont.value = layer.fontFamily;
            dom.xyzTextColor.value = layer.fontColor;
            dom.xyzTextSize.value = layer.fontSize || 32;
        } else {
            dom.xyzTextEditGroup.style.display = "none";
        }

        const showRange = (layer.type === "text" || layer.isReference === true);
        const rangeGroup = document.getElementById("xyz-frame-range-group");
        if (rangeGroup) {
            rangeGroup.style.display = showRange ? "block" : "none";
        }
        if (showRange) {
            dom.xyzTextStartFrame.value = layer.startFrame !== undefined ? layer.startFrame : 1;
            dom.xyzTextEndFrame.value = layer.endFrame !== undefined ? layer.endFrame : state.frames.length;
        }
    }

    function handleXYZInput(e) {
        const layer = getActiveLayer();
        if (!layer) return;

        const id = e.target.id;
        const val = parseFloat(e.target.value);

        if (id === "xyz-val-x") layer.x = val;
        else if (id === "xyz-val-y") layer.y = val;
        else if (id === "xyz-val-z") {
            layer.z = Math.max(1, parseInt(e.target.value));
            const frame = getActiveFrame();
            frame.layers.sort((a, b) => a.z - b.z);
            updateLayersListUI();
        } 
        else if (id === "xyz-val-w") {
            if (layer.keepRatio && layer.aspectRatio) {
                layer.w = val;
                layer.h = val / layer.aspectRatio;
                dom.xyzH.value = Math.round(layer.h);
            } else {
                layer.w = val;
            }
        } 
        else if (id === "xyz-val-h") {
            if (layer.keepRatio && layer.aspectRatio) {
                layer.h = val;
                layer.w = val * layer.aspectRatio;
                dom.xyzW.value = Math.round(layer.w);
            } else {
                layer.h = val;
            }
        } 
        else if (id === "xyz-val-r") layer.r = val;
        else if (id === "xyz-val-opacity") layer.opacity = Math.max(0, Math.min(100, val)) / 100;
        else if (id === "xyz-keep-ratio") layer.keepRatio = e.target.checked;
        
        // Input testo
        else if (id === "xyz-text-content") {
            layer.text = e.target.value;
            ctx.font = `${layer.fontSize}px ${layer.fontFamily}`;
            const metrics = ctx.measureText(layer.text);
            layer.w = Math.max(50, Math.round(metrics.width + 20));
            dom.xyzW.value = layer.w;
        }
        else if (id === "xyz-text-font") {
            layer.fontFamily = e.target.value;
        }
        else if (id === "xyz-text-color") {
            layer.fontColor = e.target.value;
        }
        else if (id === "xyz-text-size") {
            layer.fontSize = Math.max(5, parseInt(e.target.value) || 12);
            ctx.font = `${layer.fontSize}px ${layer.fontFamily}`;
            const metrics = ctx.measureText(layer.text);
            layer.w = Math.max(50, Math.round(metrics.width + 20));
            layer.h = Math.max(10, Math.round(layer.fontSize * 1.5));
            dom.xyzW.value = layer.w;
            dom.xyzH.value = layer.h;
        }
        else if (id === "xyz-text-start-frame") {
            const minFrame = 1;
            const maxFrame = state.frames.length;
            let startVal = Math.max(minFrame, Math.min(maxFrame, parseInt(e.target.value) || 1));
            
            // Garantisce che start non superi mai end
            if (layer.endFrame !== undefined && startVal > layer.endFrame) {
                startVal = layer.endFrame;
                dom.xyzTextStartFrame.value = startVal;
            }
            layer.startFrame = startVal;
        }
        else if (id === "xyz-text-end-frame") {
            const minFrame = 1;
            const maxFrame = state.frames.length;
            let endVal = Math.max(minFrame, Math.min(maxFrame, parseInt(e.target.value) || 1));
            
            // Garantisce che end non sia inferiore a start
            if (layer.startFrame !== undefined && endVal < layer.startFrame) {
                endVal = layer.startFrame;
                dom.xyzTextEndFrame.value = endVal;
            }
            layer.endFrame = endVal;
        }

        // Propaga geometricamente le modifiche (rispetta lo scope)
        const geomProps = {
            x: layer.x,
            y: layer.y,
            z: layer.z,
            w: layer.w,
            h: layer.h,
            r: layer.r,
            opacity: layer.opacity,
            keepRatio: layer.keepRatio,
            aspectRatio: layer.aspectRatio
        };
        if (layer.startFrame !== undefined) geomProps.startFrame = layer.startFrame;
        if (layer.endFrame !== undefined) geomProps.endFrame = layer.endFrame;
        propagateLayerChanges(layer, geomProps, false);

        // Propaga le proprietà del testo delle Scritte e dei Riferimenti (sempre globali)
        if (layer.type === "text" || layer.isReference === true) {
            const globalProps = {
                startFrame: layer.startFrame,
                endFrame: layer.endFrame
            };
            if (layer.type === "text") {
                globalProps.text = layer.text;
                globalProps.fontFamily = layer.fontFamily;
                globalProps.fontSize = layer.fontSize;
                globalProps.fontColor = layer.fontColor;
            }
            propagateLayerChanges(layer, globalProps, true);
        }

        filterCache.delete(layer.id);
        requestRender();
    }

    // ======================================================================
    // ======================================================================
    // 9. SOSTITUZIONE COLORE GENERALE
    // ======================================================================
    function applyColorReplacementToImageData(data, width, height, rep) {
        if (!rep.fromRgb || !rep.toRgb) return;

        const maxDist = (rep.tolerance !== undefined ? rep.tolerance : 20) * 1.73205;

        if (rep.type === "chain-erase") {
            if (rep.seedX == null || rep.seedY == null || rep.seedX === undefined) return;
            const visited = new Uint8Array(width * height);
            const queue = [];
            const startX = Math.round(rep.seedX);
            const startY = Math.round(rep.seedY);
            if (startX >= 0 && startX < width && startY >= 0 && startY < height) {
                const startPos = startY * width + startX;
                if (data[startPos * 4 + 3] > 0) {
                    visited[startPos] = 1;
                    queue.push(startPos);
                    data[startPos * 4 + 3] = 0;
                }
            }
            let head = 0;
            const dx = [-1, 1, 0, 0];
            const dy = [0, 0, -1, 1];
            while (head < queue.length) {
                const pos = queue[head++];
                const currX = pos % width;
                const currY = Math.floor(pos / width);
                for (let d = 0; d < 4; d++) {
                    const nx = currX + dx[d];
                    const ny = currY + dy[d];
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nPos = ny * width + nx;
                        if (!visited[nPos] && data[nPos * 4 + 3] > 0) {
                            visited[nPos] = 1;
                            data[nPos * 4 + 3] = 0;
                            queue.push(nPos);
                        }
                    }
                }
            }
            return;
        }

        const useSeed = rep.seedX != null && rep.seedY != null && rep.seedX !== undefined;

        if (useSeed) {
            const visited = new Uint8Array(width * height);
            const queue = [];
            const startX = Math.round(rep.seedX);
            const startY = Math.round(rep.seedY);
            if (startX >= 0 && startX < width && startY >= 0 && startY < height) {
                const startPos = startY * width + startX;
                visited[startPos] = 1;
                queue.push(startPos);
            }
            let head = 0;
            const dx = [-1, 1, 0, 0];
            const dy = [0, 0, -1, 1];
            while (head < queue.length) {
                const pos = queue[head++];
                const currX = pos % width;
                const currY = Math.floor(pos / width);
                const idx = pos * 4;
                if (data[idx + 3] > 0) {
                    const diffR = data[idx] - rep.fromRgb.r;
                    const diffG = data[idx + 1] - rep.fromRgb.g;
                    const diffB = data[idx + 2] - rep.fromRgb.b;
                    if (Math.sqrt(diffR * diffR + diffG * diffG + diffB * diffB) <= maxDist) {
                        if (rep.makeTransparent) {
                            data[idx + 3] = 0;
                        } else {
                            data[idx] = rep.toRgb.r;
                            data[idx + 1] = rep.toRgb.g;
                            data[idx + 2] = rep.toRgb.b;
                            data[idx + 3] = 255;
                        }
                        for (let d = 0; d < 4; d++) {
                            const nx = currX + dx[d];
                            const ny = currY + dy[d];
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const nPos = ny * width + nx;
                                if (!visited[nPos]) {
                                    visited[nPos] = 1;
                                    queue.push(nPos);
                                }
                            }
                        }
                    }
                }
            }
        } else {
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] === 0) continue;
                const diffR = data[i] - rep.fromRgb.r;
                const diffG = data[i + 1] - rep.fromRgb.g;
                const diffB = data[i + 2] - rep.fromRgb.b;
                if (Math.sqrt(diffR * diffR + diffG * diffG + diffB * diffB) <= maxDist) {
                    if (rep.makeTransparent) {
                        data[i + 3] = 0;
                    } else {
                        data[i] = rep.toRgb.r;
                        data[i + 1] = rep.toRgb.g;
                        data[i + 2] = rep.toRgb.b;
                        data[i + 3] = 255;
                    }
                }
            }
        }
    }

    function bakeColorReplacementToProject(rep) {
        const repObj = {
            fromRgb: hexToRgb(rep.from),
            toRgb: hexToRgb(rep.to),
            tolerance: rep.tolerance !== undefined ? rep.tolerance : 20,
            makeTransparent: !!rep.transparent,
            seedX: rep.seedX,
            seedY: rep.seedY,
            type: rep.type
        };
        if (!repObj.fromRgb || !repObj.toRgb) return;

        if (state.editScope === "global") {
            repObj.seedX = null;
            repObj.seedY = null;
        }

        const targetFrames = state.editScope === "global"
            ? state.frames
            : [getActiveFrame()].filter(Boolean);

        targetFrames.forEach(frame => {
            frame.layers.forEach(layer => {
                if (layer.type !== "image") return;

                const processCanvas = (canvas) => {
                    if (!canvas) return;
                    const cctx = canvas.getContext("2d");
                    const w = canvas.width;
                    const h = canvas.height;
                    const imgData = cctx.getImageData(0, 0, w, h);
                    applyColorReplacementToImageData(imgData.data, w, h, repObj);
                    cctx.putImageData(imgData, 0, 0);
                };

                if (layer.isAnimatedGif && layer.gifFrames && layer.gifFrames.length > 0) {
                    layer.gifFrames.forEach(processCanvas);
                    const img = new Image();
                    img.src = layer.gifFrames[0].toDataURL("image/png");
                    layer.img = img;
                } else {
                    if (!layer.canvasImage && layer.img) {
                        layer.canvasImage = document.createElement("canvas");
                        layer.canvasImage.width = layer.img.naturalWidth || layer.w;
                        layer.canvasImage.height = layer.img.naturalHeight || layer.h;
                        layer.canvasImage.getContext("2d").drawImage(layer.img, 0, 0, layer.canvasImage.width, layer.canvasImage.height);
                    }
                    if (layer.canvasImage) processCanvas(layer.canvasImage);
                }
                if (layer.drawingCanvas) processCanvas(layer.drawingCanvas);
                filterCache.delete(layer.id);
            });
        });
    }

    function applyGlobalFilters(layer, sourceImg) {
        const hasReplacements = state.colorReplacements && state.colorReplacements.length > 0;
        const hasBgRemove = !!layer.bgRemoveActive;
        
        if (!hasReplacements && !hasBgRemove) {
            return sourceImg;
        }

        const cacheKey = getFilterCacheKey(layer, sourceImg);
        
        if (filterCache.has(cacheKey)) {
            return filterCache.get(cacheKey);
        }

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = layer.w;
        tempCanvas.height = layer.h;
        const tempCtx = tempCanvas.getContext("2d");
        
        tempCtx.drawImage(sourceImg, 0, 0, layer.w, layer.h);
        
        const imgData = tempCtx.getImageData(0, 0, layer.w, layer.h);
        const data = imgData.data;
        const width = Math.round(layer.w);
        const height = Math.round(layer.h);

        // 1. DELIMITAZIONE SOGGETTO CENTRALE & TRASPARENZA ESTERNA
        if (hasBgRemove) {
            const targetRgb = hexToRgb(layer.bgRemoveColor || "#ffffff");
            const tol = layer.bgRemoveTolerance !== undefined ? layer.bgRemoveTolerance : 20;
            const maxDist = tol * 1.73205;
            
            // A. BFS 1: Trova lo sfondo esterno contiguo (OuterBackground)
            const visitedOuterBg = new Uint8Array(width * height);
            const outerQueue = [];
            
            function isBackgroundPixel(x, y) {
                if (x < 0 || x >= width || y < 0 || y >= height) return false;
                const idx = (y * width + x) * 4;
                if (data[idx + 3] === 0) return true; // Già trasparente è considerato sfondo
                
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                
                const dr = r - targetRgb.r;
                const dg = g - targetRgb.g;
                const db = b - targetRgb.b;
                const dist = Math.sqrt(dr * dr + dg * dg + db * db);
                
                return dist <= maxDist;
            }
            
            // Inserisci i semi per lo sfondo esterno
            let hasSeed = false;
            if (layer.bgRemoveSeedX !== null && layer.bgRemoveSeedY !== null && layer.bgRemoveSeedX !== undefined) {
                const seedX = Math.round(layer.bgRemoveSeedX);
                const seedY = Math.round(layer.bgRemoveSeedY);
                if (isBackgroundPixel(seedX, seedY)) {
                    const startPos = seedY * width + seedX;
                    visitedOuterBg[startPos] = 1;
                    outerQueue.push(startPos);
                    hasSeed = true;
                }
            }
            
            // Se non c'è un seme cliccato valido, usiamo tutti i bordi dell'immagine come semi di sfondo
            if (!hasSeed) {
                // Righe superiore e inferiore
                for (let x = 0; x < width; x++) {
                    if (isBackgroundPixel(x, 0)) {
                        const pos = x;
                        if (!visitedOuterBg[pos]) {
                            visitedOuterBg[pos] = 1;
                            outerQueue.push(pos);
                        }
                    }
                    if (isBackgroundPixel(x, height - 1)) {
                        const pos = (height - 1) * width + x;
                        if (!visitedOuterBg[pos]) {
                            visitedOuterBg[pos] = 1;
                            outerQueue.push(pos);
                        }
                    }
                }
                // Colonne sinistra e destra
                for (let y = 0; y < height; y++) {
                    if (isBackgroundPixel(0, y)) {
                        const pos = y * width;
                        if (!visitedOuterBg[pos]) {
                            visitedOuterBg[pos] = 1;
                            outerQueue.push(pos);
                        }
                    }
                    if (isBackgroundPixel(width - 1, y)) {
                        const pos = y * width + (width - 1);
                        if (!visitedOuterBg[pos]) {
                            visitedOuterBg[pos] = 1;
                            outerQueue.push(pos);
                        }
                    }
                }
            }
            
            // Esegui la prima BFS per diffondere lo sfondo esterno
            let outerHead = 0;
            const dx = [-1, 1, 0, 0];
            const dy = [0, 0, -1, 1];
            
            while (outerHead < outerQueue.length) {
                const pos = outerQueue[outerHead++];
                const currX = pos % width;
                const currY = Math.floor(pos / width);
                
                for (let d = 0; d < 4; d++) {
                    const nx = currX + dx[d];
                    const ny = currY + dy[d];
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nPos = ny * width + nx;
                        if (!visitedOuterBg[nPos]) {
                            if (isBackgroundPixel(nx, ny)) {
                                visitedOuterBg[nPos] = 1;
                                outerQueue.push(nPos);
                            }
                        }
                    }
                }
            }
            
            // B. BFS 2: Trova il soggetto principale (MainSubject) partendo dal centro
            const visitedSubject = new Uint8Array(width * height);
            const subjectQueue = [];
            
            const centerX = Math.floor(width / 2);
            const centerY = Math.floor(height / 2);
            
            // Un pixel fa parte del soggetto se NON è parte dello sfondo esterno (visitedOuterBg === 0)
            function isSubjectCandidate(x, y) {
                if (x < 0 || x >= width || y < 0 || y >= height) return false;
                const idx = y * width + x;
                return visitedOuterBg[idx] === 0;
            }
            
            let startX = centerX;
            let startY = centerY;
            let foundSeed = false;
            
            if (isSubjectCandidate(centerX, centerY)) {
                foundSeed = true;
            } else {
                const maxRadius = Math.max(width, height);
                for (let r = 1; r < maxRadius && !foundSeed; r++) {
                    for (let i = -r; i <= r && !foundSeed; i++) {
                        // Righe superiore e inferiore
                        if (isSubjectCandidate(centerX + i, centerY - r)) {
                            startX = centerX + i;
                            startY = centerY - r;
                            foundSeed = true;
                        } else if (isSubjectCandidate(centerX + i, centerY + r)) {
                            startX = centerX + i;
                            startY = centerY + r;
                            foundSeed = true;
                        }
                        // Colonne sinistra e destra
                        else if (isSubjectCandidate(centerX - r, centerY + i)) {
                            startX = centerX - r;
                            startY = centerY + i;
                            foundSeed = true;
                        } else if (isSubjectCandidate(centerX + r, centerY + i)) {
                            startX = centerX + r;
                            startY = centerY + i;
                            foundSeed = true;
                        }
                    }
                }
            }
            
            // Se abbiamo trovato il seme del soggetto principale, eseguiamo il tracciamento
            if (foundSeed) {
                const startPos = startY * width + startX;
                visitedSubject[startPos] = 1;
                subjectQueue.push(startPos);
                
                let subjectHead = 0;
                while (subjectHead < subjectQueue.length) {
                    const pos = subjectQueue[subjectHead++];
                    const currX = pos % width;
                    const currY = Math.floor(pos / width);
                    
                    for (let d = 0; d < 4; d++) {
                        const nx = currX + dx[d];
                        const ny = currY + dy[d];
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nPos = ny * width + nx;
                            if (!visitedSubject[nPos]) {
                                if (isSubjectCandidate(nx, ny)) {
                                    visitedSubject[nPos] = 1;
                                    subjectQueue.push(nPos);
                                }
                            }
                        }
                    }
                }
            }
            
            // C. Rendi trasparente tutto ciò che NON è stato visitato come Soggetto Principale
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const pos = y * width + x;
                    if (visitedSubject[pos] === 0) {
                        const idx = pos * 4;
                        data[idx + 3] = 0; // Trasparente
                    }
                }
            }
        }

        const replacements = state.colorReplacements.map(rep => {
            return {
                fromRgb: hexToRgb(rep.from),
                toRgb: hexToRgb(rep.to),
                tolerance: rep.tolerance !== undefined ? rep.tolerance : 20,
                makeTransparent: !!rep.transparent,
                seedX: rep.seedX,
                seedY: rep.seedY
            };
        });



        // 2. SOSTITUZIONE COLORE E BOMBA ISOLA (ELIMINA A CATENA)
        if (hasReplacements) {
            const width = Math.round(layer.w);
            const height = Math.round(layer.h);
            
            replacements.forEach(rep => {
                if (rep.type === "chain-erase") {
                    // Flood fill distruttivo (cieco ai colori)
                    if (rep.seedX === null || rep.seedY === null || rep.seedX === undefined) return;
                    const visited = new Uint8Array(width * height);
                    const queue = [];
                    const startX = Math.round(rep.seedX);
                    const startY = Math.round(rep.seedY);
                    
                    if (startX >= 0 && startX < width && startY >= 0 && startY < height) {
                        const startPos = startY * width + startX;
                        // Verifica che il seme colpisca un pixel opaco
                        if (data[startPos * 4 + 3] > 0) {
                            visited[startPos] = 1;
                            queue.push(startPos);
                            data[startPos * 4 + 3] = 0; // Cancella
                        }
                    }
                    
                    let head = 0;
                    const dx = [-1, 1, 0, 0];
                    const dy = [0, 0, -1, 1];
                    
                    while (head < queue.length) {
                        const pos = queue[head++];
                        const currX = pos % width;
                        const currY = Math.floor(pos / width);
                        
                        for (let d = 0; d < 4; d++) {
                            const nx = currX + dx[d];
                            const ny = currY + dy[d];
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const nPos = ny * width + nx;
                                if (!visited[nPos]) {
                                    visited[nPos] = 1;
                                    // Se il pixel è opaco, lo distrugge e propaga
                                    if (data[nPos * 4 + 3] > 0) {
                                        data[nPos * 4 + 3] = 0;
                                        queue.push(nPos);
                                    }
                                }
                            }
                        }
                    }
                } else if (rep.seedX !== null && rep.seedY !== null && rep.seedX !== undefined) {
                    // Flood fill dallo spazio confinante (seed)
                    const visited = new Uint8Array(width * height);
                    const queue = [];
                    const startX = Math.round(rep.seedX);
                    const startY = Math.round(rep.seedY);
                    
                    if (startX >= 0 && startX < width && startY >= 0 && startY < height) {
                        const startPos = startY * width + startX;
                        visited[startPos] = 1;
                        queue.push(startPos);
                    }
                    
                    let head = 0;
                    const dx = [-1, 1, 0, 0];
                    const dy = [0, 0, -1, 1];
                    
                    while (head < queue.length) {
                        const pos = queue[head++];
                        const currX = pos % width;
                        const currY = Math.floor(pos / width);
                        const idx = pos * 4;
                        
                        if (data[idx + 3] > 0) {
                            const diffR = data[idx] - rep.fromRgb.r;
                            const diffG = data[idx + 1] - rep.fromRgb.g;
                            const diffB = data[idx + 2] - rep.fromRgb.b;
                            if (Math.sqrt(diffR * diffR + diffG * diffG + diffB * diffB) <= (rep.tolerance * 1.73205)) {
                                // Match! Sostituisci
                                if (rep.makeTransparent) {
                                    data[idx + 3] = 0;
                                } else {
                                    data[idx] = rep.toRgb.r;
                                    data[idx + 1] = rep.toRgb.g;
                                    data[idx + 2] = rep.toRgb.b;
                                    data[idx + 3] = 255;
                                }
                                
                                // Espandi ai vicini
                                for (let d = 0; d < 4; d++) {
                                    const nx = currX + dx[d];
                                    const ny = currY + dy[d];
                                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                        const nPos = ny * width + nx;
                                        if (!visited[nPos]) {
                                            visited[nPos] = 1;
                                            queue.push(nPos);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // Sostituzione globale (fallback se non c'è click pipetta)
                    for (let i = 0; i < data.length; i += 4) {
                        if (data[i + 3] === 0) continue;
                        const diffR = data[i] - rep.fromRgb.r;
                        const diffG = data[i + 1] - rep.fromRgb.g;
                        const diffB = data[i + 2] - rep.fromRgb.b;
                        if (Math.sqrt(diffR * diffR + diffG * diffG + diffB * diffB) <= (rep.tolerance * 1.73205)) {
                            if (rep.makeTransparent) {
                                data[i + 3] = 0;
                            } else {
                                data[i] = rep.toRgb.r;
                                data[i + 1] = rep.toRgb.g;
                                data[i + 2] = rep.toRgb.b;
                                data[i + 3] = 255;
                            }
                        }
                    }
                }
            });
        }

        tempCtx.putImageData(imgData, 0, 0);
        filterCache.set(cacheKey, tempCanvas);
        return tempCanvas;
    }

    // ======================================================================
    // 10. RENDERING LOOP & GRAFICA DEL CANVAS
    // ======================================================================
    let renderRequested = false;

    function requestRender() {
        if (!renderRequested) {
            renderRequested = true;
            requestAnimationFrame(renderCanvas);
        }
    }

    function renderCanvas() {
        renderRequested = false;
        
        ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
        
        const frame = getActiveFrame();
        if (!frame) return;

        frame.layers.forEach(layer => {
            if (!layer.visible) return;

            // Inibizione temporale per le scritte o per i livelli di riferimento (Da Frame / A Frame)
            if (layer.type === "text" || layer.isReference === true) {
                const currentFrameNum = state.activeFrameIndex + 1;
                const startF = layer.startFrame !== undefined ? layer.startFrame : 1;
                const endF = layer.endFrame !== undefined ? layer.endFrame : state.frames.length;
                if (currentFrameNum < startF || currentFrameNum > endF) {
                    return;
                }
            }

            ctx.save();
            ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;
            ctx.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
            ctx.rotate((layer.r * Math.PI) / 180);
            
            if (layer.type === "image" && (layer.isAnimatedGif && layer.gifFrames && layer.gifFrames.length > 0)) {
                const refFrameIdx = state.activeFrameIndex % layer.gifFrames.length;
                const activeFrameCanvas = layer.gifFrames[refFrameIdx];
                let renderSource = applyGlobalFilters(layer, activeFrameCanvas);

                if (layer.borderRadius > 0) {
                    ctx.save();
                    ctx.beginPath();
                    const radius = Math.min(layer.borderRadius, layer.w / 2, layer.h / 2);
                    ctx.roundRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h, radius);
                    ctx.clip();
                    ctx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                    ctx.restore();
                } else {
                    ctx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                }
            }
            else if (layer.type === "image" && (layer.canvasImage || layer.img)) {
                let renderSource = applyGlobalFilters(layer, layer.canvasImage || layer.img);

                if (layer.borderRadius > 0) {
                    ctx.save();
                    ctx.beginPath();
                    const radius = Math.min(layer.borderRadius, layer.w / 2, layer.h / 2);
                    ctx.roundRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h, radius);
                    ctx.clip();
                    ctx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                    ctx.restore();
                } else {
                    ctx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                }
            } 
            else if (layer.type === "text") {
                ctx.font = `${layer.fontSize}px ${layer.fontFamily}`;
                ctx.fillStyle = layer.fontColor;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                
                if (layer.borderRadius > 0) {
                    ctx.save();
                    ctx.fillStyle = "rgba(0,0,0,0.15)";
                    ctx.beginPath();
                    ctx.roundRect(-layer.w/2, -layer.h/2, layer.w, layer.h, layer.borderRadius);
                    ctx.fill();
                    ctx.restore();
                }
                
                ctx.fillText(layer.text, 0, 0);
            }

            // Disegna disegni manuali su questo layer
            if (layer.drawingCanvas) {
                ctx.drawImage(layer.drawingCanvas, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
            }

            // Disegna rettangolo di selezione in modalità select
            if (layer.id === state.activeLayerId && state.activeTool === "select") {
                ctx.strokeStyle = varColorToHex("--accent-color", "#00ffcc");
                ctx.lineWidth = 1.8 / state.zoom;
                ctx.strokeRect(-layer.w / 2 - 2, -layer.h / 2 - 2, layer.w + 4, layer.h + 4);
                
                ctx.fillStyle = "#ffffff";
                const handleSz = 6 / state.zoom;
                ctx.fillRect(-layer.w / 2 - handleSz/2, -layer.h / 2 - handleSz/2, handleSz, handleSz);
                ctx.fillRect(layer.w / 2 - handleSz/2, -layer.h / 2 - handleSz/2, handleSz, handleSz);
                ctx.fillRect(-layer.w / 2 - handleSz/2, layer.h / 2 - handleSz/2, handleSz, handleSz);
                ctx.fillRect(layer.w / 2 - handleSz/2, layer.h / 2 - handleSz/2, handleSz, handleSz);
            }
            
            ctx.restore();
        });

        if (state.gridActive) {
            drawGridLines();
        }
    }

    function drawGridLines() {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
        ctx.lineWidth = 0.8 / state.zoom;
        
        const minDim = Math.min(state.canvasWidth, state.canvasHeight);
        let gridSize = 40;
        if (minDim <= 32) gridSize = 1;
        else if (minDim <= 64) gridSize = 2;
        else if (minDim <= 128) gridSize = 4;
        else if (minDim <= 256) gridSize = 8;
        else if (minDim <= 512) gridSize = 16;
        else if (minDim <= 1024) gridSize = 32;
        else if (minDim <= 2048) gridSize = 64;
        else gridSize = 128;
        
        for (let x = 0; x < state.canvasWidth; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, state.canvasHeight);
            ctx.stroke();
        }
        for (let y = 0; y < state.canvasHeight; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(state.canvasWidth, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    function varColorToHex(varName, fallback) {
        const style = getComputedStyle(document.documentElement);
        const val = style.getPropertyValue(varName).trim();
        return val || fallback;
    }

    // ======================================================================
    // 11. STRUMENTI DI DISEGNO pixel-by-pixel (Pennello/Gomma)
    // ======================================================================
    function initDrawingTools() {
        const tools = [
            { btn: dom.drawSelect, name: "select" },
            { btn: dom.drawBrush, name: "brush" },
            { btn: dom.drawEraser, name: "eraser" },
            { btn: dom.drawPicker, name: "picker" }
        ];

        tools.forEach(t => {
            t.btn.addEventListener("click", () => {
                tools.forEach(o => o.btn.classList.remove("active"));
                t.btn.classList.add("active");
                state.activeTool = t.name;
                
                if (t.name === "brush" || t.name === "eraser") {
                    dom.brushSettings.style.display = "block";
                } else {
                    dom.brushSettings.style.display = "none";
                }

                if (t.name === "eraser") {
                    dom.eraserModeGroup.style.display = "block";
                } else {
                    dom.eraserModeGroup.style.display = "none";
                }
                requestRender();
            });
        });

        dom.eraserModeBrush.addEventListener("click", () => {
            dom.eraserModeBrush.classList.add("active");
            dom.eraserModeGif.classList.remove("active");
            state.eraserMode = "brush";
        });
        dom.eraserModeGif.addEventListener("click", () => {
            dom.eraserModeGif.classList.add("active");
            dom.eraserModeBrush.classList.remove("active");
            state.eraserMode = "gif";
        });

        dom.brushSize.addEventListener("input", (e) => {
            state.brush.size = parseInt(e.target.value);
        });
        dom.brushColor.addEventListener("input", (e) => {
            state.brush.color = e.target.value;
        });
        dom.brushHardness.addEventListener("input", (e) => {
            state.brush.hardness = parseInt(e.target.value);
            dom.brushHardnessText.innerText = `${state.brush.hardness}%`;
        });

        function activatePipette(target, btnElement) {
            if (state.activeTool !== "picker") {
                state.lastActiveToolBeforePicker = state.activeTool;
            }
            state.colorPickerTarget = target;
            
            document.querySelectorAll(".pipette-btn").forEach(btn => btn.classList.remove("pulse-pipette"));
            if (btnElement) {
                btnElement.classList.add("pulse-pipette");
            }
            
            dom.drawPicker.click();
        }

        if (dom.btnPickChroma) {
            dom.btnPickChroma.addEventListener("click", () => activatePipette("chroma", dom.btnPickChroma));
        }
        if (dom.btnPickReplaceFrom) {
            dom.btnPickReplaceFrom.addEventListener("click", () => activatePipette("replace-from", dom.btnPickReplaceFrom));
        }
        if (dom.btnPickReplaceTo) {
            dom.btnPickReplaceTo.addEventListener("click", () => activatePipette("replace-to", dom.btnPickReplaceTo));
        }
        if (dom.btnPickBgColor) {
            dom.btnPickBgColor.addEventListener("click", () => activatePipette("bg-remove", dom.btnPickBgColor));
        }

        dom.mainCanvas.addEventListener("mousedown", startDrawing);
        document.addEventListener("mousemove", drawMove);
        document.addEventListener("mouseup", stopDrawing);
    }

    function getCoordsOnCanvas(e) {
        const rect = dom.mainCanvas.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left) / state.zoom;
        const canvasY = (e.clientY - rect.top) / state.zoom;
        return { x: canvasX, y: canvasY };
    }

    function startDrawing(e) {
        if (state.activeTool === "select") {
            handleCanvasSelect(e);
            return;
        }

        const layer = getActiveLayer();
        if (!layer) return;

        const coords = getCoordsOnCanvas(e);

        // LOGICA STRUMENTO PIPETTA E SMISTAMENTO COLORE
        if (state.activeTool === "picker") {
            const pixel = ctx.getImageData(coords.x, coords.y, 1, 1).data;
            const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
            
            if (state.colorPickerTarget === "brush") {
                state.brush.color = hex;
                if (dom.brushColor) dom.brushColor.value = hex;
            } else if (state.colorPickerTarget === "chroma") {
                if (dom.chromaColor) dom.chromaColor.value = hex;
                if (layer) {
                    saveState();
                    layer.chromaColor = hex;
                    filterCache.delete(layer.id);
                }
            } else if (state.colorPickerTarget === "replace-from") {
                if (dom.replaceColorFrom) dom.replaceColorFrom.value = hex;
                const localCoords = mapGlobalToLayerCoords(coords.x, coords.y, layer);
                state.lastPickedReplaceCoords = { x: localCoords.x, y: localCoords.y };
            } else if (state.colorPickerTarget === "replace-to") {
                if (dom.replaceColorTo) dom.replaceColorTo.value = hex;
            } else if (state.colorPickerTarget === "bg-remove") {
                if (dom.bgRemoveColor) dom.bgRemoveColor.value = hex;
                if (layer) {
                    const localCoords = mapGlobalToLayerCoords(coords.x, coords.y, layer);
                    layer.bgRemoveSeedX = localCoords.x;
                    layer.bgRemoveSeedY = localCoords.y;
                    layer.bgRemoveColor = hex;
                    layer.bgRemoveActive = true;
                    if (dom.bgRemoveActive) dom.bgRemoveActive.checked = true;
                    
                    // Propaga le modifiche se l'ambito è globale
                    propagateLayerChanges(layer, {
                        bgRemoveSeedX: layer.bgRemoveSeedX,
                        bgRemoveSeedY: layer.bgRemoveSeedY,
                        bgRemoveColor: layer.bgRemoveColor,
                        bgRemoveActive: layer.bgRemoveActive
                    });
                    
                    filterCache.delete(layer.id);
                }
            } else if (state.colorPickerTarget === "chain-erase") {
                const localCoords = mapGlobalToLayerCoords(coords.x, coords.y, layer);
                state.colorReplacements.push({
                    type: "chain-erase",
                    seedX: localCoords.x,
                    seedY: localCoords.y
                });
                if (typeof updateReplacementsUI === "function") updateReplacementsUI();
                filterCache.clear();
            }
            
            // Disattiva la pulsazione delle pipette
            document.querySelectorAll(".pipette-btn").forEach(btn => btn.classList.remove("pulse-pipette"));
            
            // Ripristina lo strumento attivo precedente (select o brush)
            let prevToolBtn = dom.drawSelect;
            let prevToolName = "select";
            if (state.lastActiveToolBeforePicker && state.lastActiveToolBeforePicker !== "picker") {
                prevToolName = state.lastActiveToolBeforePicker;
                if (prevToolName === "brush") prevToolBtn = dom.drawBrush;
                else if (prevToolName === "eraser") prevToolBtn = dom.drawEraser;
            }
            
            if (prevToolBtn) {
                prevToolBtn.click();
            } else {
                dom.drawSelect.click();
            }
            
            requestRender();
            return;
        }

        // INIBIZIONE PENNELLO E GOMMA SU LIVELLI BLOCCATI
        if (layer.locked) {
            return;
        }

        if (!layer.drawingCanvas) {
            layer.drawingCanvas = createDrawingCanvasForLayer(layer.w, layer.h);
        }

        // Salva lo stato prima di disegnare per permettere l'Undo
        saveState();

        state.brush.isDrawing = true;
        
        const localCoords = mapGlobalToLayerCoords(coords.x, coords.y, layer);
        state.brush.lastX = localCoords.x;
        state.brush.lastY = localCoords.y;

        drawPoint(localCoords.x, localCoords.y, layer);
    }

    function drawMove(e) {
        if (!state.brush.isDrawing) return;
        const layer = getActiveLayer();
        if (!layer || layer.locked || !layer.drawingCanvas) return;

        const coords = getCoordsOnCanvas(e);
        const localCoords = mapGlobalToLayerCoords(coords.x, coords.y, layer);

        drawSegment(state.brush.lastX, state.brush.lastY, localCoords.x, localCoords.y, layer);

        state.brush.lastX = localCoords.x;
        state.brush.lastY = localCoords.y;
    }

    function stopDrawing() {
        state.brush.isDrawing = false;
    }

    function mapGlobalToLayerCoords(gx, gy, layer) {
        let cx = gx - (layer.x + layer.w / 2);
        let cy = gy - (layer.y + layer.h / 2);

        const angleRad = -(layer.r * Math.PI) / 180;
        const rx = cx * Math.cos(angleRad) - cy * Math.sin(angleRad);
        const ry = cx * Math.sin(angleRad) + cy * Math.cos(angleRad);

        const lx = rx + layer.w / 2;
        const ly = ry + layer.h / 2;

        return { x: lx, y: ly };
    }

    function drawPoint(x, y, layer, isPropagation = false) {
        if (state.activeTool === "eraser" && state.eraserMode === "gif" && layer.type === "image") {
            if (!layer.canvasImage && layer.img) {
                layer.canvasImage = document.createElement("canvas");
                layer.canvasImage.width = layer.img.naturalWidth || layer.w;
                layer.canvasImage.height = layer.img.naturalHeight || layer.h;
                const imgCtx = layer.canvasImage.getContext("2d");
                imgCtx.drawImage(layer.img, 0, 0, layer.canvasImage.width, layer.canvasImage.height);
            }
            if (layer.canvasImage) {
                const scaleX = layer.canvasImage.width / layer.w;
                const scaleY = layer.canvasImage.height / layer.h;
                const canvasX = x * scaleX;
                const canvasY = y * scaleY;
                const brushSize = state.brush.size * scaleX;

                const imgCtx = layer.canvasImage.getContext("2d");
                imgCtx.save();
                imgCtx.globalCompositeOperation = "destination-out";
                imgCtx.beginPath();
                imgCtx.arc(canvasX, canvasY, brushSize / 2, 0, Math.PI * 2);
                imgCtx.fill();
                imgCtx.restore();

                filterCache.clear();
                requestRender();
            }
        } else {
            const dCtx = layer.drawingCanvas.getContext("2d");
            
            dCtx.save();
            if (state.activeTool === "eraser") {
                dCtx.globalCompositeOperation = "destination-out";
            } else {
                dCtx.globalCompositeOperation = "source-over";
                dCtx.fillStyle = state.brush.color;
            }

            dCtx.beginPath();
            dCtx.arc(x, y, state.brush.size / 2, 0, Math.PI * 2);
            dCtx.fill();
            dCtx.restore();
            requestRender();
        }

        // Propagazione disegno "Tutta la GIF"
        if (state.editScope === "global" && !isPropagation) {
            state.frames.forEach(frame => {
                let targetLayer = frame.layers.find(l => l.id === layer.id);
                if (!targetLayer) {
                    const activeFrame = getActiveFrame();
                    if (activeFrame) {
                        const activeLayerIndex = activeFrame.layers.findIndex(l => l.id === layer.id);
                        if (activeLayerIndex !== -1 && activeLayerIndex < frame.layers.length) {
                            targetLayer = frame.layers[activeLayerIndex];
                        }
                    }
                }
                if (targetLayer && targetLayer !== layer) {
                    if (state.activeTool === "eraser" && state.eraserMode === "gif" && targetLayer.type === "image") {
                        if (!targetLayer.canvasImage && targetLayer.img) {
                            targetLayer.canvasImage = document.createElement("canvas");
                            targetLayer.canvasImage.width = targetLayer.img.naturalWidth || targetLayer.w;
                            targetLayer.canvasImage.height = targetLayer.img.naturalHeight || targetLayer.h;
                            const imgCtx = targetLayer.canvasImage.getContext("2d");
                            imgCtx.drawImage(targetLayer.img, 0, 0, targetLayer.canvasImage.width, targetLayer.canvasImage.height);
                        }
                    } else {
                        if (!targetLayer.drawingCanvas) {
                            targetLayer.drawingCanvas = createDrawingCanvasForLayer(targetLayer.w, targetLayer.h);
                        }
                    }
                    drawPoint(x, y, targetLayer, true);
                }
            });
        }
    }

    function drawSegment(x1, y1, x2, y2, layer, isPropagation = false) {
        if (state.activeTool === "eraser" && state.eraserMode === "gif" && layer.type === "image") {
            if (!layer.canvasImage && layer.img) {
                layer.canvasImage = document.createElement("canvas");
                layer.canvasImage.width = layer.img.naturalWidth || layer.w;
                layer.canvasImage.height = layer.img.naturalHeight || layer.h;
                const imgCtx = layer.canvasImage.getContext("2d");
                imgCtx.drawImage(layer.img, 0, 0, layer.canvasImage.width, layer.canvasImage.height);
            }
            if (layer.canvasImage) {
                const scaleX = layer.canvasImage.width / layer.w;
                const scaleY = layer.canvasImage.height / layer.h;
                const canvasX1 = x1 * scaleX;
                const canvasY1 = y1 * scaleY;
                const canvasX2 = x2 * scaleX;
                const canvasY2 = y2 * scaleY;
                const brushSize = state.brush.size * scaleX;

                const imgCtx = layer.canvasImage.getContext("2d");
                imgCtx.save();
                imgCtx.globalCompositeOperation = "destination-out";
                imgCtx.lineWidth = brushSize;
                imgCtx.lineCap = "round";
                imgCtx.lineJoin = "round";
                imgCtx.strokeStyle = "rgba(0,0,0,1)";
                imgCtx.beginPath();
                imgCtx.moveTo(canvasX1, canvasY1);
                imgCtx.lineTo(canvasX2, canvasY2);
                imgCtx.stroke();
                imgCtx.restore();

                filterCache.clear();
                requestRender();
            }
        } else {
            const dCtx = layer.drawingCanvas.getContext("2d");
            
            dCtx.save();
            dCtx.lineWidth = state.brush.size;
            dCtx.lineCap = "round";
            dCtx.lineJoin = "round";

            if (state.activeTool === "eraser") {
                dCtx.globalCompositeOperation = "destination-out";
                dCtx.strokeStyle = "rgba(0,0,0,1)";
            } else {
                dCtx.globalCompositeOperation = "source-over";
                dCtx.strokeStyle = state.brush.color;
            }

            dCtx.beginPath();
            dCtx.moveTo(x1, y1);
            dCtx.lineTo(x2, y2);
            dCtx.stroke();
            dCtx.restore();
            requestRender();
        }

        // Propagazione disegno "Tutta la GIF"
        if (state.editScope === "global" && !isPropagation) {
            state.frames.forEach(frame => {
                let targetLayer = frame.layers.find(l => l.id === layer.id);
                if (!targetLayer) {
                    const activeFrame = getActiveFrame();
                    if (activeFrame) {
                        const activeLayerIndex = activeFrame.layers.findIndex(l => l.id === layer.id);
                        if (activeLayerIndex !== -1 && activeLayerIndex < frame.layers.length) {
                            targetLayer = frame.layers[activeLayerIndex];
                        }
                    }
                }
                if (targetLayer && targetLayer !== layer) {
                    if (state.activeTool === "eraser" && state.eraserMode === "gif" && targetLayer.type === "image") {
                        if (!targetLayer.canvasImage && targetLayer.img) {
                            targetLayer.canvasImage = document.createElement("canvas");
                            targetLayer.canvasImage.width = targetLayer.img.naturalWidth || targetLayer.w;
                            targetLayer.canvasImage.height = targetLayer.img.naturalHeight || targetLayer.h;
                            const imgCtx = targetLayer.canvasImage.getContext("2d");
                            imgCtx.drawImage(targetLayer.img, 0, 0, targetLayer.canvasImage.width, targetLayer.canvasImage.height);
                        }
                    } else {
                        if (!targetLayer.drawingCanvas) {
                            targetLayer.drawingCanvas = createDrawingCanvasForLayer(targetLayer.w, targetLayer.h);
                        }
                    }
                    drawSegment(x1, y1, x2, y2, targetLayer, true);
                }
            });
        }
    }

    function handleCanvasSelect(e) {
        const coords = getCoordsOnCanvas(e);
        const frame = getActiveFrame();
        if (!frame) return;

        for (let i = frame.layers.length - 1; i >= 0; i--) {
            const l = frame.layers[i];
            if (!l.visible) continue;

            const local = mapGlobalToLayerCoords(coords.x, coords.y, l);
            if (local.x >= 0 && local.x <= l.w && local.y >= 0 && local.y <= l.h) {
                state.activeLayerId = l.id;
                updateLayersListUI();
                updateXYZControlsUI();
                startLayerDrag(e, l);
                return;
            }
        }
    }

    function startLayerDrag(mouseDownEvent, layer) {
        saveState(); // Salva lo stato prima di iniziare il trascinamento del livello
        let startCoords = getCoordsOnCanvas(mouseDownEvent);
        let startX = layer.x;
        let startY = layer.y;

        function onMouseMove(moveEvent) {
            let currentCoords = getCoordsOnCanvas(moveEvent);
            let dx = currentCoords.x - startCoords.x;
            let dy = currentCoords.y - startCoords.y;

            layer.x = Math.round(startX + dx);
            layer.y = Math.round(startY + dy);

            dom.xyzX.value = layer.x;
            dom.xyzY.value = layer.y;

            // Propaga le nuove coordinate in tempo reale a tutti i frame (se l'ambito è globale)
            propagateLayerChanges(layer, { x: layer.x, y: layer.y });

            requestRender();
        }

        function onMouseUp() {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        }

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }

    // ======================================================================
    // 12. APERTURA E SALVATAGGIO DEI FILE
    // ======================================================================
    function initFileHandlers() {
        dom.fileDropzone.addEventListener("click", () => dom.fileInput.click());
        dom.fileDropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dom.fileDropzone.classList.add("dragover");
        });
        dom.fileDropzone.addEventListener("dragleave", () => {
            dom.fileDropzone.classList.remove("dragover");
        });
        dom.fileDropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            dom.fileDropzone.classList.remove("dragover");
            const file = e.dataTransfer.files[0];
            if (file) handleUploadedFile(file);
        });

        dom.fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) handleUploadedFile(file);
        });

        // Riferimento Bloccato
        if (dom.btnImportReference && dom.fileInputReference) {
            dom.btnImportReference.addEventListener("click", () => {
                dom.fileInputReference.click();
            });
            dom.fileInputReference.addEventListener("change", (e) => {
                const file = e.target.files[0];
                if (file) {
                    handleUploadedReferenceFile(file);
                }
            });
        }

        dom.applyCanvasSize.addEventListener("click", () => {
            const w = Math.max(50, parseInt(dom.ioWidth.value) || 800);
            const h = Math.max(50, parseInt(dom.ioHeight.value) || 600);
            saveState(); // Salva lo stato prima di cambiare dimensione
            applyWorkspaceDimensions(w, h);
            saveLayoutToLocalStorage();
            setTimeout(centerCanvas, 10);
        });

        dom.exportFile.addEventListener("click", exportCanvasResult);


    }

    function handleUploadedFile(file) {
        const reader = new FileReader();

        if (file.type === "image/gif") {
            reader.onload = function(e) {
                decodeUploadedGif(e.target.result);
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    let isFirstImport = false;
                    if (state.frames.length === 0) {
                        isFirstImport = true;
                        state.frames = [{
                            id: generateId(),
                            delay: 100,
                            layers: []
                        }];
                        state.activeFrameIndex = 0;
                    } else if (state.frames.length === 1 && state.frames[0]) {
                        const layers = state.frames[0].layers;
                        if (layers.length === 0 || (layers.length === 1 && layers[0].name === "Testo Benvenuto")) {
                            isFirstImport = true;
                            state.frames[0].layers = []; // Rimuovi il testo di benvenuto
                        }
                    }

                    if (isFirstImport) {
                        applyWorkspaceDimensions(img.width, img.height);
                    }

                    const newLayer = {
                        id: generateId(),
                        name: file.name.substring(0, 15),
                        type: "image",
                        x: isFirstImport ? 0 : Math.round((state.canvasWidth - img.width) / 2),
                        y: isFirstImport ? 0 : Math.round((state.canvasHeight - img.height) / 2),
                        w: img.width,
                        h: img.height,
                        visible: true,
                        opacity: 1.0,
                        r: 0,
                        keepRatio: true,
                        aspectRatio: img.width / img.height,
                        img: img,
                        borderRadius: 0,
                        chromaActive: false,
                        chromaColor: "#ffffff",
                        chromaTolerance: 20
                    };
                    addLayer(newLayer);
                    // Ricalcola auto-zoom
                    autoZoomToFit(state.canvasWidth, state.canvasHeight);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    function handleUploadedReferenceFile(file) {
        const reader = new FileReader();

        if (file.type === "image/gif") {
            reader.onload = function(e) {
                saveState();
                
                const sharedId = generateId();
                const newLayer = {
                    id: sharedId,
                    name: "Rif: " + file.name.substring(0, 12),
                    type: "image",
                    x: 0,
                    y: 0,
                    w: state.canvasWidth,
                    h: state.canvasHeight,
                    visible: true,
                    opacity: 0.7,
                    r: 0,
                    keepRatio: true,
                    aspectRatio: 1,
                    img: null,
                    borderRadius: 0,
                    locked: true,
                    isReference: true,
                    chromaActive: false,
                    chromaColor: "#ffffff",
                    chromaTolerance: 20,
                    startFrame: 1,
                    endFrame: state.frames.length
                };
                
                // Aggiungiamo il livello di riferimento a tutti i fotogrammi del progetto
                state.frames.forEach((frame) => {
                    const frameLayer = { ...newLayer };
                    const maxZ = frame.layers.reduce((max, l) => Math.max(max, isNaN(l.z) ? 0 : (l.z || 0)), 0);
                    frameLayer.z = maxZ + 1;
                    frame.layers.push(frameLayer);
                });
                state.activeLayerId = sharedId;

                const activeLayer = getActiveFrame().layers.find(l => l.id === sharedId);
                decodeUploadedReferenceGif(e.target.result, activeLayer);
                
                if (state.activeTool !== "select") {
                    dom.drawSelect.click();
                }
                autoZoomToFit(state.canvasWidth, state.canvasHeight);
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    saveState(); // Salva lo stato prima di aggiungere il riferimento
                    const sharedId = generateId();
                    const newLayer = {
                        id: sharedId,
                        name: "Rif: " + file.name.substring(0, 12),
                        type: "image",
                        x: Math.round((state.canvasWidth - img.width) / 2),
                        y: Math.round((state.canvasHeight - img.height) / 2),
                        w: img.width,
                        h: img.height,
                        visible: true,
                        opacity: 0.7, // Opacità 70% di default per ricalco
                        r: 0,
                        keepRatio: true,
                        aspectRatio: img.width / img.height,
                        img: img,
                        borderRadius: 0,
                        locked: true,        // Livello bloccato
                        isReference: true,   // Contrassegno riferimento
                        chromaActive: false,
                        chromaColor: "#ffffff",
                        chromaTolerance: 20,
                        startFrame: 1,
                        endFrame: state.frames.length
                    };
                    
                    // Aggiungiamo il livello di riferimento a tutti i fotogrammi del progetto
                    state.frames.forEach((frame) => {
                        const frameLayer = { ...newLayer };
                        const maxZ = frame.layers.reduce((max, l) => Math.max(max, isNaN(l.z) ? 0 : (l.z || 0)), 0);
                        frameLayer.z = maxZ + 1;
                        frame.layers.push(frameLayer);
                    });
                    state.activeLayerId = sharedId;
                    
                    // Seleziona automaticamente lo strumento di selezione
                    if (state.activeTool !== "select") {
                        dom.drawSelect.click();
                    }
                    // Ricalcola auto-zoom
                    autoZoomToFit(state.canvasWidth, state.canvasHeight);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    // ======================================================================
    // 13. DECODIFICA GIF ROBUSTA MULTI-NAMESPACE (RISOLTO ERRORE SCREEN)
    // ======================================================================
    function decodeUploadedGif(arrayBuffer) {
        try {
            let rawFrames = [];
            let gifWidth = 0;
            let gifHeight = 0;

            const TargetGIFClass = window.GifReader || window.GIF;

            // 1. Verifica se window.GifReader o window.GIF è un costruttore (API a oggetti di gifuct-js UMD locale)
            if (typeof TargetGIFClass === "function" && !TargetGIFClass.parseGIF) {
                const gifInstance = new TargetGIFClass(arrayBuffer);
                rawFrames = gifInstance.decompressFrames(true);
                if (gifInstance.raw && gifInstance.raw.lsd) {
                    gifWidth = gifInstance.raw.lsd.width;
                    gifHeight = gifInstance.raw.lsd.height;
                } else {
                    throw new Error("Dati LSD del file GIF non trovati.");
                }
            } 
            // 2. Altrimenti verifica le funzioni globali o namespace (API legacy/CDN)
            else {
                let parseGIF_fn = window.parseGIF || (TargetGIFClass && TargetGIFClass.parseGIF) || (window.gifuctJS && window.gifuctJS.parseGIF);
                let decompressFrames_fn = window.decompressFrames || (TargetGIFClass && TargetGIFClass.decompressFrames) || (window.gifuctJS && window.gifuctJS.decompressFrames);
                
                if (!parseGIF_fn || !decompressFrames_fn) {
                    throw new Error("Libreria di lettura GIF non caricata o non compatibile.");
                }
                
                const gifData = parseGIF_fn(arrayBuffer);
                rawFrames = decompressFrames_fn(gifData, true);
                if (gifData && gifData.lsd) {
                    gifWidth = gifData.lsd.width;
                    gifHeight = gifData.lsd.height;
                }
            }
            
            if (!rawFrames || rawFrames.length === 0) {
                alert("Questa GIF non contiene fotogrammi validi o supportati.");
                return;
            }

            const parsedFrames = [];
            
            const tempCanvas = document.createElement("canvas");
            const tempCtx = tempCanvas.getContext("2d");
            tempCanvas.width = gifWidth;
            tempCanvas.height = gifHeight;

            applyWorkspaceDimensions(gifWidth, gifHeight);

            rawFrames.forEach((rawFrame, idx) => {
                const disposal = rawFrame.disposalType;
                if (idx === 0 || disposal === 2 || disposal === 3) {
                    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                }

                const frameCanvas = document.createElement("canvas");
                frameCanvas.width = rawFrame.dims.width;
                frameCanvas.height = rawFrame.dims.height;
                const frameCtx = frameCanvas.getContext("2d");
                
                const imageData = frameCtx.createImageData(rawFrame.dims.width, rawFrame.dims.height);
                imageData.data.set(rawFrame.patch);
                frameCtx.putImageData(imageData, 0, 0);

                tempCtx.drawImage(frameCanvas, rawFrame.dims.left, rawFrame.dims.top);

                const frameImg = new Image();
                frameImg.onload = () => {
                    requestRender();
                    buildTimelineUI();
                };
                frameImg.src = tempCanvas.toDataURL("image/png");

                parsedFrames.push({
                    id: generateId(),
                    delay: rawFrame.delay || 100, 
                    layers: [
                        {
                            id: generateId(),
                            name: `Fotogramma ${idx + 1}`,
                            type: "image",
                            x: 0,
                            y: 0,
                            w: tempCanvas.width,
                            h: tempCanvas.height,
                            visible: true,
                            opacity: 1.0,
                            r: 0,
                            keepRatio: true,
                            aspectRatio: tempCanvas.width / tempCanvas.height,
                            img: frameImg,
                            borderRadius: 0,
                            chromaActive: false,
                            chromaColor: "#ffffff",
                            chromaTolerance: 20
                        }
                    ]
                });
            });

            state.frames = parsedFrames;
            state.activeFrameIndex = 0;
            state.activeLayerId = state.frames[0].layers[0].id;

            buildTimelineUI();
            updateLayersListUI();
            updateXYZControlsUI();
            requestRender();
            
            dom.statusFramesCount.innerText = `1/${state.frames.length}`;
            
            // Auto zoom del canvas all'importazione
            autoZoomToFit(gifWidth, gifHeight);

        } catch (err) {
            console.error("Errore durante il caricamento della GIF animata:", err);
            alert("Impossibile caricare la GIF. Prova con una GIF diversa o ricarica la pagina.");
        }
    }

    // ======================================================================
    // 14. COMPILATORE ED ESPORTATORE GIF
    // ======================================================================
    function getCanvasBoundingBox(canvas) {
        const ctx = canvas.getContext("2d");
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        
        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = -1;
        let maxY = -1;
        let found = false;
        
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const idx = (y * canvas.width + x) * 4;
                const alpha = data[idx + 3];
                if (alpha > 0) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    found = true;
                }
            }
        }
        
        if (!found) {
            return { minX: 0, minY: 0, maxX: canvas.width - 1, maxY: canvas.height - 1, width: canvas.width, height: canvas.height, found: false };
        }
        
        return {
            minX: minX,
            minY: minY,
            maxX: maxX,
            maxY: maxY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
            found: true
        };
    }

    async function exportCanvasResult() {
        const format = dom.exportFormat.value;
        const isTransparentBgActive = dom.bgRemoveActive ? dom.bgRemoveActive.checked : false;
        
        let defaultFilename = "";
        if (format === "png" || format === "jpg") {
            defaultFilename = `gifstudio_disegno.${format}`;
        } else if (format === "gif") {
            defaultFilename = "gifstudio_animazione.gif";
        }
        
        let fileHandle = null;
        let userFilename = "";
        
        if (state.exportDirectoryHandle) {
            const extension = format === "jpg" ? "jpg" : format;
            const cleanDefault = defaultFilename.substring(0, defaultFilename.lastIndexOf('.')) || defaultFilename;
            const promptMsg = `Come vuoi chiamare il file da esportare nella cartella selezionata (${state.exportDirectoryHandle.name})?`;
            const inputName = prompt(promptMsg, cleanDefault);
            if (inputName === null) {
                console.log("Salvataggio annullato dall'utente.");
                return;
            }
            userFilename = inputName.trim();
            if (!userFilename) {
                userFilename = cleanDefault;
            }
            if (!userFilename.toLowerCase().endsWith("." + extension)) {
                userFilename += "." + extension;
            }

            try {
                // Richiediamo i permessi di scrittura se non sono già attivi
                const opts = { mode: 'readwrite' };
                if (await state.exportDirectoryHandle.queryPermission(opts) !== 'granted') {
                    if (await state.exportDirectoryHandle.requestPermission(opts) !== 'granted') {
                        alert("Permesso di scrittura nella cartella selezionata negato. Salvataggio interrotto.");
                        return;
                    }
                }
                fileHandle = await state.exportDirectoryHandle.getFileHandle(userFilename, { create: true });
            } catch (err) {
                console.error("Errore nel creare il file nella cartella selezionata:", err);
                alert("Errore nel creare il file nella cartella selezionata: " + err.message);
                return;
            }
        } else {
            if (typeof window.showSaveFilePicker === "function") {
                try {
                    let acceptTypes = {};
                    if (format === "png") {
                        acceptTypes = { 'image/png': ['.png'] };
                    } else if (format === "jpg" || format === "jpeg") {
                        acceptTypes = { 'image/jpeg': ['.jpg', '.jpeg'] };
                    } else if (format === "gif") {
                        acceptTypes = { 'image/gif': ['.gif'] };
                    }
                    
                    fileHandle = await window.showSaveFilePicker({
                        suggestedName: defaultFilename,
                        types: [{
                            description: `${format.toUpperCase()} Image`,
                            accept: acceptTypes
                        }]
                    });
                } catch (err) {
                    if (err.name === 'AbortError') {
                        console.log("Salvataggio annullato dall'utente.");
                        return;
                    }
                    console.warn("showSaveFilePicker fallito o non supportato in questo contesto. Fallback al prompt...", err);
                }
            }
            
            if (!fileHandle) {
                const extension = format === "jpg" ? "jpg" : format;
                const cleanDefault = defaultFilename.substring(0, defaultFilename.lastIndexOf('.')) || defaultFilename;
                const promptMsg = "Salvataggio file in corso.\n" + 
                                  "Il file verra' salvato nella cartella dei Download predefinita del tuo browser.\n" + 
                                  "Nota: Per poter scegliere ogni volta la cartella di destinazione, abilita l'opzione \"Chiedi dove salvare ogni file prima di scaricarlo\" nelle impostazioni del tuo browser (oppure avvia l'app tramite 'apri_con_server_locale.bat' usando Chrome o Edge).\n\n" +
                                  "Come vuoi chiamare il file da esportare?";
                const inputName = prompt(promptMsg, cleanDefault);
                if (inputName === null) {
                    console.log("Salvataggio annullato dall'utente tramite prompt.");
                    return;
                }
                userFilename = inputName.trim();
                if (!userFilename) {
                    userFilename = cleanDefault;
                }
                if (!userFilename.toLowerCase().endsWith("." + extension)) {
                    userFilename += "." + extension;
                }
            }
        }

        if (format === "png" || format === "jpg") {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = state.canvasWidth;
            tempCanvas.height = state.canvasHeight;
            const tempCtx = tempCanvas.getContext("2d");
            
            if (format === "jpg" && !isTransparentBgActive) {
                tempCtx.fillStyle = "#ffffff";
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            }
            
            const frame = getActiveFrame();
            if (frame) {
                frame.layers.forEach(layer => {
                    if (!layer.visible) return;

                    if (layer.type === "text" || layer.isReference === true) {
                        const currentFrameNum = state.activeFrameIndex + 1;
                        const startF = layer.startFrame !== undefined ? layer.startFrame : 1;
                        const endF = layer.endFrame !== undefined ? layer.endFrame : state.frames.length;
                        if (currentFrameNum < startF || currentFrameNum > endF) {
                            return;
                        }
                    }

                    tempCtx.save();
                    tempCtx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;
                    tempCtx.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
                    tempCtx.rotate((layer.r * Math.PI) / 180);

                    if (layer.type === "image" && (layer.isAnimatedGif && layer.gifFrames && layer.gifFrames.length > 0)) {
                        const refFrameIdx = state.activeFrameIndex % layer.gifFrames.length;
                        const activeFrameCanvas = layer.gifFrames[refFrameIdx];
                        let renderSource = applyGlobalFilters(layer, activeFrameCanvas);

                        if (layer.borderRadius > 0) {
                            tempCtx.beginPath();
                            const radius = Math.min(layer.borderRadius, layer.w / 2, layer.h / 2);
                            tempCtx.roundRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h, radius);
                            tempCtx.clip();
                            tempCtx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                        } else {
                            tempCtx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                        }
                    }
                    else if (layer.type === "image" && (layer.canvasImage || layer.img)) {
                        let renderSource = applyGlobalFilters(layer, layer.canvasImage || layer.img);

                        if (layer.borderRadius > 0) {
                            tempCtx.beginPath();
                            const radius = Math.min(layer.borderRadius, layer.w / 2, layer.h / 2);
                            tempCtx.roundRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h, radius);
                            tempCtx.clip();
                            tempCtx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                        } else {
                            tempCtx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                        }
                    } 
                    else if (layer.type === "text") {
                        tempCtx.font = `${layer.fontSize}px ${layer.fontFamily}`;
                        tempCtx.fillStyle = layer.fontColor;
                        tempCtx.textAlign = "center";
                        tempCtx.textBaseline = "middle";
                        
                        if (layer.borderRadius > 0) {
                            tempCtx.save();
                            tempCtx.fillStyle = "rgba(0,0,0,0.15)";
                            tempCtx.beginPath();
                            tempCtx.roundRect(-layer.w/2, -layer.h/2, layer.w, layer.h, layer.borderRadius);
                            tempCtx.fill();
                            tempCtx.restore();
                        }
                        tempCtx.fillText(layer.text, 0, 0);
                    }

                    if (layer.drawingCanvas) {
                        tempCtx.drawImage(layer.drawingCanvas, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                    }
                    tempCtx.restore();
                });
            }

            let exportCanvas = tempCanvas;
            if (isTransparentBgActive) {
                const bbox = getCanvasBoundingBox(tempCanvas);
                const finalCanvas = document.createElement("canvas");
                finalCanvas.width = tempCanvas.width;
                finalCanvas.height = tempCanvas.height;
                const finalCtx = finalCanvas.getContext("2d");
                
                if (format === "jpg") {
                    finalCtx.fillStyle = "#ffffff";
                    finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
                }
                
                if (bbox.found) {
                    const newW = bbox.width * Math.min(tempCanvas.width / bbox.width, tempCanvas.height / bbox.height);
                    const newH = bbox.height * Math.min(tempCanvas.width / bbox.width, tempCanvas.height / bbox.height);
                    const dx = (tempCanvas.width - newW) / 2;
                    const dy = (tempCanvas.height - newH) / 2;
                    
                    finalCtx.drawImage(
                        tempCanvas,
                        bbox.minX, bbox.minY, bbox.width, bbox.height,
                        dx, dy, newW, newH
                    );
                    exportCanvas = finalCanvas;
                }
            }

            const dataUrl = exportCanvas.toDataURL(format === "png" ? "image/png" : "image/jpeg", 0.95);
            await downloadDataUrl(dataUrl, `gifstudio_disegno.${format}`, format, fileHandle, userFilename);
        } 
        else if (format === "gif") {
            if (state.frames.length === 0) return;

            dom.exportFile.innerText = "Salvataggio GIF in corso...";
            dom.exportFile.disabled = true;

            const compiledCanvasFrames = [];
            const frameDelays = [];

            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = state.canvasWidth;
            tempCanvas.height = state.canvasHeight;
            const tempCtx = tempCanvas.getContext("2d");

            // Pre-scan per trovare il bounding box unificato
            let unifiedBbox = { minX: tempCanvas.width, minY: tempCanvas.height, maxX: -1, maxY: -1, found: false };
            
            if (isTransparentBgActive) {
                for (let fIdx = 0; fIdx < state.frames.length; fIdx++) {
                    const frame = state.frames[fIdx];
                    const scanCanvas = document.createElement("canvas");
                    scanCanvas.width = tempCanvas.width;
                    scanCanvas.height = tempCanvas.height;
                    const scanCtx = scanCanvas.getContext("2d");
                    
                    frame.layers.forEach(layer => {
                        if (!layer.visible) return;

                        if (layer.type === "text" || layer.isReference === true) {
                            const currentFrameNum = fIdx + 1;
                            const startF = layer.startFrame !== undefined ? layer.startFrame : 1;
                            const endF = layer.endFrame !== undefined ? layer.endFrame : state.frames.length;
                            if (currentFrameNum < startF || currentFrameNum > endF) {
                                return;
                            }
                        }

                        scanCtx.save();
                        scanCtx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;
                        scanCtx.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
                        scanCtx.rotate((layer.r * Math.PI) / 180);

                        if (layer.type === "image" && (layer.isAnimatedGif && layer.gifFrames && layer.gifFrames.length > 0)) {
                            const refFrameIdx = fIdx % layer.gifFrames.length;
                            const activeFrameCanvas = layer.gifFrames[refFrameIdx];
                            let renderSource = applyGlobalFilters(layer, activeFrameCanvas);

                            if (layer.borderRadius > 0) {
                                scanCtx.beginPath();
                                const radius = Math.min(layer.borderRadius, layer.w / 2, layer.h / 2);
                                scanCtx.roundRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h, radius);
                                scanCtx.clip();
                                scanCtx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                            } else {
                                scanCtx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                            }
                        }
                        else if (layer.type === "image" && (layer.canvasImage || layer.img)) {
                            let renderSource = applyGlobalFilters(layer, layer.canvasImage || layer.img);

                            if (layer.borderRadius > 0) {
                                scanCtx.beginPath();
                                const radius = Math.min(layer.borderRadius, layer.w / 2, layer.h / 2);
                                scanCtx.roundRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h, radius);
                                scanCtx.clip();
                                scanCtx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                            } else {
                                scanCtx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                            }
                        } 
                        else if (layer.type === "text") {
                            scanCtx.font = `${layer.fontSize}px ${layer.fontFamily}`;
                            scanCtx.fillStyle = layer.fontColor;
                            scanCtx.textAlign = "center";
                            scanCtx.textBaseline = "middle";
                            
                            if (layer.borderRadius > 0) {
                                scanCtx.save();
                                scanCtx.fillStyle = "rgba(0,0,0,0.15)";
                                scanCtx.beginPath();
                                scanCtx.roundRect(-layer.w/2, -layer.h/2, layer.w, layer.h, layer.borderRadius);
                                scanCtx.fill();
                                scanCtx.restore();
                            }
                            scanCtx.fillText(layer.text, 0, 0);
                        }

                        if (layer.drawingCanvas) {
                            scanCtx.drawImage(layer.drawingCanvas, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                        }
                        scanCtx.restore();
                    });
                    
                    const fBbox = getCanvasBoundingBox(scanCanvas);
                    if (fBbox.found) {
                        if (fBbox.minX < unifiedBbox.minX) unifiedBbox.minX = fBbox.minX;
                        if (fBbox.minY < unifiedBbox.minY) unifiedBbox.minY = fBbox.minY;
                        if (fBbox.maxX > unifiedBbox.maxX) unifiedBbox.maxX = fBbox.maxX;
                        if (fBbox.maxY > unifiedBbox.maxY) unifiedBbox.maxY = fBbox.maxY;
                        unifiedBbox.found = true;
                    }
                }
            }
            
            if (isTransparentBgActive && unifiedBbox.found) {
                unifiedBbox.width = unifiedBbox.maxX - unifiedBbox.minX + 1;
                unifiedBbox.height = unifiedBbox.maxY - unifiedBbox.minY + 1;
            } else {
                unifiedBbox = {
                    minX: 0,
                    minY: 0,
                    maxX: tempCanvas.width - 1,
                    maxY: tempCanvas.height - 1,
                    width: tempCanvas.width,
                    height: tempCanvas.height,
                    found: false
                };
            }

            let frameIdx = 0;
            
            function renderNextFrameForExport() {
                if (frameIdx >= state.frames.length) {
                    compileGifWithGifJs(compiledCanvasFrames, frameDelays, fileHandle, userFilename);
                    return;
                }

                const frame = state.frames[frameIdx];
                
                const frameCanvas = document.createElement("canvas");
                frameCanvas.width = tempCanvas.width;
                frameCanvas.height = tempCanvas.height;
                const frameCtx = frameCanvas.getContext("2d");

                frame.layers.forEach(layer => {
                    if (!layer.visible) return;

                    if (layer.type === "text" || layer.isReference === true) {
                        const currentFrameNum = frameIdx + 1;
                        const startF = layer.startFrame !== undefined ? layer.startFrame : 1;
                        const endF = layer.endFrame !== undefined ? layer.endFrame : state.frames.length;
                        if (currentFrameNum < startF || currentFrameNum > endF) {
                            return;
                        }
                    }

                    frameCtx.save();
                    frameCtx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;
                    frameCtx.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
                    frameCtx.rotate((layer.r * Math.PI) / 180);

                    if (layer.type === "image" && (layer.isAnimatedGif && layer.gifFrames && layer.gifFrames.length > 0)) {
                        const refFrameIdx = frameIdx % layer.gifFrames.length;
                        const activeFrameCanvas = layer.gifFrames[refFrameIdx];
                        let renderSource = applyGlobalFilters(layer, activeFrameCanvas);

                        if (layer.borderRadius > 0) {
                            frameCtx.beginPath();
                            const radius = Math.min(layer.borderRadius, layer.w / 2, layer.h / 2);
                            frameCtx.roundRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h, radius);
                            frameCtx.clip();
                            frameCtx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                        } else {
                            frameCtx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                        }
                    }
                    else if (layer.type === "image" && (layer.canvasImage || layer.img)) {
                        let renderSource = applyGlobalFilters(layer, layer.canvasImage || layer.img);

                        if (layer.borderRadius > 0) {
                            frameCtx.beginPath();
                            const radius = Math.min(layer.borderRadius, layer.w / 2, layer.h / 2);
                            frameCtx.roundRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h, radius);
                            frameCtx.clip();
                            frameCtx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                        } else {
                            frameCtx.drawImage(renderSource, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                        }
                    } 
                    else if (layer.type === "text") {
                        frameCtx.font = `${layer.fontSize}px ${layer.fontFamily}`;
                        frameCtx.fillStyle = layer.fontColor;
                        frameCtx.textAlign = "center";
                        frameCtx.textBaseline = "middle";
                        
                        if (layer.borderRadius > 0) {
                            frameCtx.save();
                            frameCtx.fillStyle = "rgba(0,0,0,0.15)";
                            frameCtx.beginPath();
                            frameCtx.roundRect(-layer.w/2, -layer.h/2, layer.w, layer.h, layer.borderRadius);
                            frameCtx.fill();
                            frameCtx.restore();
                        }
                        frameCtx.fillText(layer.text, 0, 0);
                    }

                    if (layer.drawingCanvas) {
                        frameCtx.drawImage(layer.drawingCanvas, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                    }
                    frameCtx.restore();
                });

                const exportFrameCanvas = document.createElement("canvas");
                exportFrameCanvas.width = tempCanvas.width;
                exportFrameCanvas.height = tempCanvas.height;
                const exportFrameCtx = exportFrameCanvas.getContext("2d");
                
                if (isTransparentBgActive) {
                    exportFrameCtx.clearRect(0, 0, exportFrameCanvas.width, exportFrameCanvas.height);
                } else {
                    exportFrameCtx.fillStyle = "#ffffff";
                    exportFrameCtx.fillRect(0, 0, exportFrameCanvas.width, exportFrameCanvas.height);
                }
                
                if (isTransparentBgActive && unifiedBbox.found) {
                    const newW = unifiedBbox.width * Math.min(tempCanvas.width / unifiedBbox.width, tempCanvas.height / unifiedBbox.height);
                    const newH = unifiedBbox.height * Math.min(tempCanvas.width / unifiedBbox.width, tempCanvas.height / unifiedBbox.height);
                    const dx = (tempCanvas.width - newW) / 2;
                    const dy = (tempCanvas.height - newH) / 2;
                    
                    exportFrameCtx.drawImage(
                        frameCanvas,
                        unifiedBbox.minX, unifiedBbox.minY, unifiedBbox.width, unifiedBbox.height,
                        dx, dy, newW, newH
                    );
                } else {
                    exportFrameCtx.drawImage(frameCanvas, 0, 0);
                }

                compiledCanvasFrames.push(exportFrameCanvas);
                frameDelays.push(frame.delay); 

                frameIdx++;
                setTimeout(renderNextFrameForExport, 20); 
            }
            renderNextFrameForExport();
        }
    }

    function compileGifWithGifJs(canvasFrames, delays, fileHandle = null, preSelectedFilename = "") {
        if (!window.GIF) {
            alert("Libreria GIF.js non disponibile.");
            dom.exportFile.innerText = "Salva il Lavoro";
            dom.exportFile.disabled = false;
            return;
        }

        let workerUrl = 'js/lib/gif.worker.js';
        if (window.GIF_WORKER_B64) {
            try {
                const byteCharacters = atob(window.GIF_WORKER_B64);
                const byteNumbers = new Uint8Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const blob = new Blob([byteNumbers], { type: 'application/javascript' });
                workerUrl = URL.createObjectURL(blob);
            } catch (err) {
                console.error("Errore nella conversione del worker Base64:", err);
            }
        }

        // Test di istanziazione per rilevare se Web Workers locali sono bloccati (same-origin policy su file://)
        let useFallbackWorker = false;
        const NativeWorker = window.Worker;
        try {
            const testWorker = new Worker(workerUrl);
            testWorker.terminate();
        } catch (e) {
            console.warn("Spawning Web Worker fallito (probabilmente causa protocollo file:// in Firefox/Chrome). Attivazione fallback main-thread per GIF.js...", e);
            useFallbackWorker = true;
        }

        // Simulatore sincrono di Web Worker sul Thread Principale
        if (useFallbackWorker && window.GIF_WORKER_B64) {
            window.Worker = class MockWorker {
                constructor(scriptUrl) {
                    this.onmessage = null;
                    this.onerror = null;
                    
                    const mockSelf = {
                        postMessage: (data) => {
                             setTimeout(() => {
                                 if (this.onmessage) {
                                     this.onmessage({ data: data });
                                 }
                             }, 0);
                        },
                        onmessage: null,
                        importScripts: () => {}
                    };

                    try {
                        const workerCode = atob(window.GIF_WORKER_B64);
                        const runWorker = new Function('self', 'globalThis', workerCode);
                        runWorker(mockSelf, mockSelf);
                        this.mockSelf = mockSelf;
                    } catch (err) {
                        console.error("Errore nel caricamento del worker simulato:", err);
                        setTimeout(() => {
                            if (this.onerror) this.onerror(err);
                        }, 0);
                    }
                }

                postMessage(data) {
                    if (this.mockSelf && this.mockSelf.onmessage) {
                        setTimeout(() => {
                            try {
                                if (this.mockSelf && this.mockSelf.onmessage) {
                                    this.mockSelf.onmessage({ data: data });
                                }
                            } catch (err) {
                                console.error("Errore durante l'esecuzione del worker simulato:", err);
                                if (this.onerror) this.onerror(err);
                            }
                        }, 0);
                    }
                }

                terminate() {
                    this.mockSelf = null;
                }
            };
        }

        try {
            const isTransparentBgActive = dom.bgRemoveActive ? dom.bgRemoveActive.checked : false;
            const gif = new GIF({
                workers: useFallbackWorker ? 1 : 2,
                quality: 10,
                width: state.canvasWidth,
                height: state.canvasHeight,
                workerScript: workerUrl,
                transparent: isTransparentBgActive ? 0x00FF00 : null
            });

            // Ottimizzazione: passiamo direttamente il contesto 2D dei canvas per bypassare il bug getImageData interno di gif.js
            for (let i = 0; i < canvasFrames.length; i++) {
                gif.addFrame(canvasFrames[i].getContext('2d'), { delay: delays[i], copy: true });
            }

            gif.on('finished', async function(blob) {
                // Ripristina sempre la classe Worker nativa
                window.Worker = NativeWorker;
                
                dom.exportFile.innerText = "Salva il Lavoro";
                dom.exportFile.disabled = false;
                const url = URL.createObjectURL(blob);
                await downloadDataUrl(url, "gifstudio_animazione.gif", "gif", fileHandle, preSelectedFilename);
                if (workerUrl.startsWith("blob:")) {
                    URL.revokeObjectURL(workerUrl);
                }
            });
            
            gif.on('progress', function(p) {
                dom.exportFile.innerText = "Salvataggio: " + Math.round(p * 100) + "%";
            });

            gif.render();
        } catch (err) {
            console.error("Errore durante la compilazione o l'esportazione della GIF:", err);
            alert("Errore durante la generazione della GIF: " + err.message);
            // Ripristina sempre la classe Worker nativa e lo stato UI in caso di eccezione
            window.Worker = NativeWorker;
            dom.exportFile.innerText = "Salva il Lavoro";
            dom.exportFile.disabled = false;
        }
    }

    async function downloadDataUrl(dataUrl, defaultFilename, format, fileHandle = null, preSelectedFilename = "") {
        let blob;
        try {
            const res = await fetch(dataUrl);
            blob = await res.blob();
        } catch (e) {
            console.error("Errore nel fetch del blob:", e);
            if (dataUrl.startsWith("data:")) {
                const parts = dataUrl.split(",");
                const byteString = atob(parts[1]);
                const mimeString = parts[0].split(":")[1].split(";")[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                blob = new Blob([ab], {type: mimeString});
            } else {
                throw e;
            }
        }

        if (fileHandle) {
            try {
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                return true;
            } catch (err) {
                console.error("Errore nella scrittura del file tramite fileHandle:", err);
            }
        }

        let finalFilename = preSelectedFilename || defaultFilename;
        const extension = format === "jpg" ? "jpg" : format;
        if (!finalFilename.toLowerCase().endsWith("." + extension)) {
            finalFilename += "." + extension;
        }

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = finalFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => {
            URL.revokeObjectURL(link.href);
        }, 1000);
        
        return true;
    }

    // ======================================================================
    // 15. SEQUENZA FRAME GIF (TIMELINE)
    // ======================================================================
    function buildTimelineUI() {
        dom.framesTrack.innerHTML = "";
        
        state.frames.forEach((frame, idx) => {
            const card = document.createElement("div");
            card.className = `frame-thumbnail-card ${idx === state.activeFrameIndex ? 'active-frame' : ''}`;
            card.dataset.index = idx;
            
            let imgHtml = "";
            if (frame.layers.length > 0 && frame.layers[0].img) {
                imgHtml = `<img src="${frame.layers[0].img.src}" alt="preview">`;
            }

            card.innerHTML = `
                <div class="frame-card-preview">${imgHtml}</div>
                <div class="frame-card-footer">
                    <span class="frame-index">#${idx + 1}</span>
                    <span>${frame.delay}ms</span>
                </div>
            `;

            card.addEventListener("click", () => {
                selectFrame(idx);
            });
            dom.framesTrack.appendChild(card);
        });

        const currentFrame = getActiveFrame();
        if (currentFrame) {
            dom.timelineDelay.value = currentFrame.delay;
        }
    }

    function selectFrame(index) {
        if (index < 0 || index >= state.frames.length) return;
        
        state.activeFrameIndex = index;
        
        const frame = getActiveFrame();
        state.activeLayerId = frame.layers.length > 0 ? frame.layers[0].id : null;
        
        buildTimelineUI();
        updateLayersListUI();
        updateXYZControlsUI();
        requestRender();

        dom.statusFramesCount.innerText = `${index + 1}/${state.frames.length}`;
    }

    function initTimelineControls() {
        if (dom.btnPlayGif) {
            dom.btnPlayGif.addEventListener("click", () => {
                if (state.isPlaying) {
                    stopPlayback();
                } else {
                    startPlayback();
                }
            });
        }

        dom.timelineDelay.addEventListener("focus", () => {
            saveState(); // Salva lo stato quando si interagisce con il delay
        });

        dom.timelineDelay.addEventListener("input", (e) => {
            const delayVal = Math.max(10, parseInt(e.target.value) || 100);
            const frame = getActiveFrame();
            if (frame) {
                frame.delay = delayVal;
                buildTimelineUI();
            }
        });

        dom.btnApplyDelayAll.addEventListener("click", () => {
            saveState(); // Salva prima di cambiare tutti i delay
            const delayVal = Math.max(10, parseInt(dom.timelineDelay.value) || 100);
            state.frames.forEach(f => f.delay = delayVal);
            buildTimelineUI();
        });

        dom.btnDuplicateFrame.addEventListener("click", () => {
            saveState(); // Salva prima della duplicazione
            const frame = getActiveFrame();
            if (!frame) return;

            const clonedLayers = frame.layers.map(l => {
                const imgCopy = l.img ? new Image() : null;
                if (imgCopy) imgCopy.src = l.img.src;
                
                let drawCopy = null;
                if (l.drawingCanvas) {
                    drawCopy = createDrawingCanvasForLayer(l.w, l.h);
                    drawCopy.getContext("2d").drawImage(l.drawingCanvas, 0, 0);
                }

                return {
                    ...l,
                    id: generateId(),
                    img: imgCopy,
                    drawingCanvas: drawCopy
                };
            });

            const newFrame = {
                id: generateId(),
                delay: frame.delay,
                layers: clonedLayers
            };

            state.frames.splice(state.activeFrameIndex + 1, 0, newFrame);
            state.activeFrameIndex++;
            selectFrame(state.activeFrameIndex);
        });

        dom.btnDeleteFrame.addEventListener("click", () => {
            if (state.frames.length <= 1) {
                alert("Devi mantenere almeno un fotogramma nella sequenza!");
                return;
            }

            saveState(); // Salva prima della cancellazione
            state.frames.splice(state.activeFrameIndex, 1);
            state.activeFrameIndex = Math.min(state.activeFrameIndex, state.frames.length - 1);
            selectFrame(state.activeFrameIndex);
        });

        dom.btnReverseFrames.addEventListener("click", () => {
            saveState(); // Salva prima dell'inversione
            state.frames.reverse();
            selectFrame(0);
        });

        dom.btnOptimizeGif.addEventListener("click", () => {
            saveState(); // Salva prima dell'ottimizzazione
            let removedCount = 0;
            for (let i = state.frames.length - 1; i > 0; i--) {
                const current = state.frames[i];
                const prev = state.frames[i-1];
                
                if (current.layers.length === 1 && prev.layers.length === 1) {
                    if (current.layers[0].img && prev.layers[0].img && current.layers[0].img.src === prev.layers[0].img.src) {
                        prev.delay += current.delay;
                        state.frames.splice(i, 1);
                        removedCount++;
                    }
                }
            }
            alert(`Ottimizzazione completata. Rimossi ${removedCount} fotogrammi doppi statici.`);
            selectFrame(0);
        });
    }

    function startPlayback() {
        if (state.isPlaying) return;
        state.isPlaying = true;
        
        if (dom.btnPlayGif) {
            dom.btnPlayGif.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Pausa`;
            dom.btnPlayGif.classList.add("paused-state");
        }

        function playStep() {
            if (!state.isPlaying) return;
            
            let nextIndex = state.activeFrameIndex + 1;
            if (nextIndex >= state.frames.length) {
                nextIndex = 0;
            }

            selectFrame(nextIndex);

            const activeFrame = getActiveFrame();
            const baseDelay = activeFrame ? activeFrame.delay : 100;
            const speedScale = parseFloat(dom.timelineSpeed.value) || 1.0;
            
            state.playInterval = setTimeout(playStep, baseDelay / speedScale);
        }
        playStep();
    }

    function stopPlayback() {
        state.isPlaying = false;
        clearTimeout(state.playInterval);
        
        if (dom.btnPlayGif) {
            dom.btnPlayGif.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Play`;
            dom.btnPlayGif.classList.remove("paused-state");
        }
    }

    // ======================================================================
    // 16. STRUMENTI DI RITOCCO E LIVELLO SCRITTA
    // ======================================================================
    function removeBackgroundByColor(layer, targetColorHex, tolerance) {
        if (!layer || layer.type !== "image") return;

        const targetRgb = hexToRgb(targetColorHex);
        if (!targetRgb) return;

        // Tolerance in Euclidean RGB space. Max distance is 255 * sqrt(3) ≈ 441.67.
        // We scale tolerance * 1.73205 so a tolerance of 255 spans the entire color space.
        const maxDist = tolerance * 1.73205;

        function processCanvas(canvas) {
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;

            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] === 0) continue;

                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                const dr = r - targetRgb.r;
                const dg = g - targetRgb.g;
                const db = b - targetRgb.b;

                const dist = Math.sqrt(dr * dr + dg * dg + db * db);
                if (dist <= maxDist) {
                    data[i + 3] = 0; // Imposta trasparente
                }
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.putImageData(imgData, 0, 0);
        }

        // Se è una GIF di riferimento (animata con più fotogrammi)
        if (layer.isAnimatedGif && layer.gifFrames && layer.gifFrames.length > 0) {
            layer.gifFrames.forEach(frameCanvas => {
                processCanvas(frameCanvas);
            });
        } 
        // Altrimenti livello statico standard
        else {
            if (!layer.canvasImage && layer.img) {
                layer.canvasImage = document.createElement("canvas");
                layer.canvasImage.width = layer.img.naturalWidth || layer.w;
                layer.canvasImage.height = layer.img.naturalHeight || layer.h;
                const imgCtx = layer.canvasImage.getContext("2d");
                imgCtx.drawImage(layer.img, 0, 0, layer.canvasImage.width, layer.canvasImage.height);
            }

            if (layer.canvasImage) {
                processCanvas(layer.canvasImage);
            }
            if (layer.drawingCanvas) {
                processCanvas(layer.drawingCanvas);
            }
        }
    }

    function initFilterTools() {
        // SINCRONIZZAZIONE TOLLERANZA (NUMERO <-> SLIDER) E AGGIORNAMENTO LIVE TRASPARENZA SFONDO
        if (dom.bgRemoveTolerance && dom.bgRemoveToleranceSlider) {
            dom.bgRemoveToleranceSlider.addEventListener("input", (e) => {
                const val = parseInt(e.target.value) || 0;
                dom.bgRemoveTolerance.value = val;
                
                const layer = getActiveLayer();
                if (layer) {
                    layer.bgRemoveTolerance = val;
                    propagateLayerChanges(layer, { bgRemoveTolerance: val });
                    
                    filterCache.delete(layer.id);
                    requestRender();
                }
            });

            dom.bgRemoveTolerance.addEventListener("input", (e) => {
                let val = parseInt(e.target.value) || 0;
                val = Math.max(0, Math.min(255, val));
                dom.bgRemoveToleranceSlider.value = val;
                
                const layer = getActiveLayer();
                if (layer) {
                    layer.bgRemoveTolerance = val;
                    propagateLayerChanges(layer, { bgRemoveTolerance: val });
                    
                    filterCache.delete(layer.id);
                    requestRender();
                }
            });
        }

        // ATTIVAZIONE / DISATTIVAZIONE LIVE DELLA TRASPARENZA
        if (dom.bgRemoveActive) {
            dom.bgRemoveActive.addEventListener("change", (e) => {
                const layer = getActiveLayer();
                if (layer) {
                    layer.bgRemoveActive = e.target.checked;
                    propagateLayerChanges(layer, { bgRemoveActive: layer.bgRemoveActive });
                    
                    filterCache.delete(layer.id);
                    requestRender();
                }
                updateBgRemoveActiveUI(e.target.checked);
            });
        }

        // CAMBIAMENTO COLORE LIVE
        if (dom.bgRemoveColor) {
            dom.bgRemoveColor.addEventListener("input", (e) => {
                const layer = getActiveLayer();
                if (layer) {
                    layer.bgRemoveColor = e.target.value;
                    propagateLayerChanges(layer, { bgRemoveColor: layer.bgRemoveColor });
                    
                    filterCache.delete(layer.id);
                    requestRender();
                }
            });
        }

        if (dom.chromaActive) {
            dom.chromaActive.addEventListener("change", (e) => {
                const layer = getActiveLayer();
                if (layer) {
                    layer.chromaActive = e.target.checked;
                    propagateLayerChanges(layer, { chromaActive: layer.chromaActive });
                    requestRender();
                }
            });
        }

        dom.btnApplyCorners.addEventListener("click", () => {
            const layer = getActiveLayer();
            if (!layer) return;

            layer.borderRadius = parseInt(dom.filterBorderRadius.value) || 0;
            propagateLayerChanges(layer, { borderRadius: layer.borderRadius });
            requestRender();
        });

        dom.addTextLayer.addEventListener("click", () => {
            saveState(); // Salva lo stato prima di aggiungere

            const sharedId = generateId();
            const fontSize = Math.max(10, Math.min(32, Math.round(state.canvasHeight * 0.2)));
            const w = Math.max(50, Math.round(state.canvasWidth * 0.8));
            const h = Math.max(20, Math.round(fontSize * 1.5));
            const startFrame = state.activeFrameIndex + 1;
            
            // Aggiungiamo il livello Scritta con lo stesso ID a tutti i fotogrammi del progetto
            state.frames.forEach((frame) => {
                const textLayer = {
                    id: sharedId,
                    name: "Livello Scritta",
                    type: "text",
                    x: Math.round((state.canvasWidth - w) / 2),
                    y: Math.round((state.canvasHeight - h) / 2),
                    w: w,
                    h: h,
                    visible: true,
                    opacity: 1.0,
                    r: 0,
                    keepRatio: false,
                    text: "Gif Studio",
                    fontFamily: "Poppins",
                    fontSize: fontSize,
                    fontColor: "#ffffff",
                    borderRadius: 0,
                    startFrame: startFrame,
                    endFrame: startFrame // Mostrato solo nel frame corrente di default
                };
                
                const maxZ = frame.layers.reduce((max, l) => Math.max(max, isNaN(l.z) ? 0 : (l.z || 0)), 0);
                textLayer.z = maxZ + 1;
                
                frame.layers.push(textLayer);
            });

            state.activeLayerId = sharedId;
            
            updateLayersListUI();
            updateXYZControlsUI();
            requestRender();
        });

        dom.deleteLayer.addEventListener("click", () => {
            removeActiveLayer();
        });

        dom.btnAddReplacement.addEventListener("click", () => {
            saveState();
            const useGlobal = state.editScope === "global";
            const rep = {
                from: dom.replaceColorFrom.value,
                to: dom.replaceColorTo.value,
                tolerance: parseInt(dom.replaceColorTolerance.value) || 20,
                transparent: false,
                seedX: useGlobal ? null : (state.lastPickedReplaceCoords ? state.lastPickedReplaceCoords.x : null),
                seedY: useGlobal ? null : (state.lastPickedReplaceCoords ? state.lastPickedReplaceCoords.y : null)
            };
            state.colorReplacements.push(rep);
            state.lastPickedReplaceCoords = null;
            bakeColorReplacementToProject(rep);
            updateReplacementsUI();
            filterCache.clear();
            requestRender();
        });

    }

    // ======================================================================
    // 17. UI CUSTOMIZER CON TEMI PROFESSIONALI STILE ARCHITETTO
    // ======================================================================
    function initUiCustomizer() {
        const root = document.documentElement;

        const themes = {
            dark: {
                bg: "#111216",
                win: "#1c1e25",
                text: "#f1f5f9",
                accent: "#00ffcc",
                font: "Inter",
                radius: 10
            },
            cyber: {
                bg: "#0a0e17",
                win: "#ffffff", // Verrà impostato come trasparente rgba nel codice sotto
                text: "#ffffff",
                accent: "#ffffff",
                font: "Poppins",
                radius: 16
            },
            terminal: {
                bg: "#07080a",
                win: "#14161a",
                text: "#fcfbf7",
                accent: "#d4af37", // Oro
                font: "Playfair Display",
                radius: 8
            },
            light: {
                bg: "#eaecef",
                win: "#ffffff",
                text: "#1e293b",
                accent: "#475569", // Grigio scuro
                font: "Outfit",
                radius: 12
            },
            concrete: {
                bg: "#2e3136",
                win: "#373b42",
                text: "#e8e8e8",
                accent: "#ff5500", // Cemento arancione
                font: "Roboto",
                radius: 4
            },
            retro: {
                bg: "#000000",
                win: "#050f05",
                text: "#33ff33",
                accent: "#33ff33",
                font: "JetBrains Mono",
                radius: 0
            }
        };

        function updateThemeColors() {
            const bgVal = dom.uiColorBg.value;
            const winVal = dom.uiColorWin.value;
            const textVal = dom.uiColorText.value;
            const accentVal = dom.uiColorAccent.value;
            
            const accentRgb = hexToRgb(accentVal);
            const winRgb = hexToRgb(winVal);
            
            root.style.setProperty("--bg-desktop", bgVal);
            
            const isCyber = root.classList.contains("theme-cyber");
            const alphaWin = isCyber ? 0.06 : 0.85;
            root.style.setProperty("--bg-window", `rgba(${winRgb.r}, ${winRgb.g}, ${winRgb.b}, ${alphaWin})`);
            root.style.setProperty("--bg-header", `rgba(${winRgb.r}, ${winRgb.g}, ${winRgb.b}, 0.95)`);
            
            root.style.setProperty("--text-main", textVal);
            root.style.setProperty("--accent-color", accentVal);
            root.style.setProperty("--accent-color-rgb", `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
            
            root.style.setProperty("--border-window-focus", `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.6)`);
            
            if (isCyber) {
                root.style.setProperty("--border-window", `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.3)`);
            } else if (root.classList.contains("theme-terminal")) {
                root.style.setProperty("--border-window", `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.25)`);
            } else if (root.classList.contains("theme-concrete")) {
                root.style.setProperty("--border-window", `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.25)`);
            } else if (root.classList.contains("theme-retro")) {
                root.style.setProperty("--border-window", `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.4)`);
            } else {
                root.style.setProperty("--border-window", `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.15)`);
            }
            
            requestRender();
            saveUiPreferences();
        }

        window._gifStudioUpdateThemeColors = updateThemeColors;

        function applyThemePreset(themeKey) {
            const t = themes[themeKey];
            if (!t) return;

            root.className = "";
            root.classList.add(`theme-${themeKey}`);

            dom.uiColorBg.value = t.bg;
            dom.uiColorText.value = t.text;
            dom.uiColorAccent.value = t.accent;
            dom.uiFontFamily.value = t.font;
            dom.uiWindowRadius.value = t.radius;
            dom.uiRadiusVal.innerText = `${t.radius}px`;

            if (themeKey === "cyber") {
                dom.uiColorWin.value = "#ffffff";
            } else {
                dom.uiColorWin.value = t.win;
            }

            document.querySelectorAll(".theme-btn").forEach(btn => btn.classList.remove("active"));
            const currentBtn = document.getElementById(`theme-${themeKey}`);
            if (currentBtn) currentBtn.classList.add("active");
            
            updateThemeColors();
            saveUiPreferences();
        }

        document.querySelectorAll(".theme-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const key = e.currentTarget.dataset.theme;
                if (key) applyThemePreset(key);
            });
        });

        dom.uiColorBg.addEventListener("input", () => {
            updateThemeColors();
            document.querySelectorAll(".theme-btn").forEach(btn => btn.classList.remove("active"));
            saveUiPreferences();
        });
        dom.uiColorWin.addEventListener("input", () => {
            updateThemeColors();
            document.querySelectorAll(".theme-btn").forEach(btn => btn.classList.remove("active"));
            saveUiPreferences();
        });
        dom.uiColorText.addEventListener("input", () => {
            updateThemeColors();
            document.querySelectorAll(".theme-btn").forEach(btn => btn.classList.remove("active"));
            saveUiPreferences();
        });
        dom.uiColorAccent.addEventListener("input", () => {
            updateThemeColors();
            document.querySelectorAll(".theme-btn").forEach(btn => btn.classList.remove("active"));
            saveUiPreferences();
        });

        dom.uiFontFamily.addEventListener("change", (e) => {
            root.style.setProperty("--font-primary", e.target.value);
            saveUiPreferences();
        });

        dom.uiFontSize.addEventListener("input", (e) => {
            root.style.setProperty("--font-size-base", `${e.target.value}px`);
            saveUiPreferences();
        });

        dom.uiWindowRadius.addEventListener("input", (e) => {
            root.style.setProperty("--window-radius", `${e.target.value}px`);
            dom.uiRadiusVal.innerText = `${e.target.value}px`;
            saveUiPreferences();
        });

    }

    // ======================================================================
    // 18. BINDING COMPLETO DEGLI INPUT GLOBALI ED AVVIO
    // ======================================================================
    function bindGlobalInputs() {
        const xyzInputs = [
            dom.xyzX, dom.xyzY, dom.xyzZ, dom.xyzW, dom.xyzH, dom.xyzR, 
            dom.xyzOpacity, dom.xyzKeepRatio, dom.xyzTextContent, 
            dom.xyzTextFont, dom.xyzTextColor, dom.xyzTextSize,
            dom.xyzTextStartFrame, dom.xyzTextEndFrame
        ];
        xyzInputs.forEach(input => {
            if (!input) return;
            input.addEventListener("input", handleXYZInput);
            
            // Salvataggio dello stato all'evento focus per evitare sovraccarichi sullo stack di Undo
            input.addEventListener("focus", () => {
                saveState();
            });
        });

        // Collegamento dei pulsanti Undo/Redo del Canvas
        if (dom.btnUndo) {
            dom.btnUndo.addEventListener("click", undo);
        }
        if (dom.btnRedo) {
            dom.btnRedo.addEventListener("click", redo);
        }

        // Scorciatoie tastiera globali (Ctrl+Z per Undo, Ctrl+Y o Ctrl+Shift+Z per Redo)
        document.addEventListener("keydown", (e) => {
            const isZ = e.key.toLowerCase() === "z";
            const isY = e.key.toLowerCase() === "y";
            if (e.ctrlKey) {
                if (isZ) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        redo();
                    } else {
                        undo();
                    }
                } else if (isY) {
                    e.preventDefault();
                    redo();
                }
            }
        });

        // Ridimensionamento finestra: scala le posizioni salvate, NON ridispone a griglia
        let resizeTimeout;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const screenW = window.innerWidth;
                const screenH = window.innerHeight;

                if (!layoutRestoreComplete) {
                    lastKnownScreen = { w: screenW, h: screenH };
                    return;
                }

                if (screenW === lastKnownScreen.w && screenH === lastKnownScreen.h) {
                    return;
                }

                reapplyProportionalLayout();
                lastKnownScreen = { w: screenW, h: screenH };
                scheduleSaveAllAppPreferences();
                setTimeout(centerCanvas, 50);
            }, 120);
        });
    }

    function initScopeControls() {
        if (!dom.btnScopeFrame || !dom.btnScopeGlobal) return;

        dom.btnScopeFrame.addEventListener("click", () => {
            state.editScope = "frame";
            dom.btnScopeFrame.classList.add("active");
            dom.btnScopeGlobal.classList.remove("active");
            saveUiPreferences();
        });

        dom.btnScopeGlobal.addEventListener("click", () => {
            state.editScope = "global";
            dom.btnScopeGlobal.classList.add("active");
            dom.btnScopeFrame.classList.remove("active");
            saveUiPreferences();
        });
    }

    function saveCustomNames() {
        scheduleSaveAllAppPreferences();
    }

    function loadCustomNames() {
        try {
            const saved = localStorage.getItem("gifstudio_custom_names_v1");
            if (saved) {
                const names = JSON.parse(saved);
                document.querySelectorAll(".window").forEach(win => {
                    const titleEl = win.querySelector(".window-title");
                    if (titleEl && names[win.id]) titleEl.innerText = names[win.id];
                });
                document.querySelectorAll(".tab-btn").forEach(tab => {
                    const tabId = tab.getAttribute("data-tab");
                    if (tabId && names[tabId]) tab.innerText = names[tabId];
                });
            }
        } catch(e) {}
    }

    function setupCustomRenaming() {
        document.addEventListener("dblclick", (e) => {
            const target = e.target;
            if (target.classList.contains("window-title") || target.classList.contains("tab-btn")) {
                if (target.querySelector("input")) return;
                
                const currentText = target.innerText.trim();
                const input = document.createElement("input");
                input.type = "text";
                input.value = currentText;
                input.style.width = "100%";
                input.style.minWidth = "60px";
                input.style.background = "rgba(0,0,0,0.8)";
                input.style.color = "white";
                input.style.border = "1px solid var(--accent-color)";
                input.style.outline = "none";
                input.style.fontFamily = "inherit";
                input.style.fontSize = "inherit";
                input.style.fontWeight = "inherit";
                input.style.textAlign = "center";
                input.style.borderRadius = "4px";
                input.style.boxSizing = "border-box";
                
                target.innerText = "";
                target.appendChild(input);
                input.focus();
                input.select();
                
                function saveName() {
                    target.innerText = input.value || currentText;
                    saveCustomNames();
                }
                
                input.addEventListener("blur", saveName);
                input.addEventListener("keydown", (ev) => {
                    if (ev.key === "Enter") input.blur();
                });
            }
        });
    }

    async function checkForUpdates() {
        try {
            const response = await fetch('/api/check-update');
            if (!response.ok) return;
            const data = await response.json();
            if (data.updateAvailable) {
                showUpdateBanner(data);
            }
        } catch (e) {
            console.warn("Impossibile verificare gli aggiornamenti:", e);
        }
    }

    function showUpdateBanner(updateData) {
        if (document.getElementById('gifstudio-update-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'gifstudio-update-banner';
        banner.className = 'update-banner';
        
        banner.innerHTML = `
            <div class="update-banner-content">
                <div class="update-banner-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                    </svg>
                </div>
                <div class="update-banner-text">
                    <div class="update-banner-title">Nuovo Aggiornamento Disponibile! (v${updateData.latestVersion})</div>
                    <div class="update-banner-desc">È disponibile una versione più recente di Gif Studio. La tua versione attuale è v${updateData.currentVersion}.</div>
                </div>
            </div>
            <div class="update-banner-actions">
                <a href="${updateData.downloadUrl}" target="_blank" class="update-banner-btn-download" id="update-download-btn">Aggiorna</a>
                <button class="update-banner-btn-close" id="update-close-btn" title="Chiudi">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;

        const desktopEl = document.getElementById('desktop');
        if (desktopEl) {
            desktopEl.appendChild(banner);
        } else {
            document.body.appendChild(banner);
        }

        const closeBtn = banner.querySelector('#update-close-btn');
        closeBtn.addEventListener('click', () => {
            banner.classList.add('slide-out');
            banner.addEventListener('animationend', (e) => {
                if (e.animationName === 'bannerDisappear') {
                    banner.remove();
                }
            });
        });
    }

    async function startApp() {
        initAllTabOrigins();
        setupTabHandlers();
        initTabDockingSystem();
        setupWindowManager();
        initCanvasWorkspace();
        initDrawingTools();
        initFileHandlers();
        initTimelineControls();
        initFilterTools();
        initUiCustomizer();
        initScopeControls();
        bindGlobalInputs();
        setupCustomRenaming();

        let savedPayload = await loadAllAppPreferences();
        if (!savedPayload) {
            arrangeWindowsDefault();
            savedPayload = buildPayloadFromLocalStorage();
        }

        cachedLayoutPayload = savedPayload || cachedLayoutPayload;

        const finalizeLayoutRestore = () => {
            reapplyProportionalLayout();
            layoutRestoreComplete = true;
            lastKnownScreen = { w: window.innerWidth, h: window.innerHeight };
            if (typeof window.updateDynamicUI === "function") window.updateDynamicUI();
            setTimeout(centerCanvas, 30);
        };

        finalizeLayoutRestore();
        setTimeout(finalizeLayoutRestore, 350);

        if (typeof window.updateDynamicUI === "function") window.updateDynamicUI();

        window.addEventListener("beforeunload", () => saveAllAppPreferences());
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") saveAllAppPreferences();
        });

        buildTimelineUI();
        updateReplacementsUI();
        checkForUpdates();
    }

    startApp();
});
