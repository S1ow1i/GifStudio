import { brushTool } from './tools/BrushTool.js';
import { eraserTool } from './tools/EraserTool.js';
import { selectTool } from './tools/SelectTool.js';
import { colorPickerTool } from './tools/ColorPickerTool.js';
import { generateId } from './core/Utils.js';
import { state } from './core/State.js';
import { dom } from './core/DOM.js';
import { shapesTool } from './tools/ShapesTool.js';
import { lassoTool } from './tools/LassoTool.js';
import { magicWandTool } from './tools/MagicWandTool.js';
import { timelinePanel } from './panels/TimelinePanel.js';
import { layerPanel } from './panels/LayerPanel.js';
import { propertiesPanel } from './panels/PropertiesPanel.js';

/* ==========================================================================
   GIF STUDIO - LOGICA APPLICAZIONE & FUNZIONALITÀ INTERFACCIA
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // ======================================================================
    // 1. STATO GLOBALE DELL'APPLICAZIONE
    // ======================================================================
    

    let layoutRestoreComplete = false;
    let lastKnownScreen = { w: window.innerWidth, h: window.innerHeight };
    let cachedLayoutPayload = null;

    const LAYOUT_STORAGE_KEY = "gifstudio_layout_v7";
    const LAYOUT_SCREEN_KEY = "gifstudio_layout_v6_screen";
    const WORKSPACE_GAP = 8;
    const TIMELINE_HEIGHT = 150;
    const DOCK_BOTTOM_RESERVE = 16;
    const TIMELINE_TAB_IDS = ["tab-timeline-content"];

    function getWorkspaceMetrics() {
        const container = document.getElementById("window-container");
        if (container) {
            const r = container.getBoundingClientRect();
            if (r.width > 100 && r.height > 100) {
                return {
                    w: Math.max(320, Math.round(r.width)),
                    h: Math.max(240, Math.round(r.height)),
                    gap: WORKSPACE_GAP,
                    timelineH: TIMELINE_HEIGHT,
                    dockReserve: getDockReservePx()
                };
            }
        }
        return {
            w: window.innerWidth,
            h: Math.max(240, window.innerHeight - getTopBarHeightPx()),
            gap: WORKSPACE_GAP,
            timelineH: TIMELINE_HEIGHT,
            dockReserve: getDockReservePx()
        };
    }

    function getDockReservePx() {
        return DOCK_BOTTOM_RESERVE;
    }

    function getTopBarHeightPx() {
        const bar = document.getElementById("top-bar");
        return bar ? Math.max(52, bar.offsetHeight) : 76;
    }

    function getTimelineColumnBounds() {
        const ws = getWorkspaceMetrics();
        const gap = ws.gap;
        const projectW = parseInt(document.getElementById("win-project")?.style.width, 10) || 400;
        const propsW = parseInt(document.getElementById("win-properties")?.style.width, 10) || 680;
        
        const canvasLeft = gap + projectW + gap;
        const canvasWidth = Math.max(400, ws.w - canvasLeft - propsW - gap * 2);
        
        const timelineLeft = gap;
        const timelineWidth = ws.w - propsW - gap * 3; // Force exact stop before properties

        return { canvasLeft, canvasWidth, timelineLeft, timelineWidth, gap, ws };
    }

    function computeTimelineDockLayout(timelineHeightOverride) {
        const { canvasLeft, canvasWidth, timelineLeft, timelineWidth, gap, ws } = getTimelineColumnBounds();
        const dockReserve = getDockReservePx();
        const timeline = document.getElementById("win-timeline");
        let timelineH = timelineHeightOverride;

        if (timelineH == null || isNaN(timelineH)) {
            const currentH = timeline ? parseInt(timeline.style.height, 10) : NaN;
            const useSaved = !isNaN(currentH) && currentH > 100 &&
                timeline && !timeline.classList.contains("minimized-window");
            timelineH = useSaved ? currentH : ws.timelineH;
        }

        const maxTimelineH = ws.h - gap * 2 - 80;
        timelineH = Math.max(180, Math.min(timelineH, maxTimelineH));
        const canvasH = Math.max(180, ws.h - timelineH - gap);
        const timelineTop = ws.h - timelineH - gap;

        return {
            canvasLeft,
            canvasWidth,
            timelineLeft,
            timelineWidth,
            gap,
            ws,
            dockReserve,
            timelineH,
            canvasH,
            timelineTop,
            canvasTop: gap
        };
    }

    function applyTimelineDockLayout(layout, options = {}) {
        const dock = layout || computeTimelineDockLayout();
        const timeline = document.getElementById("win-timeline");
        const canvas = document.getElementById("win-canvas");
        if (!timeline || !canvas) return dock;

        timeline.style.display = "flex";
        timeline.style.visibility = "visible";
        timeline.classList.remove("minimized-window");

        timeline.style.left = `${dock.timelineLeft}px`;
        timeline.style.width = `${dock.timelineWidth}px`;
        timeline.style.top = `${dock.timelineTop}px`;
        timeline.style.height = `${dock.timelineH}px`;
        timeline.style.zIndex = "350";

        canvas.style.left = `${dock.canvasLeft}px`;
        canvas.style.width = `${dock.canvasWidth}px`;
        canvas.style.top = `${dock.canvasTop}px`;
        canvas.style.height = `${dock.canvasH}px`;

        const minBtn = timeline.querySelector(".win-minimize");
        if (minBtn) minBtn.innerHTML = "&#8722;";

        if (state.windows["win-timeline"]) {
            Object.assign(state.windows["win-timeline"], {
                left: dock.timelineLeft,
                top: dock.timelineTop,
                width: dock.timelineWidth,
                height: dock.timelineH,
                visible: true,
                isMinimized: false
            });
        }
        if (state.windows["win-canvas"]) {
            Object.assign(state.windows["win-canvas"], {
                left: dock.canvasLeft,
                top: dock.canvasTop,
                width: dock.canvasWidth,
                height: dock.canvasH
            });
        }

        if (options.repairTabs !== false) repairTimelineWindow();
        if (options.clamp !== false) clampWindowToViewport(timeline);
        if (options.rebuildFrames && dom.framesTrack) buildTimelineUI();

        return dock;
    }

    function migrateLegacyLayoutStorage() {
        try {
            localStorage.removeItem("gifstudio_layout_v5");
            localStorage.removeItem("gifstudio_layout_v5_screen");
        } catch (e) {}
    }

    // ======================================================================
    // 2. ELEMENTI DELLA SCHERMATA (DOM)
    // ======================================================================
    

    const ctx = dom.mainCanvas.getContext("2d");

    // Cache temporanea per velocizzare il Chroma Key
    const filterCache = new Map();

    // ======================================================================
    // 3. FUNZIONI UTILI DI SUPPORTO (HELPERS)
    // ======================================================================
    

    function getActiveFrame() {
        return state.frames[state.activeFrameIndex];
    }

    function getActiveLayer() {
        const frame = getActiveFrame();
        if (!frame) return null;
        return frame.layers.find(l => l.id === state.activeLayerId);
    }

    const KEYFRAME_PROPS = ["x", "y", "z", "r", "opacity", "w", "h"];

    function ensureLayerTransparencyRules(layer) {
        if (!layer) return;
        if (!Array.isArray(layer.transparencyRules)) layer.transparencyRules = [];
    }

    function ensureLayerKeyframes(layer) {
        if (!layer) return;
        if (!layer.keyframes || typeof layer.keyframes !== "object") layer.keyframes = {};
    }

    function findLayerInFrame(frame, layerRef) {
        if (!frame || !layerRef) return null;
        let target = frame.layers.find(l => l.id === layerRef.id);
        if (!target) {
            const activeFrame = getActiveFrame();
            if (activeFrame) {
                const idx = activeFrame.layers.findIndex(l => l.id === layerRef.id);
                if (idx !== -1 && idx < frame.layers.length) target = frame.layers[idx];
            }
        }
        return target;
    }

    function isHomologousLayer(layerA, layerB) {
        if (!layerA || !layerB) return false;
        if (layerA.id === layerB.id) return true;
        if (layerA.groupId && layerB.groupId && layerA.groupId === layerB.groupId) return true;
        
        let frameA = null, frameB = null;
        for (const f of state.frames) {
            if (f.layers.includes(layerA)) frameA = f;
            if (f.layers.includes(layerB)) frameB = f;
            if (frameA && frameB) break;
        }
        
        if (frameA && frameB) {
            const idxA = frameA.layers.indexOf(layerA);
            const idxB = frameB.layers.indexOf(layerB);
            return idxA === idxB && layerA.type === layerB.type;
        }
        
        return layerA.name === layerB.name && layerA.type === layerB.type;
    }

    function propagateLayerKeyframes(sourceLayer) {
        if (!sourceLayer) return;
        ensureLayerKeyframes(sourceLayer);
        const keyframesCopy = JSON.parse(JSON.stringify(sourceLayer.keyframes));
        state.frames.forEach((frame) => {
            const target = findLayerInFrame(frame, sourceLayer);
            if (target) target.keyframes = JSON.parse(JSON.stringify(keyframesCopy));
        });
    }

    function propagateLayerTransparencyRules(sourceLayer) {
        if (!sourceLayer) return;
        ensureLayerTransparencyRules(sourceLayer);
        const rulesCopy = sourceLayer.transparencyRules.map(r => ({ ...r }));
        state.frames.forEach((frame) => {
            const target = findLayerInFrame(frame, sourceLayer);
            if (target) {
                target.transparencyRules = rulesCopy.map(r => ({ ...r }));
                filterCache.delete(target.id);
            }
        });
        filterCache.delete(sourceLayer.id);
    }

    function updateTransparentPickStatus() {
        if (!dom.transparentPickStatus) return;
        if (state.lastPickedTransparencyCoords) {
            const c = state.lastPickedTransparencyCoords;
            dom.transparentPickStatus.style.display = "block";
            dom.transparentPickStatus.style.color = "var(--accent-color)";
            dom.transparentPickStatus.textContent =
                `Punto selezionato: ${Math.round(c.x)}, ${Math.round(c.y)} — clicca "Aggiungi Trasparenza"`;
        } else {
            dom.transparentPickStatus.style.display = "none";
            dom.transparentPickStatus.textContent = "";
        }
    }

    function clearTransparentPickStatus() {
        state.lastPickedTransparencyCoords = null;
        updateTransparentPickStatus();
    }

    function getTransparencyRuleDraft() {
        const typeVal = dom.bgTransparencyType ? dom.bgTransparencyType.value : "flood";
        const color = dom.bgTransparentColor ? dom.bgTransparentColor.value : "#ffffff";
        const tolerance = parseInt(dom.bgTransparentTolerance && dom.bgTransparentTolerance.value, 10);
        const rule = {
            type: typeVal,
            color,
            tolerance: Number.isFinite(tolerance) ? tolerance : 20
        };
        if (typeVal === "flood" && state.lastPickedTransparencyCoords) {
            rule.seedX = state.lastPickedTransparencyCoords.x;
            rule.seedY = state.lastPickedTransparencyCoords.y;
        }
        return rule;
    }

    function addTransparencyRuleFromUI() {
        const layer = getActiveLayer();
        if (!layer || layer.isReference || layer.locked) {
            alert("Seleziona un livello immagine modificabile.");
            return false;
        }

        const draft = getTransparencyRuleDraft();
        if (draft.type === "flood" && (draft.seedX == null || draft.seedY == null)) {
            alert("Per \"Area Unita\" usa la pipetta sulla tavola per scegliere il punto di partenza.");
            return false;
        }

        saveState();
        ensureLayerTransparencyRules(layer);
        layer.transparencyRules.push(draft);

        if (state.editScope === "global") {
            propagateLayerTransparencyRules(layer);
        } else {
            filterCache.delete(layer.id);
        }

        clearTransparentPickStatus();
        updateTransparencyRulesUI();
        requestRender();
        return true;
    }

    function getMainImageLayer(frame) {
        if (!frame) return null;
        return frame.layers.find(l => l.type === "image" && !l.isReference) || null;
    }

    function getReferenceLayer(frame) {
        if (!frame) return null;
        return frame.layers.find(l => l.isReference === true) || null;
    }

    function resolveKeyframeTargetLayer(targetType) {
        const frame = getActiveFrame();
        if (!frame) return null;
        if (targetType === "reference") return getReferenceLayer(frame);
        if (targetType === "main") return getMainImageLayer(frame);
        return getActiveLayer();
    }

    function getSortedKeyframeFrames(layer) {
        ensureLayerKeyframes(layer);
        return Object.keys(layer.keyframes).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    }

    function interpolateLayerTransform(layer, frameIndex) {
        ensureLayerKeyframes(layer);
        const keys = getSortedKeyframeFrames(layer);
        if (keys.length === 0) return null;

        const result = {};
        KEYFRAME_PROPS.forEach((prop) => {
            let prevF = null;
            let nextF = null;
            keys.forEach((k) => {
                const kf = layer.keyframes[k];
                if (!kf || kf[prop] === undefined) return;
                if (k <= frameIndex) prevF = k;
                if (k >= frameIndex && nextF === null) nextF = k;
            });
            if (prevF === null && nextF === null) return;
            if (prevF === null) result[prop] = layer.keyframes[nextF][prop];
            else if (nextF === null) result[prop] = layer.keyframes[prevF][prop];
            else if (prevF === nextF) result[prop] = layer.keyframes[prevF][prop];
            else {
                const t = (frameIndex - prevF) / (nextF - prevF);
                const a = layer.keyframes[prevF][prop];
                const b = layer.keyframes[nextF][prop];
                result[prop] = a + (b - a) * t;
            }
        });
        return Object.keys(result).length ? result : null;
    }

    function applyKeyframesForTimelineFrame(frameIndex) {
        const frame = state.frames[frameIndex];
        if (!frame) return;
        frame.layers.forEach((layer) => {
            const interp = interpolateLayerTransform(layer, frameIndex);
            if (!interp) return;
            Object.assign(layer, interp);
        });
        frame.layers.sort((a, b) => (a.z || 0) - (b.z || 0));
    }

    function frameHasAnyKeyframe(frameIndex) {
        const frame = state.frames[frameIndex];
        if (!frame) return false;
        return frame.layers.some((layer) => {
            ensureLayerKeyframes(layer);
            return layer.keyframes[frameIndex] !== undefined;
        });
    }

    function collectKeyframePropsFromLayer(layer) {
        const props = {};
        if (dom.kfPropX && dom.kfPropX.checked) props.x = layer.x;
        if (dom.kfPropY && dom.kfPropY.checked) props.y = layer.y;
        if (dom.kfPropZ && dom.kfPropZ.checked) props.z = layer.z;
        if (dom.kfPropR && dom.kfPropR.checked) props.r = layer.r;
        if (dom.kfPropOpacity && dom.kfPropOpacity.checked) props.opacity = layer.opacity;
        if (dom.kfPropW && dom.kfPropW.checked) props.w = layer.w;
        if (dom.kfPropH && dom.kfPropH.checked) props.h = layer.h;
        return props;
    }

    function addKeyframeAtCurrentFrame(layer) {
        if (!layer) return;
        const props = collectKeyframePropsFromLayer(layer);
        if (!Object.keys(props).length) {
            alert("Seleziona almeno un asse da registrare nel keyframe (X, Y, R, Opacità…).");
            return;
        }
        saveState();
        upsertKeyframeAtFrame(layer, state.activeFrameIndex, props);
        buildTimelineUI();
        requestRender();
    }

    function deleteKeyframeAtFrame(layer, frameIndex) {
        if (!layer) return false;
        ensureLayerKeyframes(layer);
        const fi = frameIndex !== undefined ? frameIndex : state.activeFrameIndex;
        if (!layer.keyframes[fi]) return false;
        saveState();
        delete layer.keyframes[fi];
        if (!Object.keys(layer.keyframes).length) layer.keyframes = {};
        propagateLayerKeyframes(layer);
        buildTimelineUI();
        applyKeyframesForTimelineFrame(state.activeFrameIndex);
        updateXYZControlsUI();
        requestRender();
        return true;
    }

    function deleteKeyframeAtCurrentFrame(layer) {
        deleteKeyframeAtFrame(layer, state.activeFrameIndex);
    }

    function upsertKeyframeAtFrame(layer, frameIndex, propsOverride) {
        if (!layer) return false;
        ensureLayerKeyframes(layer);
        const fi = frameIndex !== undefined ? frameIndex : state.activeFrameIndex;
        const props = propsOverride || collectKeyframePropsFromLayer(layer);
        if (!Object.keys(props).length) return false;
        if (!layer.keyframes[fi]) layer.keyframes[fi] = {};
        Object.assign(layer.keyframes[fi], props);
        propagateLayerKeyframes(layer);
        return true;
    }

    function toggleKeyframeAtFrame(layer, frameIndex) {
        if (!layer) return;
        ensureLayerKeyframes(layer);
        const fi = frameIndex !== undefined ? frameIndex : state.activeFrameIndex;
        if (layer.keyframes[fi]) {
            deleteKeyframeAtFrame(layer, fi);
        } else {
            saveState();
            upsertKeyframeAtFrame(layer, fi);
            buildTimelineUI();
            requestRender();
        }
    }

    function layerHasAnyKeyframes(layer) {
        if (!layer) return false;
        ensureLayerKeyframes(layer);
        return getSortedKeyframeFrames(layer).length > 0;
    }

    function gotoAdjacentKeyframe(direction) {
        const targetType = dom.keyframeTarget ? dom.keyframeTarget.value : "active";
        const layer = resolveKeyframeTargetLayer(targetType);
        if (!layer) {
            alert("Nessun livello disponibile per i keyframe.");
            return;
        }
        const keys = getSortedKeyframeFrames(layer);
        if (!keys.length) {
            alert("Nessun keyframe registrato su questo livello.");
            return;
        }
        const cur = state.activeFrameIndex;
        let target = null;
        if (direction < 0) {
            for (let i = keys.length - 1; i >= 0; i--) {
                if (keys[i] < cur) { target = keys[i]; break; }
            }
            if (target === null) target = keys[keys.length - 1];
        } else {
            for (let i = 0; i < keys.length; i++) {
                if (keys[i] > cur) { target = keys[i]; break; }
            }
            if (target === null) target = keys[0];
        }
        selectFrame(target);
    }

    function maybeAutoRecordKeyframe(layer) {
        if (!layer || !state.autoKeyframe) return;
        const fi = state.activeFrameIndex;
        if (!upsertKeyframeAtFrame(layer, fi)) return;
        buildTimelineUI();
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
                        gifFrames: l.gifFrames ? cloneGifFrameCanvases(l.gifFrames) : undefined,
                        keyframes: l.keyframes ? JSON.parse(JSON.stringify(l.keyframes)) : {},
                        transparencyRules: l.transparencyRules ? l.transparencyRules.map(r => ({ ...r })) : []
                    };
                })
            };
        });
    }

    function cloneGifFrameCanvases(gifFrames) {
        if (!gifFrames || !gifFrames.length) return [];
        return gifFrames.map((fc, idx) => {
            const c = document.createElement("canvas");
            c.width = fc.width;
            c.height = fc.height;
            c.getContext("2d").drawImage(fc, 0, 0);
            c.gifFrameIndex = fc.gifFrameIndex !== undefined ? fc.gifFrameIndex : idx;
            return c;
        });
    }

    function getFilterCacheKey(layer, sourceImg) {
        const replacementsHash = JSON.stringify(state.colorReplacements);
        const transparencyHash = layer.transparencyRules ? JSON.stringify(layer.transparencyRules) : "";
        const bgRemoveHash = layer.bgRemoveActive
            ? `bg_${layer.bgRemoveColor}_${layer.bgRemoveTolerance}_${layer.bgRemoveSeedX}_${layer.bgRemoveSeedY}`
            : "bg_none";
        
        let gifFramePart = "static";
        if (layer.gifFrames && layer.gifFrames.length > 0) {
            let idx = -1;
            if (sourceImg && sourceImg.gifFrameIndex !== undefined) {
                idx = sourceImg.gifFrameIndex;
            } else {
                idx = layer.gifFrames.indexOf(sourceImg);
            }
            
            if (idx !== -1) {
                gifFramePart = `gif_${idx}`;
            } else {
                gifFramePart = `gif_active_${state.activeFrameIndex % layer.gifFrames.length}`;
            }
        }
        
        const srcPart = sourceImg && sourceImg.width ? `_s${sourceImg.width}x${sourceImg.height}` : "";
        return `${layer.id}_${gifFramePart}${srcPart}_filters_${replacementsHash}_${transparencyHash}_${bgRemoveHash}`;
    }

    const TAB_DEFAULT_ORIGINS = {
        "tab-canvas-content": "win-canvas",
        "tab-project-file": "win-project",
        "tab-project-style": "win-project",
        "tab-project-layers": "win-project",
        "tab-prop-bg": "win-properties",
        "tab-tools-draw": "win-properties",
        "tab-prop-colors": "win-properties",
        "tab-prop-xyz": "win-properties",
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

    function applyDefaultTabLayout() {
        document.querySelectorAll(".tab-btn").forEach(tab => {
            const tabId = tab.getAttribute("data-tab");
            const origin = TAB_DEFAULT_ORIGINS[tabId] || tab.getAttribute("data-origin-win");
            if (!origin) return;
            tab.setAttribute("data-origin-win", origin);
            const originWin = document.getElementById(origin);
            const tabContent = document.getElementById(tabId);
            if (!originWin || !tabContent) return;
            const originHeader = originWin.querySelector(".window-tabs-header");
            const originContent = originWin.querySelector(".window-content");
            if (!originHeader || !originContent) return;
            if (!originWin.contains(tab)) {
                originHeader.appendChild(tab);
                originContent.appendChild(tabContent);
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
            fontSize: dom.uiFontSize ? dom.uiFontSize.value : "15",
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
        const ws = getWorkspaceMetrics();
        const layoutData = {};
        document.querySelectorAll(".window").forEach(win => {
            if (!win.id) return;
            layoutData[win.id] = normalizeWindowGeometry(readWindowGeometry(win), ws.w, ws.h);
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
        const ws = getWorkspaceMetrics();
        const width = parseInt(win.style.width, 10) || win.offsetWidth || 300;
        const height = parseInt(win.style.height, 10) || win.offsetHeight || 200;
        let left = parseInt(win.style.left, 10) || 0;
        let top = parseInt(win.style.top, 10) || 0;

        left = Math.max(-width + 120, Math.min(left, ws.w - 120));

        const minH = win.id === "win-timeline" ? 100 : 40;
        const h = Math.max(minH, Math.min(height, ws.h - ws.gap));
        win.style.height = `${h}px`;
        top = Math.max(ws.gap, Math.min(top, ws.h - h - ws.gap));

        win.style.left = `${left}px`;
        win.style.top = `${top}px`;
    }

    function clampDragPosition(win, newLeft, newTop) {
        const ws = getWorkspaceMetrics();
        const width = parseInt(win.style.width, 10) || win.offsetWidth || 300;
        const height = parseInt(win.style.height, 10) || win.offsetHeight || 200;
        const left = Math.max(-width + 120, Math.min(newLeft, ws.w - 120));
        const top = Math.max(ws.gap, Math.min(newTop, ws.h - height - ws.gap));
        return { left, top };
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
        const ws = getWorkspaceMetrics();
        const payload = {
            version: 4,
            ui: collectUiPreferences(),
            layout: collectWindowLayout(),
            screen: { w: ws.w, h: ws.h },
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
            localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(payload.layout));
            localStorage.setItem(LAYOUT_SCREEN_KEY, JSON.stringify(payload.screen));
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
        if (typeof applyCustomColors === "function") applyCustomColors();
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

        const requiredIds = ["win-project", "win-properties", "win-canvas"];
        if (!requiredIds.every(id => layoutData.hasOwnProperty(id))) {
            arrangeWindowsDefault();
            forceTimelineLayout();
            return;
        }

        const ws = getWorkspaceMetrics();

        if (referenceScreen && (referenceScreen.w < 600 || referenceScreen.h < 400)) {
            console.warn("Screen reference too small in saved layout, resetting to default layout");
            arrangeWindowsDefault();
            forceTimelineLayout();
            return;
        }

        for (const [id, val] of Object.entries(layoutData)) {
            if (id === "win-timeline") continue;
            if (val) {
                const w = val.width !== undefined ? val.width : (val.widthRatio ? val.widthRatio * ws.w : 0);
                const h = val.height !== undefined ? val.height : (val.heightRatio ? val.heightRatio * ws.h : 0);
                if (w < 50 || h < 50) {
                    console.warn(`Saved window layout for ${id} is too small (${w}x${h}), resetting to default layout`);
                    arrangeWindowsDefault();
                    forceTimelineLayout();
                    return;
                }
            }
        }

        const refW = (referenceScreen && referenceScreen.w) || ws.w;
        const refH = (referenceScreen && referenceScreen.h) || ws.h;
        const useRefH = (refH > ws.h + 40) ? ws.h : refH;
        const useRefW = refW;

        for (const [id, val] of Object.entries(layoutData)) {
            const win = document.getElementById(id);
            if (!win) continue;

            let stored = val;
            if (stored.leftRatio === undefined) {
                stored = normalizeWindowGeometry(stored, useRefW, useRefH);
            }

            const geometry = denormalizeWindowGeometry(stored, ws.w, ws.h);
            if (id === "win-timeline") {
                geometry.visible = true;
                geometry.isMinimized = false;
            }
            applyGeometryToWindow(win, geometry);
            clampWindowToViewport(win);
        }
        applyDefaultTabLayout();
        repairTimelineWindow();
        ensureCoreWindowsVisible();
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
                fw.tabs = fw.tabs.filter(tabId => !TIMELINE_TAB_IDS.includes(tabId));
                if (!fw.tabs.length) return;

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
                if (TIMELINE_TAB_IDS.includes(a.tabId)) a.windowId = "win-timeline";
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
            repairTimelineWindow();
            if (typeof window.updateDynamicUI === "function") window.updateDynamicUI();
        } catch (e) {
            console.warn("Layout schede non ripristinato:", e);
            repairTimelineWindow();
        }
    }

    function buildPayloadFromLocalStorage() {
        try {
            const ui = localStorage.getItem("gifstudio_ui_prefs_v1");
            const layout = localStorage.getItem(LAYOUT_STORAGE_KEY);
            const screen = localStorage.getItem(LAYOUT_SCREEN_KEY);
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

        repairTimelineWindow();

        if (payload.layout) {
            applySavedWindowLayout(payload.layout, payload.screen);
        } else {
            arrangeWindowsDefault();
        }

        repairTimelineWindow();
        ensureCoreWindowsVisible();

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

        if ((payload.version || 0) < 4) {
            payload.layout = null;
        }

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
            const isActive = content.id === tabId;
            content.classList.toggle("active-content", isActive);
            content.style.display = isActive ? "" : "none";
        });
    }

    const CORE_WINDOW_IDS = ["win-project", "win-properties", "win-canvas", "win-timeline"];

    function ensureCoreWindowsVisible() {
        CORE_WINDOW_IDS.forEach((id) => {
            const win = document.getElementById(id);
            if (!win) return;
            win.style.display = "flex";
            win.classList.remove("minimized-window");
            const minBtn = win.querySelector(".win-minimize");
            if (minBtn) minBtn.innerHTML = "&#8722;";
            const btn = document.querySelector(`.launcher-btn[data-target="${id}"]`);
            if (btn) btn.classList.add("active-launcher");
        });
    }

    function repairTimelineWindow() {
        const win = document.getElementById("win-timeline");
        if (!win) return;

        win.style.display = "flex";
        win.style.visibility = "visible";
        win.classList.remove("minimized-window");
        const minBtn = win.querySelector(".win-minimize");
        if (minBtn) minBtn.innerHTML = "&#8722;";

        const header = win.querySelector(".window-tabs-header");
        const content = win.querySelector(".window-content");
        if (!header || !content) return;

        TIMELINE_TAB_IDS.forEach((tabId) => {
            const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
            const tabPanel = document.getElementById(tabId);
            if (tabBtn && !header.contains(tabBtn)) header.appendChild(tabBtn);
            if (tabPanel && !content.contains(tabPanel)) content.appendChild(tabPanel);
        });

        const seqBtn = header.querySelector('.tab-btn[data-tab="tab-timeline-content"]');
        if (seqBtn) header.insertBefore(seqBtn, header.firstChild);

        let activeTab = header.querySelector(".tab-btn.active");
        if (!activeTab || !TIMELINE_TAB_IDS.includes(activeTab.getAttribute("data-tab"))) {
            activeTab = seqBtn || header.querySelector(".tab-btn");
        }
        if (activeTab) activateTabInWindow(activeTab, win);

        const seqPanel = document.getElementById("tab-timeline-content");
        if (seqPanel) {
            seqPanel.classList.add("active-content");
            seqPanel.style.display = "";
        }
    }

    function forceTimelineLayout() {
        applyTimelineDockLayout(null, { rebuildFrames: true });
        const launcherBtn = document.querySelector('.launcher-btn[data-target="win-timeline"]');
        if (launcherBtn) launcherBtn.classList.add("active-launcher");
    }

    function syncAnimatedReferenceToAllFrames(layerId, gifFrames, meta) {
        if (!layerId || !gifFrames || !gifFrames.length) return;

        if (gifFrames.length > state.frames.length) {
            const framesToAdd = gifFrames.length - state.frames.length;
            const lastFrame = state.frames[state.frames.length - 1];
            for (let i = 0; i < framesToAdd; i++) {
                const clonedLayers = lastFrame.layers.map(l => {
                    const imgCopy = l.img ? new Image() : null;
                    if (imgCopy) imgCopy.src = l.img.src;
                    
                    let drawCopy = null;
                    if (l.drawingCanvas) {
                        drawCopy = createDrawingCanvasForLayer(l.w, l.h);
                        drawCopy.getContext("2d").drawImage(l.drawingCanvas, 0, 0);
                    }

                    return {
                        ...l,
                        id: l.isReference ? l.id : generateId(),
                        img: imgCopy,
                        drawingCanvas: drawCopy,
                        keyframes: l.keyframes ? JSON.parse(JSON.stringify(l.keyframes)) : {},
                        transparencyRules: l.transparencyRules ? l.transparencyRules.map(r => ({ ...r })) : []
                    };
                });
                state.frames.push({
                    id: generateId(),
                    delay: lastFrame.delay || 100,
                    layers: clonedLayers
                });
            }
        }

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
        buildTimelineUI();
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
                    } else if (key === "keyframes" && value && typeof value === "object") {
                        targetLayer[key] = JSON.parse(JSON.stringify(value));
                    } else if (key === "transparencyRules" && Array.isArray(value)) {
                        targetLayer[key] = value.map(r => ({ ...r }));
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
                savedCanvas.gifFrameIndex = idx;

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
            activeLayerId: state.activeLayerId,
            colorReplacements: JSON.parse(JSON.stringify(state.colorReplacements || []))
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
            activeLayerId: state.activeLayerId,
            colorReplacements: JSON.parse(JSON.stringify(state.colorReplacements || []))
        });

        const prevState = state.undoStack.pop();
        state.frames = prevState.frames;
        state.activeFrameIndex = prevState.activeFrameIndex;
        state.activeLayerId = prevState.activeLayerId;
        state.colorReplacements = prevState.colorReplacements || [];

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
            activeLayerId: state.activeLayerId,
            colorReplacements: JSON.parse(JSON.stringify(state.colorReplacements || []))
        });

        const nextState = state.redoStack.pop();
        state.frames = nextState.frames;
        state.activeFrameIndex = nextState.activeFrameIndex;
        state.activeLayerId = nextState.activeLayerId;
        state.colorReplacements = nextState.colorReplacements || [];

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

    function applyTransparencyRuleToImageData(data, width, height, rule) {
        const targetRgb = hexToRgb(rule.color || "#ffffff");
        const maxDist = (rule.tolerance !== undefined ? rule.tolerance : 20) * 1.73205;

        // Se il tipo è 'global' (Intero Livello), esegui la rimozione selettiva globale pixel-by-pixel
        if (rule.type === "global") {
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] === 0) continue;
                const dr = data[i] - targetRgb.r;
                const dg = data[i + 1] - targetRgb.g;
                const db = data[i + 2] - targetRgb.b;
                if (Math.sqrt(dr * dr + dg * dg + db * db) <= maxDist) {
                    data[i + 3] = 0; // Trasparente
                }
            }
            return;
        }

        // Altrimenti esegui il Flood Fill connesso ('flood' o default)
        if (rule.seedX == null || rule.seedY == null || rule.seedX === undefined) return;

        const visited = new Uint8Array(width * height);
        const queue = [];
        const startX = Math.round(rule.seedX);
        const startY = Math.round(rule.seedY);

        function matchesColor(idx) {
            if (data[idx + 3] === 0) return false;
            const dr = data[idx] - targetRgb.r;
            const dg = data[idx + 1] - targetRgb.g;
            const db = data[idx + 2] - targetRgb.b;
            return Math.sqrt(dr * dr + dg * dg + db * db) <= maxDist;
        }

        if (startX >= 0 && startX < width && startY >= 0 && startY < height) {
            const startPos = startY * width + startX;
            const idx = startPos * 4;
            if (matchesColor(idx)) {
                visited[startPos] = 1;
                queue.push(startPos);
                data[idx + 3] = 0;
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
                        const nIdx = nPos * 4;
                        if (matchesColor(nIdx)) {
                            visited[nPos] = 1;
                            data[nIdx + 3] = 0;
                            queue.push(nPos);
                        }
                    }
                }
            }
        }
    }

    function updateTransparencyRulesUI() {
        if (!dom.transparencyRulesListBox) return;
        const layer = getActiveLayer();
        dom.transparencyRulesListBox.innerHTML = "";
        updateTransparentPickStatus();

        if (!layer || layer.isReference || layer.locked) {
            clearTransparentPickStatus();
            dom.transparencyRulesListBox.innerHTML = `<div class="layer-warning">Seleziona un livello immagine modificabile.</div>`;
            return;
        }

        ensureLayerTransparencyRules(layer);
        if (!layer.transparencyRules.length) {
            dom.transparencyRulesListBox.innerHTML = `<div class="layer-warning">Nessuna regola trasparenza su questo livello.</div>`;
            return;
        }

        layer.transparencyRules.forEach((rule, idx) => {
            const item = document.createElement("div");
            item.className = "replacement-item transparency-rule-item";
            const swatch = `<span class="replacement-color-swatch" style="background-color:${rule.color};" title="${rule.color}"></span>`;
            
            // Badge premium per il tipo di trasparenza
            const typeLabel = rule.type === "global" ? "Intero Livello" : "Area Unita";
            const typeBadge = `<span class="replacement-tolerance ui-field-label" style="background:rgba(255,255,255,0.1); border-radius:4px; padding:2px 6px; margin-right:4px;">${typeLabel}</span>`;
            
            item.innerHTML = `
                <div class="replacement-colors">${swatch} <span class="replacement-color-arrow">&rarr;</span> <span class="ui-inline-label">trasparente</span></div>
                <div class="replacement-details">
                    ${typeBadge}
                    <span class="replacement-tolerance">Toll: ${rule.tolerance}</span>
                    <span class="ui-inline-label" style="opacity:0.85;">@${Math.round(rule.seedX)},${Math.round(rule.seedY)}</span>
                </div>
                <button type="button" class="replacement-btn-delete" data-index="${idx}" title="Elimina regola">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button>
            `;
            item.querySelector(".replacement-btn-delete").addEventListener("click", () => {
                saveState();
                layer.transparencyRules.splice(idx, 1);
                
                // Se lo scope è globale propaghiamo l'eliminazione a tutti i frame
                if (state.editScope === "global") {
                    propagateLayerTransparencyRules(layer);
                } else {
                    filterCache.delete(layer.id);
                }
                
                updateTransparencyRulesUI();
                requestRender();
            });
            dom.transparencyRulesListBox.appendChild(item);
        });
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
        if (winId === "win-timeline" && !isMin) {
            setTimeout(() => clampWindowToViewport(win), 0);
        }
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
                    const deltaX = moveEvent.clientX - startX;
                    const deltaY = moveEvent.clientY - startY;
                    const pos = clampDragPosition(win, startLeft + deltaX, startTop + deltaY);

                    win.style.left = `${pos.left}px`;
                    win.style.top = `${pos.top}px`;

                    if (state.windows[winId]) {
                        state.windows[winId].left = pos.left;
                        state.windows[winId].top = pos.top;
                    }
                }

                function onMouseUp() {
                    win.classList.remove("dragging");
                    document.removeEventListener("mousemove", onMouseMove);
                    document.removeEventListener("mouseup", onMouseUp);
                    clampWindowToViewport(win);
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
                    clampWindowToViewport(win);
                    saveLayoutToLocalStorage();
                    if (win.id === "win-canvas") {
                        setTimeout(centerCanvas, 30);
                    }
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
        "win-project": `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2"/></svg>`,
        "win-canvas": `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M16 4v16M4 8h16M4 16h16"/></svg>`,
        "win-properties": `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/></svg>`,
        "win-timeline": `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16"/><path d="M16 4v16"/><path d="M3 10h18"/></svg>`
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
                const svgIcon = windowIconsMap[firstOrigin] || windowIconsMap["win-properties"];
                
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

        dom.btnDefaultLayout.addEventListener("click", () => {
            // 1. Pulisce la memoria locale
            localStorage.removeItem("gifstudio_tab_layout_v1");
            localStorage.removeItem(LAYOUT_STORAGE_KEY);
            localStorage.removeItem(LAYOUT_SCREEN_KEY);
            
            // 2. Riassegna tutti i tab alle loro finestre di default a "caldo"
            document.querySelectorAll(".tab-btn").forEach(tab => {
                const tabId = tab.getAttribute("data-tab");
                const desiredOrigin = TAB_DEFAULT_ORIGINS[tabId];
                if (!desiredOrigin) return;
                
                tab.setAttribute("data-origin-win", desiredOrigin);
                const originWin = document.getElementById(desiredOrigin);
                const tabContent = document.getElementById(tabId);
                
                if (originWin && tabContent) {
                    const originHeader = originWin.querySelector(".window-tabs-header");
                    const originContent = originWin.querySelector(".window-content");
                    
                    if (originHeader && originContent) {
                        tab.classList.remove("active");
                        tabContent.classList.remove("active-content");
                        originHeader.appendChild(tab);
                        originContent.appendChild(tabContent);
                    }
                }
            });

            // 3. Riattiva correttamente il primo tab di ogni finestra
            document.querySelectorAll(".window").forEach(win => {
                const tabs = win.querySelectorAll(".tab-btn");
                if (tabs.length > 0) {
                    const firstTab = tabs[0];
                    firstTab.classList.add("active");
                    const firstContent = document.getElementById(firstTab.getAttribute("data-tab"));
                    if (firstContent) {
                        firstContent.classList.add("active-content");
                    }
                }
            });

            // 4. Elimina finestre fluttuanti (se esistono)
            document.querySelectorAll(".window.floating-window").forEach(win => {
                win.remove();
            });

            // 5. Algoritmo Posizione di Default (Estetica e grandezze forzate matematicamente)
            const ws = getWorkspaceMetrics();
            const gap = ws.gap;
            const projectW = 400;
            const propsW = 680;
            
            const fullH = ws.h - gap * 2;
            const timelineH = Math.max(200, Math.min(320, Math.round(fullH * 0.32)));
            const topH = fullH - timelineH - gap;

            const projectX = gap;
            const canvasX = projectX + projectW + gap;
            const propsX = ws.w - propsW - gap;
            const canvasW = Math.max(400, propsX - canvasX - gap);
            
            const timelineX = gap;
            const timelineW = canvasX + canvasW - gap; // Si ferma ESATTAMENTE al gap prima delle proprieta

            const defaultLayout = {
                "win-project": { top: gap, left: projectX, width: projectW, height: topH },
                "win-canvas": { top: gap, left: canvasX, width: canvasW, height: topH },
                "win-properties": { top: gap, left: propsX, width: propsW, height: fullH },
                "win-timeline": { top: gap + topH + gap, left: timelineX, width: timelineW, height: timelineH }
            };

            for (const [id, val] of Object.entries(defaultLayout)) {
                const win = document.getElementById(id);
                if (!win) continue;
                
                win.style.display = "flex";
                win.style.visibility = "visible";
                win.classList.remove("minimized-window");
                win.style.top = val.top + "px";
                win.style.left = val.left + "px";
                win.style.width = val.width + "px";
                win.style.height = val.height + "px";
                
                const minBtn = win.querySelector(".win-minimize");
                if (minBtn) minBtn.innerHTML = "&#8722;";
                
                const launcherBtn = document.querySelector(`.launcher-btn[data-target="${id}"]`);
                if (launcherBtn) launcherBtn.classList.add("active-launcher");
            }
            
            ensureCoreWindowsVisible();
            setupTabHandlers();
            
            if (typeof window.updateDynamicUI === "function") window.updateDynamicUI();
            layoutRestoreComplete = true;
            lastKnownScreen = { w: window.innerWidth, h: window.innerHeight };
            
            saveLayoutToLocalStorage();
            setTimeout(centerCanvas, 150);
        });
    }

    // ======================================================================
    // 5. DISPOSIZIONE AUTOMATICA INTELLIGENTE ED EVITAMENTO ACCAVALLAMENTI
    // ======================================================================
    function adaptLayoutToScreenSize(prevW, prevH, currentW, currentH, force = false) {
        if (!prevW || !prevH || !currentW || !currentH) return;
        if (!force && prevW === currentW && prevH === currentH) return;

        const ws = getWorkspaceMetrics();
        const gap = ws.gap;
        const requiredIds = ["win-project", "win-properties", "win-canvas", "win-timeline"];

        const defLayout = computeDefaultWindowLayout(ws);

        requiredIds.forEach(id => {
            const win = document.getElementById(id);
            if (!win) return;

            const def = defLayout[id];
            let left = def ? def.left : Math.round((parseInt(win.style.left) || 0) * (currentW / prevW));
            let top = def ? def.top : Math.round((parseInt(win.style.top) || 0) * (ws.h / prevH));
            let width = def ? def.width : Math.round((parseInt(win.style.width) || win.offsetWidth) * (currentW / prevW));
            let height = def ? def.height : Math.round((parseInt(win.style.height) || win.offsetHeight) * (ws.h / prevH));

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
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutData));
        localStorage.setItem(LAYOUT_SCREEN_KEY, JSON.stringify({ w: ws.w, h: ws.h }));
    }

    /** Layout predefinito: 4 finestre (progetto / tavola / proprietà / timeline). */
    function computeDefaultWindowLayout(ws) {
        const gap = ws.gap;
        const fullH = Math.max(240, ws.h - gap * 2);

        let timelineH = Math.round(fullH * 0.32);
        timelineH = Math.max(200, Math.min(320, timelineH));
        let topSectionH = fullH - timelineH - gap;

        const colProject_W = Math.max(340, Math.min(480, 400));
        const colProperties_W = Math.max(500, Math.min(800, 680));
        const left_canvas = gap + colProject_W + gap;
        const right_props = ws.w - colProperties_W - gap;
        const canvas_W = Math.max(400, right_props - left_canvas - gap);
        const timeline_W = ws.w - colProperties_W - gap * 3;

        return {
            "win-project": {
                top: gap,
                left: gap,
                width: colProject_W,
                height: topSectionH,
                visible: true,
                isMinimized: false
            },
            "win-properties": {
                top: gap,
                left: right_props,
                width: colProperties_W,
                height: fullH,
                visible: true,
                isMinimized: false
            },
            "win-canvas": {
                top: gap,
                left: left_canvas,
                width: canvas_W,
                height: topSectionH,
                visible: true,
                isMinimized: false
            },
            "win-timeline": {
                top: gap + topSectionH + gap,
                left: gap,
                width: timeline_W,
                height: timelineH,
                visible: true,
                isMinimized: false
            }
        };
    }

    function arrangeWindowsDefault() {
        const ws = getWorkspaceMetrics();
        applyDefaultTabLayout();
        const defaults = computeDefaultWindowLayout(ws);

        for (const [id, val] of Object.entries(defaults)) {
            const win = document.getElementById(id);
            if (win) {
                win.style.top = val.top + "px";
                win.style.left = val.left + "px";
                win.style.width = val.width + "px";
                win.style.height = val.height + "px";
                win.style.display = val.visible ? "flex" : "none";
                win.classList.remove("minimized-window");
                clampWindowToViewport(win);

                const minBtn = win.querySelector(".win-minimize");
                if (minBtn) minBtn.innerHTML = "&#8722;";

                const btn = document.querySelector(`.launcher-btn[data-target="${id}"]`);
                if (btn) {
                    btn.classList.toggle("active-launcher", val.visible);
                }

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
        repairTimelineWindow();
        saveLayoutToLocalStorage();
        setTimeout(centerCanvas, 30);
    }

    // ======================================================================
    // 6. SALVATAGGIO E CARICAMENTO AUTOMATICO (LOCALSTORAGE)
    // ======================================================================
    function saveLayoutToLocalStorage() {
        scheduleSaveAllAppPreferences();
    }

    function loadLayoutFromLocalStorage() {
        const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (!saved) {
            arrangeWindowsDefault();
            return;
        }
        try {
            const layoutData = JSON.parse(saved);
            let screen = null;
            const savedScreenStr = localStorage.getItem(LAYOUT_SCREEN_KEY);
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

        const winCanvas = document.getElementById("win-canvas");
        if (winCanvas && typeof ResizeObserver !== "undefined") {
            let t = null;
            const ro = new ResizeObserver(() => {
                clearTimeout(t);
                t = setTimeout(() => centerCanvas(), 60);
            });
            ro.observe(winCanvas);
        }
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
        const target = document.getElementById("canvas-border-shadow") || dom.mainCanvas;
        
        if (!container || !target) return;
        
        // Ottieni i rettangoli dei contenitori con refresh delle metriche
        const containerW = container.clientWidth || 600;
        const containerH = container.clientHeight || 400;
        const scrollW = container.scrollWidth;
        const scrollH = container.scrollHeight;
        
        // Calcola i centri rispetto al viewport dinamicamente
        const scrollLeftTarget = Math.max(0, (scrollW - containerW) / 2);
        const scrollTopTarget = Math.max(0, (scrollH - containerH) / 2);
        
        // Applica lo scroll con easing dinamico
        if (container.scrollLeft !== scrollLeftTarget) {
            container.scrollLeft = scrollLeftTarget;
        }
        if (container.scrollTop !== scrollTopTarget) {
            container.scrollTop = scrollTopTarget;
        }
    }

    // Calcola lo zoom ottimale per inserire perfettamente il canvas all'interno del contenitore visibile
    function autoZoomToFit(w, h) {
        if (state.autoAdaptGrid === false) {
            adjustZoom(state.zoom);
            setTimeout(centerCanvas, 10);
            return;
        }
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

        if (!layerObj.groupId) {
            layerObj.groupId = generateId();
        }

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
                thumbContent = `<span class="ui-field-label">Scritta</span>`;
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
                buildTimelineUI();
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
        ensureLayerTransparencyRules(layer);
        clearTransparentPickStatus();
        updateTransparencyRulesUI();

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

        syncCurrentFrameKeyframeFromLayer(layer);
        filterCache.delete(layer.id);
        requestRender();
    }

    function syncCurrentFrameKeyframeFromLayer(layer) {
        if (!layer) return;
        ensureLayerKeyframes(layer);
        const fi = state.activeFrameIndex;
        if (layer.keyframes[fi]) {
            KEYFRAME_PROPS.forEach((prop) => {
                if (layer.keyframes[fi][prop] !== undefined) {
                    layer.keyframes[fi][prop] = layer[prop];
                }
            });
            propagateLayerKeyframes(layer);
            buildTimelineUI();
        } else if (state.autoKeyframe) {
            maybeAutoRecordKeyframe(layer);
        }
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
        const activeReplacements = (state.colorReplacements || []).filter(rep => {
            if (rep.scope === "frame" && rep.targetLayerId && rep.targetLayerId !== layer.id) {
                return false;
            }
            if (rep.scope === "global" && rep.targetLayerId) {
                let sourceLayer = null;
                for (const f of state.frames) {
                    sourceLayer = f.layers.find(l => l.id === rep.targetLayerId);
                    if (sourceLayer) break;
                }
                if (sourceLayer && !isHomologousLayer(layer, sourceLayer)) {
                    return false;
                }
            }
            return true;
        });
        const hasReplacements = activeReplacements.length > 0;
        const hasBgRemove = !!layer.bgRemoveActive;
        const hasTransparencyRules = layer.transparencyRules && layer.transparencyRules.length > 0;
        
        if (!hasReplacements && !hasBgRemove && !hasTransparencyRules) {
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
        const replacements = activeReplacements.map(rep => {
            return {
                type: rep.type,
                fromRgb: hexToRgb(rep.from),
                toRgb: hexToRgb(rep.to),
                tolerance: rep.tolerance !== undefined ? rep.tolerance : 20,
                makeTransparent: !!rep.transparent,
                seedX: rep.seedX,
                seedY: rep.seedY
            };
        });

        if (hasTransparencyRules) {
            layer.transparencyRules.forEach((rule) => {
                applyTransparencyRuleToImageData(data, width, height, rule);
            });
        }



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
        if (window.updateDebugPanelUI) window.updateDebugPanelUI();
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

            // Disegna maschera di protezione (visiva)
            if (layer.protectionMask) {
                ctx.save();
                ctx.globalAlpha = 0.4;
                ctx.drawImage(layer.protectionMask, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
                ctx.restore();
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
        let gridSize = 20;
        if (minDim <= 64) gridSize = 10;
        else if (minDim >= 1000) gridSize = 40;
        
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
    function initAdvancedToolsEvents() {
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
                const renderSource = typeof applyGlobalFilters === "function" ? applyGlobalFilters(layer, layer.canvasImage || layer.img) : (layer.canvasImage || layer.img);
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
                groupId: generateId(),
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

            const frame = state.frames[state.activeFrameIndex];
            if (frame) {
                frame.layers.push(newLayer);
            }
            state.lasso.hasSelection = false;
            state.lasso.points = [];
            state.activeLayerId = newLayer.id;
            requestRender();
            if (typeof renderLayers === "function") renderLayers();
            updateLayersListUI();
        });

        dom.btnLassoClear.addEventListener("click", () => {
            if (!state.lasso.hasSelection || state.lasso.points.length < 3) return;
            const layer = getActiveLayer();
            if (!layer || layer.locked) return;
            saveState();

            if (layer.canvasImage || layer.img) {
                const renderSource = typeof applyGlobalFilters === "function" ? applyGlobalFilters(layer, layer.canvasImage || layer.img) : (layer.canvasImage || layer.img);
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
        });
    }

    function initDrawingTools() {
        const tools = [
            { btn: dom.drawSelect, name: "select" },
            { btn: dom.drawBrush, name: "brush" },
            { btn: dom.drawEraser, name: "eraser" },
            { btn: dom.drawPicker, name: "picker" },
            { btn: dom.drawMagicWand, name: "magic_wand" },
            { btn: dom.drawToolShapes, name: "shapes" },
            { btn: dom.drawToolLasso, name: "lasso" }
        ];

        tools.forEach(t => {
            t.btn.addEventListener("click", () => {
                tools.forEach(o => o.btn.classList.remove("active"));
                t.btn.classList.add("active");
                state.activeTool = t.name;
                
                // Nascondi tutti i gruppi di opzioni
                if (dom.brushSettings) dom.brushSettings.style.display = "none";
                if (dom.eraserModeGroup) dom.eraserModeGroup.style.display = "none";
                if (dom.magicWandSettingsGroup) dom.magicWandSettingsGroup.style.display = "none";
                if (dom.shapesSettingsGroup) dom.shapesSettingsGroup.style.display = "none";
                if (dom.lassoSettingsGroup) dom.lassoSettingsGroup.style.display = "none";

                // Mostra quello corretto in base allo strumento
                if (t.name === "brush" || t.name === "eraser") {
                    if (dom.brushSettings) dom.brushSettings.style.display = "block";
                }
                if (t.name === "eraser") {
                    if (dom.eraserModeGroup) dom.eraserModeGroup.style.display = "block";
                }
                if (t.name === "magic_wand") {
                    if (dom.magicWandSettingsGroup) dom.magicWandSettingsGroup.style.display = "block";
                }
                if (t.name === "shapes") {
                    if (dom.shapesSettingsGroup) dom.shapesSettingsGroup.style.display = "block";
                }
                if (t.name === "lasso") {
                    if (dom.lassoSettingsGroup) dom.lassoSettingsGroup.style.display = "block";
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

        dom.magicWandTolerance.addEventListener("input", (e) => {
            state.magicWandTolerance = parseInt(e.target.value);
            dom.magicWandToleranceText.innerText = `${state.magicWandTolerance}%`;
        });

        dom.btnRemoveProtectionMask.addEventListener("click", () => {
            state.frames.forEach(f => f.layers.forEach(l => l.protectionMask = null));
            requestRender();
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
        if (dom.btnPickTransparentColor) {
            dom.btnPickTransparentColor.addEventListener("click", () => activatePipette("bg-transparent-pick", dom.btnPickTransparentColor));
        }
        if (dom.btnPickBgRemoveColor) {
            dom.btnPickBgRemoveColor.addEventListener("click", () => activatePipette("bg-remove", dom.btnPickBgRemoveColor));
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
            selectTool.onMouseMove(coords, layer, requestRender);
            return;
        }

        if (state.activeTool === "magic_wand") {
            const localCoords = mapGlobalToLayerCoords(coords.x, coords.y, layer);
            saveState();
            magicWandTool.onMouseDown(localCoords, layer);
            return;
        }

        if (state.activeTool === "shapes") {
            state.shapes.isDrawing = true;
            state.shapes.startX = coords.x;
            state.shapes.startY = coords.y;
            state.shapes.currentX = coords.x;
            state.shapes.currentY = coords.y;
            shapesTool.onMouseDown(coords);
            return;
        }
        if (state.activeTool === "lasso") {
            lassoTool.onMouseDown(coords);
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
                if (state.activeTool === "shapes" && state.shapes.isDrawing) {
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
        }

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
        brushTool.onMouseUp();
        eraserTool.onMouseUp();
        selectTool.onMouseUp();
        if (state.activeTool === "shapes" && state.shapes.isDrawing) {
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
                name: `Forma (${state.shapes.type})`
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
        }
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

    function floodFillMask(ctx, startX, startY, width, height, tolerance) {
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = width;
        maskCanvas.height = height;
        const maskCtx = maskCanvas.getContext("2d");
        const maskData = maskCtx.createImageData(width, height);
        const mData = maskData.data;

        startX = Math.floor(startX);
        startY = Math.floor(startY);
        if (startX < 0 || startX >= width || startY < 0 || startY >= height) return maskCanvas;

        const startPos = (startY * width + startX) * 4;
        const startR = data[startPos];
        const startG = data[startPos+1];
        const startB = data[startPos+2];
        const startA = data[startPos+3];

        if (startA === 0) return maskCanvas; // Nessun pixel da proteggere

        const maxDiff = (tolerance / 100) * 765; 

        function colorMatch(pos) {
            const r = data[pos];
            const g = data[pos+1];
            const b = data[pos+2];
            const a = data[pos+3];
            if (a === 0) return false;
            return (Math.abs(r - startR) + Math.abs(g - startG) + Math.abs(b - startB)) <= maxDiff;
        }

        const stack = [startX, startY];
        const visited = new Uint8Array(width * height);

        while (stack.length > 0) {
            const y = stack.pop();
            const x = stack.pop();
            let lx = x;

            while (lx >= 0 && colorMatch((y * width + lx) * 4) && !visited[y * width + lx]) {
                lx--;
            }
            lx++;
            
            let spanAbove = false;
            let spanBelow = false;

            while (lx < width && colorMatch((y * width + lx) * 4) && !visited[y * width + lx]) {
                const idx = y * width + lx;
                const pos = idx * 4;
                
                visited[idx] = 1;
                mData[pos] = 255;
                mData[pos+1] = 0;
                mData[pos+2] = 0;
                mData[pos+3] = 255; // Maschera protettiva rossa solida

                if (y > 0) {
                    if (colorMatch(((y - 1) * width + lx) * 4) && !visited[(y - 1) * width + lx]) {
                        if (!spanAbove) {
                            stack.push(lx, y - 1);
                            spanAbove = true;
                        }
                    } else if (spanAbove) {
                        spanAbove = false;
                    }
                }
                if (y < height - 1) {
                    if (colorMatch(((y + 1) * width + lx) * 4) && !visited[(y + 1) * width + lx]) {
                        if (!spanBelow) {
                            stack.push(lx, y + 1);
                            spanBelow = true;
                        }
                    } else if (spanBelow) {
                        spanBelow = false;
                    }
                }
                lx++;
            }
        }
        
        maskCtx.putImageData(maskData, 0, 0);
        return maskCanvas;
    }

    function applyMagicWand(layer, localX, localY, isPropagation = false) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = layer.w;
        tempCanvas.height = layer.h;
        const tCtx = tempCanvas.getContext("2d");
        
        if (layer.type === "image" && layer.img) {
            if (layer.canvasImage) {
                tCtx.drawImage(layer.canvasImage, 0, 0, layer.w, layer.h);
            } else {
                tCtx.drawImage(layer.img, 0, 0, layer.w, layer.h);
            }
        }
        if (layer.drawingCanvas) {
            tCtx.drawImage(layer.drawingCanvas, 0, 0, layer.w, layer.h);
        }

        const newMask = floodFillMask(tCtx, localX, localY, layer.w, layer.h, state.magicWandTolerance);
        if (layer.protectionMask) {
            const mCtx = layer.protectionMask.getContext("2d");
            mCtx.drawImage(newMask, 0, 0);
        } else {
            layer.protectionMask = newMask;
        }

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
                    applyMagicWand(targetLayer, localX, localY, true);
                }
            });
        }
        requestRender();
    }

    function drawPoint(x, y, layer, isPropagation = false) {
        let tempCanvas = null, tCtx = null;
        if (layer.protectionMask) {
            tempCanvas = document.createElement("canvas");
            tempCanvas.width = layer.w;
            tempCanvas.height = layer.h;
            tCtx = tempCanvas.getContext("2d");
        }

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

                if (tempCanvas) {
                    tCtx.beginPath();
                    tCtx.arc(canvasX, canvasY, brushSize / 2, 0, Math.PI * 2);
                    tCtx.fill();
                    tCtx.globalCompositeOperation = "destination-out";
                    tCtx.drawImage(layer.protectionMask, 0, 0, layer.w, layer.h);

                    const imgCtx = layer.canvasImage.getContext("2d");
                    imgCtx.save();
                    imgCtx.globalCompositeOperation = "destination-out";
                    imgCtx.drawImage(tempCanvas, 0, 0, layer.canvasImage.width, layer.canvasImage.height);
                    imgCtx.restore();
                } else {
                    const imgCtx = layer.canvasImage.getContext("2d");
                    imgCtx.save();
                    imgCtx.globalCompositeOperation = "destination-out";
                    imgCtx.beginPath();
                    imgCtx.arc(canvasX, canvasY, brushSize / 2, 0, Math.PI * 2);
                    imgCtx.fill();
                    imgCtx.restore();
                }

                filterCache.clear();
                requestRender();
            }
        } else {
            const dCtx = layer.drawingCanvas.getContext("2d");
            
            if (tempCanvas) {
                tCtx.fillStyle = state.brush.color;
                tCtx.beginPath();
                tCtx.arc(x, y, state.brush.size / 2, 0, Math.PI * 2);
                tCtx.fill();
                tCtx.globalCompositeOperation = "destination-out";
                tCtx.drawImage(layer.protectionMask, 0, 0, layer.w, layer.h);

                dCtx.save();
                if (state.activeTool === "eraser") {
                    dCtx.globalCompositeOperation = "destination-out";
                } else {
                    dCtx.globalCompositeOperation = "source-over";
                }
                dCtx.drawImage(tempCanvas, 0, 0, layer.w, layer.h);
                dCtx.restore();
            } else {
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
            }
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
        let tempCanvas = null, tCtx = null;
        if (layer.protectionMask) {
            tempCanvas = document.createElement("canvas");
            tempCanvas.width = layer.w;
            tempCanvas.height = layer.h;
            tCtx = tempCanvas.getContext("2d");
        }

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

                if (tempCanvas) {
                    tCtx.lineWidth = brushSize;
                    tCtx.lineCap = "round";
                    tCtx.lineJoin = "round";
                    tCtx.beginPath();
                    tCtx.moveTo(canvasX1, canvasY1);
                    tCtx.lineTo(canvasX2, canvasY2);
                    tCtx.stroke();
                    tCtx.globalCompositeOperation = "destination-out";
                    tCtx.drawImage(layer.protectionMask, 0, 0, layer.w, layer.h);

                    const imgCtx = layer.canvasImage.getContext("2d");
                    imgCtx.save();
                    imgCtx.globalCompositeOperation = "destination-out";
                    imgCtx.drawImage(tempCanvas, 0, 0, layer.canvasImage.width, layer.canvasImage.height);
                    imgCtx.restore();
                } else {
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
                }

                filterCache.clear();
                requestRender();
            }
        } else {
            const dCtx = layer.drawingCanvas.getContext("2d");
            
            if (tempCanvas) {
                tCtx.lineWidth = state.brush.size;
                tCtx.lineCap = "round";
                tCtx.lineJoin = "round";
                tCtx.strokeStyle = state.brush.color;
                tCtx.beginPath();
                tCtx.moveTo(x1, y1);
                tCtx.lineTo(x2, y2);
                tCtx.stroke();
                
                tCtx.globalCompositeOperation = "destination-out";
                tCtx.drawImage(layer.protectionMask, 0, 0, layer.w, layer.h);

                dCtx.save();
                if (state.activeTool === "eraser") {
                    dCtx.globalCompositeOperation = "destination-out";
                } else {
                    dCtx.globalCompositeOperation = "source-over";
                }
                dCtx.drawImage(tempCanvas, 0, 0, layer.w, layer.h);
                dCtx.restore();
            } else {
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
            }
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
            syncCurrentFrameKeyframeFromLayer(layer);
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
                    } else {
                        // Crea un nuovo frame per il file secondario!
                        const newFrame = {
                            id: generateId(),
                            delay: 100,
                            layers: []
                        };
                        state.frames.push(newFrame);
                        state.activeFrameIndex = state.frames.length - 1;
                        buildTimelineUI();
                    }

                    const newLayer = {
                        id: generateId(),
                        groupId: generateId(),
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
                        chromaTolerance: 20,
                        transparencyRules: [],
                        keyframes: {}
                    };
                    addLayer(newLayer);
                    // Centra la vista sull'immagine importata
                    state.zoom = 1.0;
                    setTimeout(centerCanvas, 80);
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
                const sharedGroupId = generateId();
                const newLayer = {
                    id: sharedId,
                    groupId: sharedGroupId,
                    name: "Rif: " + file.name.substring(0, 12),
                    type: "image",
                    x: 0,
                    y: 0,
                    w: state.canvasWidth, h: state.canvasHeight, visible: true, opacity: 0.7, r: 0, keepRatio: true, aspectRatio: 1, img: null,
                    borderRadius: 0,
                    locked: true,
                    isReference: true,
                    chromaActive: false,
                    chromaColor: "#ffffff",
                    chromaTolerance: 20,
                    startFrame: 1,
                    endFrame: state.frames.length,
                    transparencyRules: [],
                    keyframes: {}
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
                state.zoom = 1.0;
                setTimeout(centerCanvas, 80);
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    saveState(); // Salva lo stato prima di aggiungere il riferimento
                    const sharedId = generateId();
                    const sharedGroupId = generateId();
                    const newLayer = {
                        id: sharedId,
                        groupId: sharedGroupId,
                        name: "Rif: " + file.name.substring(0, 12),
                        type: "image",
                        x: Math.round((state.canvasWidth - (img.width * Math.min(state.canvasWidth / img.width, state.canvasHeight / img.height, 1))) / 2),
                        y: Math.round((state.canvasHeight - (img.height * Math.min(state.canvasWidth / img.width, state.canvasHeight / img.height, 1))) / 2),
                        w: Math.round(img.width * Math.min(state.canvasWidth / img.width, state.canvasHeight / img.height, 1)),
                        h: Math.round(img.height * Math.min(state.canvasWidth / img.width, state.canvasHeight / img.height, 1)),
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
                        endFrame: state.frames.length,
                        transparencyRules: [],
                        keyframes: {}
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
                    // Centra la vista
                    state.zoom = 1.0;
                    setTimeout(centerCanvas, 80);
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
            const sharedGroupId = generateId();
            
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
                            groupId: sharedGroupId,
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
                            chromaTolerance: 20,
                            transparencyRules: [],
                            keyframes: {}
                        }
                    ]
                });
            });

            state.frames = parsedFrames;
            state.activeFrameIndex = 0;
            applyKeyframesForTimelineFrame(0);
            state.activeLayerId = state.frames[0].layers[0].id;

            buildTimelineUI();
            updateLayersListUI();
            updateXYZControlsUI();
            requestRender();
            
            dom.statusFramesCount.innerText = `1/${state.frames.length}`;
            
            // Centra la vista
            state.zoom = 1.0;
            setTimeout(centerCanvas, 100);

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

                applyKeyframesForTimelineFrame(frameIdx);
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
        if (!dom.framesTrack) return;
        dom.framesTrack.innerHTML = "";
        if (dom.keyframesTrackBox) dom.keyframesTrackBox.innerHTML = "";

        const targetType = dom.keyframeTarget ? dom.keyframeTarget.value : "active";
        const kfLayer = resolveKeyframeTargetLayer(targetType);
        const kfIndices = kfLayer ? getSortedKeyframeFrames(kfLayer) : [];

        state.frames.forEach((frame, idx) => {
            const isCurrent = idx === state.activeFrameIndex;
            ensureLayerKeyframes(kfLayer);
            const hasKf = kfLayer && kfLayer.keyframes && kfLayer.keyframes[idx] !== undefined;

            const frameCol = document.createElement("div");
            frameCol.className = `timeline-frame-column ${isCurrent ? "active-column" : ""}`;
            frameCol.dataset.index = idx;

            const card = document.createElement("div");
            card.className = `frame-thumbnail-card ${isCurrent ? "active-frame" : ""}${hasKf ? " has-keyframe" : ""}`;
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
            card.addEventListener("click", () => selectFrame(idx));
            frameCol.appendChild(card);
            dom.framesTrack.appendChild(frameCol);

            if (dom.keyframesTrackBox) {
                const betweenKf = kfIndices.some((k, i) => {
                    const next = kfIndices[i + 1];
                    return next !== undefined && k < idx && idx < next;
                });
                const kfCol = document.createElement("div");
                kfCol.className = `timeline-kf-column ${isCurrent ? "active-column" : ""}${betweenKf ? " kf-bridge-active" : ""}`;
                kfCol.dataset.index = idx;

                const kfSlot = document.createElement("div");
                kfSlot.className = "keyframe-slot";

                const kfNode = document.createElement("div");
                if (hasKf) {
                    kfNode.className = "kf-diamond";
                    kfNode.title = `Keyframe #${idx + 1} — ${kfLayer.name}. Clic: seleziona · Alt+Clic: rimuovi`;
                } else {
                    kfNode.className = "kf-dot";
                    kfNode.title = `Frame #${idx + 1}. Clic: aggiungi keyframe`;
                }

                kfNode.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (!kfLayer) return;
                    state.activeLayerId = kfLayer.id;
                    updateLayersListUI();
                    if (e.altKey && hasKf) {
                        deleteKeyframeAtFrame(kfLayer, idx);
                        selectFrame(idx);
                    } else if (hasKf) {
                        selectFrame(idx);
                    } else {
                        saveState();
                        upsertKeyframeAtFrame(kfLayer, idx);
                        selectFrame(idx);
                        buildTimelineUI();
                        requestRender();
                    }
                });

                kfSlot.appendChild(kfNode);
                kfCol.appendChild(kfSlot);
                dom.keyframesTrackBox.appendChild(kfCol);
            }
        });

        if (dom.keyframesTrackBox && kfIndices.length >= 2) {
            const cols = dom.keyframesTrackBox.querySelectorAll(".timeline-kf-column");
            for (let i = 0; i < kfIndices.length - 1; i++) {
                const a = kfIndices[i];
                const b = kfIndices[i + 1];
                for (let f = a + 1; f < b; f++) {
                    if (cols[f]) cols[f].classList.add("kf-bridge-active");
                }
            }
        }

        const currentFrame = getActiveFrame();
        if (currentFrame && dom.timelineDelay) {
            dom.timelineDelay.value = currentFrame.delay;
        }
    }

    function selectFrame(index) {
        if (index < 0 || index >= state.frames.length) return;
        
        state.activeFrameIndex = index;
        applyKeyframesForTimelineFrame(index);
        
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
                    drawingCanvas: drawCopy,
                    keyframes: l.keyframes ? JSON.parse(JSON.stringify(l.keyframes)) : {},
                    transparencyRules: l.transparencyRules ? l.transparencyRules.map(r => ({ ...r })) : []
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

        if (dom.btnAddKeyframe) {
            dom.btnAddKeyframe.addEventListener("click", () => {
                const targetType = dom.keyframeTarget ? dom.keyframeTarget.value : "active";
                const layer = resolveKeyframeTargetLayer(targetType);
                if (!layer) {
                    alert("Nessun livello trovato per il target selezionato.");
                    return;
                }
                state.activeLayerId = layer.id;
                updateLayersListUI();
                addKeyframeAtCurrentFrame(layer);
                updateXYZControlsUI();
            });
        }

        if (dom.btnDeleteKeyframe) {
            dom.btnDeleteKeyframe.addEventListener("click", () => {
                const targetType = dom.keyframeTarget ? dom.keyframeTarget.value : "active";
                const layer = resolveKeyframeTargetLayer(targetType);
                if (!layer) {
                    alert("Nessun livello trovato per il target selezionato.");
                    return;
                }
                deleteKeyframeAtCurrentFrame(layer);
            });
        }

        if (dom.keyframeTarget) {
            dom.keyframeTarget.addEventListener("change", () => {
                buildTimelineUI();
            });
        }

        if (dom.kfAutoKeyframe) {
            dom.kfAutoKeyframe.checked = !!state.autoKeyframe;
            dom.kfAutoKeyframe.addEventListener("change", (e) => {
                state.autoKeyframe = e.target.checked;
            });
        }

        if (dom.btnGotoPrevKeyframe) {
            dom.btnGotoPrevKeyframe.addEventListener("click", () => gotoAdjacentKeyframe(-1));
        }
        if (dom.btnGotoNextKeyframe) {
            dom.btnGotoNextKeyframe.addEventListener("click", () => gotoAdjacentKeyframe(1));
        }

        KEYFRAME_PROPS.forEach((prop) => {
            const elId = "kf-prop-" + (prop === "opacity" ? "opacity" : prop);
            const el = document.getElementById(elId);
            if (el) {
                el.addEventListener("change", () => {
                    const layer = resolveKeyframeTargetLayer(dom.keyframeTarget ? dom.keyframeTarget.value : "active");
                    if (layer && layer.keyframes[state.activeFrameIndex]) {
                        syncCurrentFrameKeyframeFromLayer(layer);
                        requestRender();
                    }
                });
            }
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
        // Sincronizzazione tolleranza — trasparenza automatica (sfondo ai bordi)
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

        // Colore live — solo trasparenza automatica
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

        // Sincronizzazione tolleranza — trasparenza a catena (anteprima regole)
        function syncTransparentTolerance(val) {
            val = Math.max(0, Math.min(255, val));
            if (dom.bgTransparentTolerance) dom.bgTransparentTolerance.value = val;
            if (dom.bgTransparentToleranceSlider) dom.bgTransparentToleranceSlider.value = val;
            const layer = getActiveLayer();
            if (layer && layer.transparencyRules && layer.transparencyRules.length) {
                filterCache.delete(layer.id);
                requestRender();
            }
        }
        if (dom.bgTransparentTolerance && dom.bgTransparentToleranceSlider) {
            dom.bgTransparentToleranceSlider.addEventListener("input", (e) => {
                syncTransparentTolerance(parseInt(e.target.value, 10) || 0);
            });
            dom.bgTransparentTolerance.addEventListener("input", (e) => {
                syncTransparentTolerance(parseInt(e.target.value, 10) || 0);
            });
        }
        if (dom.bgTransparencyType) {
            dom.bgTransparencyType.addEventListener("change", () => {
                if (dom.bgTransparencyType.value === "global") {
                    clearTransparentPickStatus();
                }
                updateTransparentPickStatus();
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

        if (dom.btnApplyCorners) {
            dom.btnApplyCorners.addEventListener("click", () => {
                const layer = getActiveLayer();
                if (!layer) return;

                layer.borderRadius = parseInt(dom.filterBorderRadius.value) || 0;
                propagateLayerChanges(layer, { borderRadius: layer.borderRadius });
                requestRender();
            });
        }

        if (dom.addTextLayer) dom.addTextLayer.addEventListener("click", () => {
            saveState(); // Salva lo stato prima di aggiungere

            const sharedId = generateId();
            const sharedGroupId = generateId();
            const fontSize = Math.max(10, Math.min(32, Math.round(state.canvasHeight * 0.2)));
            const w = Math.max(50, Math.round(state.canvasWidth * 0.8));
            const h = Math.max(20, Math.round(fontSize * 1.5));
            const startFrame = state.activeFrameIndex + 1;
            
            // Aggiungiamo il livello Scritta con lo stesso ID a tutti i fotogrammi del progetto
            state.frames.forEach((frame) => {
                const textLayer = {
                    id: sharedId,
                    groupId: sharedGroupId,
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
            const layer = getActiveLayer();
            const rep = {
                from: dom.replaceColorFrom.value,
                to: dom.replaceColorTo.value,
                tolerance: parseInt(dom.replaceColorTolerance.value) || 20,
                transparent: false,
                seedX: useGlobal ? null : (state.lastPickedReplaceCoords ? state.lastPickedReplaceCoords.x : null),
                seedY: useGlobal ? null : (state.lastPickedReplaceCoords ? state.lastPickedReplaceCoords.y : null),
                scope: state.editScope,
                targetLayerId: layer ? layer.id : null
            };
            state.colorReplacements.push(rep);
            state.lastPickedReplaceCoords = null;
            updateReplacementsUI();
            filterCache.clear();
            requestRender();
        });

        if (dom.btnAddTransparencyRule) {
            dom.btnAddTransparencyRule.addEventListener("click", () => addTransparencyRuleFromUI());
        }

    }

    // ======================================================================
    // 17. UI CUSTOMIZER CON TEMI PROFESSIONALI STILE ARCHITETTO
    // ======================================================================
    function initUiCustomizer() {
        const root = document.documentElement;

        const themes = {
            default: {
                bg: "#0f1013",
                win: "#1a1c23",
                text: "#f1f5f9",
                accent: "#00ffcc",
                font: "Inter",
                radius: 10
            },
            cyber: {
                bg: "#050510",
                win: "#0f0f20", 
                text: "#ffffff",
                accent: "#ff00ff", // Magenta acceso (Neon Cyber)
                font: "Orbitron",
                radius: 12
            },
            dark: {
                bg: "#000000",
                win: "#090909",
                text: "#ffffff",
                accent: "#ffffff", // Bianco puro (OLED Pure)
                font: "Inter",
                radius: 6
            },
            light: {
                bg: "#e2e8f0", // Grigio azzurro chiaro, non accecante
                win: "#f1f5f9", // Leggermente più chiaro dello sfondo per le finestre
                text: "#2b3440", // Scuro leggibile
                accent: "#5c7cfa", // Blu pastello nordico (Nordic Light)
                font: "Poppins",
                radius: 12
            },
            concrete: {
                bg: "#282a36",
                win: "#44475a",
                text: "#f8f8f2",
                accent: "#ff79c6", // Rosa acceso (Dracula)
                font: "Roboto",
                radius: 8
            },
            retro: {
                bg: "#110b1a",
                win: "#221533",
                text: "#00ffff", // Ciano (Synthwave)
                accent: "#ff007f", // Rosa shocking
                font: "'Fira Code', monospace",
                radius: 4
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
            
            // LOGICA TESTI CON PROFONDITÀ (Richiesta Utente)
            const textRgb = hexToRgb(textVal);
            
            // Text Main (Colore base Testi): Ombra più definita e bagliore
            root.style.setProperty("--text-main", textVal);
            root.style.setProperty("--text-shadow-main", `0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(${textRgb.r}, ${textRgb.g}, ${textRgb.b}, 0.45)`);
            
            // Text Secondary (Variante più chiara per maggiore leggibilità, 80% invece di 65%)
            const rSec = Math.round(textRgb.r * 0.85);
            const gSec = Math.round(textRgb.g * 0.85);
            const bSec = Math.round(textRgb.b * 0.85);
            root.style.setProperty("--text-secondary", `rgb(${rSec}, ${gSec}, ${bSec})`);
            root.style.setProperty("--text-shadow-secondary", `0 1px 2px rgba(0,0,0,0.8)`);

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
            if (window._akiInterval) {
                clearInterval(window._akiInterval);
                window._akiInterval = null;
            }
            document.body.classList.remove("aki-mode-active");
            document.body.classList.remove("sind-mode-active");
            document.querySelectorAll(".sind-entity").forEach(f => f.remove());
            
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
                // Neon Cyber win override
                dom.uiColorWin.value = "#0f0f20";
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

        // ==========================================
        // GESTIONE SET COLORAZIONE PERSONALIZZATI
        // ==========================================
        function showCustomPrompt(message, defaultVal = "") {
            return new Promise(resolve => {
                const overlay = document.createElement("div");
                overlay.style.position = "fixed";
                overlay.style.top = "0"; overlay.style.left = "0"; overlay.style.width = "100vw"; overlay.style.height = "100vh";
                overlay.style.backgroundColor = "rgba(0,0,0,0.8)";
                overlay.style.zIndex = "10000"; overlay.style.display = "flex"; overlay.style.alignItems = "center"; overlay.style.justifyContent = "center";
                
                const box = document.createElement("div");
                box.style.background = "#1a1c23"; box.style.padding = "20px"; box.style.borderRadius = "10px";
                box.style.border = "1px solid var(--accent-color)"; box.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5)";
                box.style.width = "320px"; box.style.display = "flex"; box.style.flexDirection = "column"; box.style.gap = "15px";
                
                const msg = document.createElement("div");
                msg.innerText = message; msg.style.color = "#fff"; msg.style.fontFamily = "var(--font-primary)";
                msg.style.fontSize = "13px";
                
                const input = document.createElement("input");
                input.type = "text"; input.value = defaultVal;
                input.style.padding = "8px"; input.style.background = "#0f1013"; input.style.border = "1px solid #333";
                input.style.color = "#fff"; input.style.borderRadius = "5px"; input.style.outline = "none";
                
                const btnRow = document.createElement("div");
                btnRow.style.display = "flex"; btnRow.style.gap = "10px"; btnRow.style.justifyContent = "flex-end";
                
                const btnCancel = document.createElement("button");
                btnCancel.innerText = "Annulla"; btnCancel.className = "btn-secondary"; btnCancel.style.padding = "6px 15px"; btnCancel.style.cursor = "pointer";
                
                const btnOk = document.createElement("button");
                btnOk.innerText = "OK"; btnOk.className = "btn-primary"; btnOk.style.padding = "6px 15px"; btnOk.style.cursor = "pointer";
                
                btnRow.appendChild(btnCancel); btnRow.appendChild(btnOk);
                box.appendChild(msg); box.appendChild(input); box.appendChild(btnRow);
                overlay.appendChild(box);
                document.body.appendChild(overlay);
                
                input.focus();
                
                const close = (val) => { overlay.remove(); resolve(val); };
                btnCancel.onclick = () => close(null);
                btnOk.onclick = () => close(input.value);
                input.onkeydown = (e) => { if(e.key === "Enter") close(input.value); if(e.key === "Escape") close(null); };
            });
        }

        function loadCustomThemes() {
            const saved = localStorage.getItem("gifstudio_custom_themes");
            if (saved) {
                try {
                    const customThemes = JSON.parse(saved);
                    Object.keys(customThemes).forEach(key => {
                        themes[key] = customThemes[key];
                        addThemeButtonToGrid(key, customThemes[key].name || key);
                    });
                } catch(e) { console.error("Errore caricamento temi custom", e); }
            }
        }
        
        function addThemeButtonToGrid(key, name) {
            const grid = document.querySelector('.preset-theme-grid');
            if(!grid || document.getElementById(`theme-${key}`)) return;
            const btn = document.createElement("button");
            btn.className = "theme-btn custom-theme-btn";
            btn.id = `theme-${key}`;
            btn.dataset.theme = key;
            btn.innerText = name;
            // Gestione click tema
            btn.addEventListener("click", (e) => {
                applyThemePreset(key);
            });
            // Tasto destro per eliminare tema custom
            btn.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                if(confirm(`Vuoi eliminare il tema salvato "${name}"?`)) {
                    delete customThemesObj[key];
                    localStorage.setItem("gifstudio_custom_themes", JSON.stringify(customThemesObj));
                    delete themes[key];
                    btn.remove();
                }
            });
            grid.appendChild(btn);
        }

        let customThemesObj = {};
        try {
            customThemesObj = JSON.parse(localStorage.getItem("gifstudio_custom_themes")) || {};
        } catch(e) {}
        
        loadCustomThemes();

        // Pulsante: Salva set colorazione
        const btnSaveTheme = document.getElementById("btn-save-custom-theme");
        if (btnSaveTheme) {
            btnSaveTheme.addEventListener("click", async () => {
                const themeName = await showCustomPrompt("Inserisci un nome per il tuo set di colori:");
                if (!themeName || themeName.trim() === "") return;
                
                const key = "custom_" + Date.now();
                const newTheme = {
                    name: themeName,
                    bg: dom.uiColorBg.value,
                    win: dom.uiColorWin.value,
                    text: dom.uiColorText.value,
                    accent: dom.uiColorAccent.value,
                    font: dom.uiFontFamily.value,
                    radius: parseInt(dom.uiWindowRadius.value) || 10
                };
                
                customThemesObj[key] = newTheme;
                localStorage.setItem("gifstudio_custom_themes", JSON.stringify(customThemesObj));
                themes[key] = newTheme;
                addThemeButtonToGrid(key, themeName);
                applyThemePreset(key);
            });
        }

        // Pulsante: Esporta set colorazione
        const btnExportTheme = document.getElementById("btn-export-custom-theme");
        if (btnExportTheme) {
            btnExportTheme.addEventListener("click", async () => {
                const currentTheme = {
                    type: "GifStudioTheme",
                    bg: dom.uiColorBg.value,
                    win: dom.uiColorWin.value,
                    text: dom.uiColorText.value,
                    accent: dom.uiColorAccent.value,
                    font: dom.uiFontFamily.value,
                    radius: parseInt(dom.uiWindowRadius.value) || 10
                };
                
                try {
                    if (typeof window.showSaveFilePicker === "function") {
                        const fileHandle = await window.showSaveFilePicker({
                            suggestedName: "IlMioStile_GifStudio.json",
                            types: [{
                                description: 'File Tema',
                                accept: { 'application/json': ['.json'] }
                            }]
                        });
                        const writable = await fileHandle.createWritable();
                        await writable.write(JSON.stringify(currentTheme, null, 2));
                        await writable.close();
                    } else {
                        // Fallback nel caso la funzione non sia disponibile
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentTheme, null, 2));
                        const anchor = document.createElement("a");
                        anchor.href = dataStr;
                        anchor.download = "IlMioStile_GifStudio.json";
                        document.body.appendChild(anchor);
                        anchor.click();
                        anchor.remove();
                    }
                } catch(e) {
                    console.log("Salvataggio set annullato dall'utente");
                }
            });
        }

        // Pulsante: Importa set colorazione
        const btnImportTheme = document.getElementById("btn-import-custom-theme");
        const inputImportTheme = document.getElementById("input-import-theme");
        if (btnImportTheme && inputImportTheme) {
            btnImportTheme.addEventListener("click", () => {
                inputImportTheme.click();
            });
            inputImportTheme.addEventListener("change", (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const importedTheme = JSON.parse(event.target.result);
                        if (importedTheme && importedTheme.bg && importedTheme.win) {
                            const themeName = await showCustomPrompt("Nome per il tema importato:", file.name.replace(".json", ""));
                            if (!themeName) return;
                            
                            const key = "custom_imp_" + Date.now();
                            importedTheme.name = themeName;
                            
                            customThemesObj[key] = importedTheme;
                            localStorage.setItem("gifstudio_custom_themes", JSON.stringify(customThemesObj));
                            themes[key] = importedTheme;
                            addThemeButtonToGrid(key, themeName);
                            applyThemePreset(key);
                        } else {
                            alert("File non valido o corrotto.");
                        }
                    } catch(err) {
                        alert("Errore durante l'importazione del file JSON.");
                    }
                    inputImportTheme.value = ""; // Reset input
                };
                reader.readAsText(file);
            });
        }

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

        // ==========================================
        // GESTIONE COPIA/INCOLLA COLORI (TASTO DESTRO)
        // ==========================================
        function showToast(msg, duration = 2000) {
            let toast = document.getElementById("gifstudio-toast");
            if (!toast) {
                toast = document.createElement("div");
                toast.id = "gifstudio-toast";
                toast.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--accent-color); color:#fff; padding:8px 16px; border-radius:20px; font-weight:700; font-size:12px; z-index:99999; box-shadow:0 4px 12px rgba(0,0,0,0.5); opacity:0; transition:opacity 0.3s; pointer-events:none;";
                document.body.appendChild(toast);
            }
            toast.innerText = msg;
            toast.style.opacity = "1";
            if (toast.timeoutId) clearTimeout(toast.timeoutId);
            toast.timeoutId = setTimeout(() => toast.style.opacity = "0", duration);
        }

        // ==========================================
        // GESTIONE COPIA/INCOLLA COLORI (PULSANTI ESPLICITI)
        // ==========================================
        const btnCopySlot = document.getElementById("btn-copy-color-slot");
        const btnPasteSlot = document.getElementById("btn-paste-color-slot");
        const syncColorSelect = document.getElementById("sync-color-select");
        let syncClipboard = null;

        if (btnCopySlot && btnPasteSlot && syncColorSelect) {
            btnCopySlot.addEventListener("click", () => {
                const sourceInput = document.getElementById(syncColorSelect.value);
                if (sourceInput) {
                    syncClipboard = sourceInput.value;
                    const slotName = syncColorSelect.options[syncColorSelect.selectedIndex].text;
                    showToast(`Colore copiato da ${slotName} (${syncClipboard})`, 2500);
                }
            });

            btnPasteSlot.addEventListener("click", () => {
                const targetInput = document.getElementById(syncColorSelect.value);
                if (targetInput && syncClipboard) {
                    targetInput.value = syncClipboard;
                    targetInput.dispatchEvent(new Event("input")); // Applica la modifica e aggiorna il tema
                    const slotName = syncColorSelect.options[syncColorSelect.selectedIndex].text;
                    showToast(`Colore incollato su ${slotName}!`, 2000);
                } else if (!syncClipboard) {
                    showToast("Prima copia un colore!", 2000);
                }
            });
        }

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
                    <div class="update-banner-desc">Versione attuale v${updateData.currentVersion}. Lo scaricamento va in <b>Download</b> (non sostituisce l'exe in uso). Chiudi l'app e avvia il nuovo file.</div>
                </div>
            </div>
            <div class="update-banner-actions">
                <button type="button" class="update-banner-btn-download" id="update-download-btn">Scarica aggiornamento</button>
                <button type="button" class="update-banner-btn-browser" id="update-browser-btn" title="Apri pagina release nel browser">Browser</button>
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

        const downloadBtn = banner.querySelector('#update-download-btn');
        const browserBtn = banner.querySelector('#update-browser-btn');

        async function runSafeUpdateDownload() {
            if (!updateData.downloadUrl) {
                alert('Link di download non disponibile.');
                return;
            }
            const prevLabel = downloadBtn.textContent;
            downloadBtn.disabled = true;
            downloadBtn.textContent = 'Download in corso...';
            try {
                const params = new URLSearchParams({
                    mode: 'download',
                    downloadUrl: updateData.downloadUrl,
                    version: updateData.latestVersion || 'latest'
                });
                const res = await fetch(`/api/open-update-download?${params.toString()}`);
                const data = await res.json();
                if (!res.ok || !data.ok) {
                    throw new Error(data.error || 'Download non riuscito');
                }
                alert(
                    `Aggiornamento scaricato in Download:\n\n${data.fileName}\n\n` +
                    'Chiudi Gif Studio, poi avvia il nuovo file dalla cartella Download. ' +
                    'Non sostituire l\'exe mentre l\'app è aperta.'
                );
            } catch (err) {
                console.warn('Download diretto fallito, apertura browser:', err);
                await openUpdateInExternalBrowser(updateData);
            } finally {
                downloadBtn.disabled = false;
                downloadBtn.textContent = prevLabel;
            }
        }

        async function openUpdateInExternalBrowser(update) {
            const pageUrl = update.releasePageUrl || update.downloadUrl;
            if (!pageUrl) {
                alert('Pagina di aggiornamento non disponibile.');
                return;
            }
            const params = new URLSearchParams({
                mode: 'browser',
                pageUrl
            });
            const res = await fetch(`/api/open-update-download?${params.toString()}`);
            const data = await res.json();
            if (!res.ok || !data.ok) {
                alert('Impossibile aprire il browser per il download.');
                return;
            }
            alert(
                `Apertura in ${data.browser || 'browser'}.\n\n` +
                'Scarica il file .exe nella cartella Download, chiudi Gif Studio e avvia il nuovo programma.'
            );
        }

        downloadBtn.addEventListener('click', runSafeUpdateDownload);
        browserBtn.addEventListener('click', () => openUpdateInExternalBrowser(updateData));
    }

    async function startApp() {
        migrateLegacyLayoutStorage();
        initAllTabOrigins();
        applyDefaultTabLayout();
        setupTabHandlers();
        initTabDockingSystem();
        setupWindowManager();
        initCanvasWorkspace();
        initDrawingTools();
        initAdvancedToolsEvents();
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
            repairTimelineWindow();
            ensureCoreWindowsVisible();
            document.querySelectorAll(".window").forEach(clampWindowToViewport);
            layoutRestoreComplete = true;
            lastKnownScreen = { w: window.innerWidth, h: window.innerHeight };
            if (typeof window.updateDynamicUI === "function") window.updateDynamicUI();
            buildTimelineUI();
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
        applyKeyframesForTimelineFrame(state.activeFrameIndex);
        updateReplacementsUI();
        checkForUpdates();

        if (window.location.search.includes("test=true")) {
            setTimeout(runAutomatedBetaTests, 1000);
        }
    }

    function runAutomatedBetaTests() {
        console.log("=== INIZIO BETA TEST AUTOMATIZZATI ===");
        const results = {
            timestamp: new Date().toISOString(),
            success: true,
            tests: []
        };

        function assert(condition, message) {
            results.tests.push({
                message: message,
                status: condition ? "PASSED" : "FAILED"
            });
            if (!condition) {
                results.success = false;
                console.error("FAIL:", message);
            } else {
                console.log("PASS:", message);
            }
        }

        try {
            // Test 1: Sostituzione Colore Globale e Livelli Omologhi
            console.log("Esecuzione Test 1: Sostituzione Colore Globale e Livelli Omologhi...");
            
            state.frames = [];
            state.activeFrameIndex = 0;
            state.colorReplacements = [];

            const frame1Id = generateId();
            const frame2Id = generateId();
            const mainGroupId = generateId();
            
            const mainLayer1 = {
                id: generateId(),
                groupId: mainGroupId,
                name: "Sfondo",
                type: "image",
                x: 0, y: 0, w: 100, h: 100,
                transparencyRules: []
            };

            const mainLayer2 = {
                id: generateId(),
                groupId: mainGroupId,
                name: "Sfondo",
                type: "image",
                x: 0, y: 0, w: 100, h: 100,
                transparencyRules: []
            };

            state.frames = [
                { id: frame1Id, delay: 100, layers: [mainLayer1] },
                { id: frame2Id, delay: 100, layers: [mainLayer2] }
            ];

            assert(isHomologousLayer(mainLayer1, mainLayer2), "I due livelli principali con lo stesso groupId devono essere omologhi");

            const textLayer = {
                id: generateId(),
                groupId: generateId(),
                name: "Testo",
                type: "text",
                x: 0, y: 0, w: 50, h: 50
            };
            state.frames[0].layers.unshift(textLayer);

            assert(isHomologousLayer(mainLayer1, mainLayer2), "I livelli principali devono rimanere omologhi anche se disallineati dall'inserimento di un altro livello");

            // Test 2: Verifica getFilterCacheKey e gifFrameIndex per GIF di Riferimento
            console.log("Esecuzione Test 2: Verifica getFilterCacheKey e gifFrameIndex...");
            
            const refLayer = {
                id: generateId(),
                groupId: generateId(),
                name: "Riferimento Animato",
                type: "image",
                gifFrames: [
                    document.createElement("canvas"),
                    document.createElement("canvas")
                ],
                transparencyRules: []
            };
            refLayer.gifFrames[0].gifFrameIndex = 0;
            refLayer.gifFrames[1].gifFrameIndex = 1;

            const key1 = getFilterCacheKey(refLayer, refLayer.gifFrames[0]);
            const key2 = getFilterCacheKey(refLayer, refLayer.gifFrames[1]);

            assert(key1 !== key2, "Le chiavi della cache del filtro per frame GIF diversi devono essere distinte");
            assert(key1.includes("gif_0"), "La chiave per il frame 0 deve includere l'indice corretto del frame GIF");
            assert(key2.includes("gif_1"), "La chiave per il frame 1 deve includere l'indice corretto del frame GIF");

            // Test 3: Sincronizzazione della timeline
            console.log("Esecuzione Test 3: Verifica timeline e framesToAdd...");
            
            state.frames = [
                { id: frame1Id, delay: 100, layers: [mainLayer1] }
            ];
            
            const newRefGifFrames = [
                document.createElement("canvas"),
                document.createElement("canvas"),
                document.createElement("canvas")
            ];
            
            syncAnimatedReferenceToAllFrames(mainLayer1.id, newRefGifFrames, {
                w: 100, h: 100, aspectRatio: 1, x: 0, y: 0, keepRatio: true
            });

            assert(state.frames.length === 3, "Il numero di fotogrammi del progetto deve essersi esteso a 3 fotogrammi");

        } catch (e) {
            results.success = false;
            results.error = e.message;
            console.error("Errore durante i test:", e);
        }

        console.log("Invio dei risultati del beta test al server locale...");
        fetch("/api/test-results", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(results, null, 2)
        })
        .then(res => res.json())
        .then(data => {
            console.log("Risultati inviati con successo:", data);
        })
        .catch(err => {
            console.error("Errore nell'invio dei risultati:", err);
        });
    }

    function initTabOrderSystem() {
        const orderInputs = document.querySelectorAll('.tab-order-input');
        
        let savedOrders = {};
        try {
            if (localStorage.getItem("tabOrders")) {
                savedOrders = JSON.parse(localStorage.getItem("tabOrders"));
            }
        } catch (e) {}

        orderInputs.forEach(input => {
            const targetTabId = input.getAttribute('data-target');
            const tabBtn = document.querySelector(`.tab-btn[data-tab="${targetTabId}"]`);
            
            if (tabBtn) {
                if (savedOrders[targetTabId]) {
                    input.value = savedOrders[targetTabId];
                    tabBtn.style.order = savedOrders[targetTabId];
                } else {
                    tabBtn.style.order = input.value;
                }
                
                input.addEventListener('change', function() {
                    let val = parseInt(this.value);
                    if (isNaN(val) || val < 1) val = 1;
                    this.value = val;
                    
                    tabBtn.style.order = val;
                    
                    savedOrders[targetTabId] = val;
                    localStorage.setItem("tabOrders", JSON.stringify(savedOrders));
                });
            }
        });
    }


    function initInteractiveTutorial() {
        const btnTutorial = document.getElementById("btn-tutorial-mode");
        const tooltip = document.getElementById("tutorial-tooltip");
        let isTutorialMode = false;
        
        const tutorialDict = {
            // GLOBALI E HEADER
            "btn-tutorial-mode": "Pulsante Aiuto: Attiva o disattiva questa modalità per scoprire a cosa servono i vari strumenti.",
            "btn-default-layout": "Posizione di Default: Clicca qui se hai perso o chiuso qualche finestra per farle tornare tutte al loro posto originale.",
            "quick-launcher": "Isola di Comando: Usa questi pulsantini luminosi qui in alto per far apparire o scomparire rapidamente i blocchi dello schermo (Tavola, Progetto, Filtri, Timeline). Se non trovi più una finestra, clicca l'icona qua su!",
            "tut-status-canvas": "Info Tavola: Ti ricorda in ogni momento quanto è grande (in pixel) l'immagine finale che stai creando.",
            "tut-status-layer": "Info Livello: Mostra il nome del pezzo (livello) che hai attualmente selezionato.",
            "tut-status-frames": "Info Animazione: Ti dice quale fotogramma (frame) stai guardando rispetto al totale dell'animazione.",
            
            // FINESTRE PRINCIPALI E SOTTOCARTELLE
            "win-canvas": "Tavola da Disegno: Questa è l'area principale dove crei la tua GIF. Tutto ciò che vedi qui sarà nel risultato finale.",
            "win-project": "Pannello Progetto: Contiene tutte le schede per caricare immagini, cambiare i colori del programma e gestire la lista dei livelli.",
            "win-properties": "Pannello Strumenti: La tua cassetta degli attrezzi! Qui trovi gomme, pennelli, regolazioni XYZ ed effetti green-screen.",
            "win-timeline": "Pannello Animazione (Timeline): Lo studio di regia. Qui in basso gestisci lo scorrere del tempo e dei fotogrammi.",
            "tut-title-canvas-size": "Grandezza Tavola: Usa questi campi per decidere quanto sarà grande in pixel il video o la GIF che stai creando.",
            "tut-title-themes": "Temi: Ti permette di scegliere uno stile preimpostato (chiaro, scuro, colorato) per cambiare l'aspetto del programma.",
            "tut-title-custom-colors": "Colori Personalizzati: Ti permette di colorare ogni singolo pezzo del programma come preferisci.",
            "tut-title-fonts": "Scrittura e Angoli: Da qui puoi ingrandire i testi del programma, cambiare font e arrotondare i bordi.",
            "tut-title-tools": "Scegli Strumento: Seleziona tra cursore normale, pennello per disegnare o maschera bacchetta magica.",
            "tut-title-magic-wand": "Bacchetta Magica: Controlla quanto la bacchetta sarà sensibile ai colori simili.",
            "tut-title-eraser": "Gomma: Scegli se vuoi cancellare quello che hai disegnato tu, oppure bucare l'immagine originale come una vera gomma.",
            "tut-title-brush": "Impostazioni Pennello/Gomma: Regola quanto sarà grande e sfumato il tuo tratto.",
            "tut-title-xyz": "Posizione XYZ: Permette di muovere l'immagine avanti, indietro, o a destra e sinistra con precisione millimetrica.",
            "tut-title-bg-transparent": "Trasparenza Colore: Clicca su un colore dell'immagine per bucarlo come fosse un green-screen.",
            "tut-title-bg-auto": "Trasparenza Automatica: Cerca di rimuovere in automatico lo sfondo esterno attorno all'immagine.",
            "tut-title-replace-color": "Sostituisci Colore: Trasforma magicamente tutti i pixel di un certo colore in un altro colore in tutta la GIF.",
            "tut-title-shapes-settings": "Impostazioni Forme: Permette di scegliere il tipo di forma, colore, spessore e riempimento.",
            "tut-title-lasso-settings": "Impostazioni Lazo: Scegli tra selezione libera o rettangolare e ritaglia l'immagine.",
            
            // TAVOLA DA DISEGNO
            "btn-zoom-out": "Riduci: Rimpicciolisce la vista della tavola da disegno per farti vedere il quadro generale.",  
            // TEMI E STILE
            "tab-project-style": "Temi & Stile: Personalizza l'aspetto visivo del programma per non affaticare gli occhi.",
            "theme-dark": "Tema Grigio: Il classico tema scuro professionale.",
            "theme-cyber": "Tema Vetro: Tema moderno in stile Cyberpunk.",
            "theme-terminal": "Tema Marmo Nero: Tema ultra scuro per riposare la vista.",
            "theme-light": "Tema Chiaro: Tema bianco brillante come un foglio di carta.",
            "theme-concrete": "Tema Cemento: Tema minimal grigio chiaro.",
            "theme-retro": "Tema Retro: Verde e nero come i vecchi terminali.",
            "ui-color-bg": "Colore Sfondo: Scegli il colore dello sfondo dell'intero schermo del programma.",
            "ui-color-win": "Colore Finestre: Scegli il colore interno dei pannelli.",
            "ui-color-text": "Colore Testo: Scegli il colore delle scritte del programma.",
            "ui-color-accent": "Colore Accento: Scegli il colore dei pulsanti luminosi.",
            "ui-font-family": "Tipo Carattere: Cambia lo stile delle scritte di tutto il programma.",
            "ui-font-size": "Grandezza Carattere: Ingrandisci o rimpicciolisci i testi dell'interfaccia.",
            "ui-window-radius": "Angoli Finestre: Sposta la levetta per avere finestre quadrate o smussate.",
            
            // LISTA LIVELLI
            "tab-project-layers": "Lista Livelli: I livelli sono come fogli di carta sovrapposti. Qui vedi tutti i pezzi del tuo disegno.",
            "btn-delete-layer": "Elimina Livello: Seleziona un livello dalla lista qui sotto e clicca questo pulsante per eliminarlo definitivamente.",
            "layer-list": "La tua lista dei livelli. Clicca sul nome di un livello per selezionarlo. Clicca sull'Occhio per nasconderlo temporaneamente.",
            
            // AMBITO MODIFICA
            "btn-scope-frame": "Modalità Solo Frame: Se attivo, quando disegni, sposti o cancelli, la modifica avverrà SOLO nel fotogramma (frame) che stai guardando adesso. Ottimo per le animazioni a passo uno.",
            "btn-scope-global": "Modalità Tutta la GIF: Se attivo, qualsiasi modifica farai (come spostare un oggetto o cancellare), questa apparirà in tutti i fotogrammi del video contemporaneamente!",
            
            // STRUMENTI DI DISEGNO (PANNELLO CENTRALE/DESTRO)
            "draw-tool-select": "Sposta Oggetto: Usa questo strumento per acchiappare i livelli nel disegno e spostarli col mouse, oppure usa i loro bordi rossi per ingrandirli e rimpicciolirli.",
            "draw-tool-brush": "Pennello: Lo strumento classico per colorare e disegnare a mano libera.",
            "brush-color": "Colore Pennello: Scegli di che colore vuoi disegnare.",
            "brush-size": "Grandezza Tratto: Sposta la levetta per fare un pennello gigante o un pennellino fine per i dettagli.",
            
            "draw-tool-eraser": "Gomma: Passala sul disegno per cancellare i colori o fare dei buchi per far vedere lo sfondo trasparente.",
            "eraser-mode-brush": "Gomma Pennello: Cancella solo i tratti che hai disegnato tu a mano.",
            "eraser-mode-gif": "Gomma Sfondo: Modalità estrema! Passa la gomma sopra le foto o la GIF importata per bucarle letteralmente e renderle trasparenti.",
            
            "draw-tool-magic-wand": "Bacchetta Magica: Lo strumento definitivo. Clicca su un punto dell'immagine per circondarlo con una maschera protettiva rossa. Quel colore sarà protetto. Puoi cliccare in giro per sommare le zone protette!",
            "btn-remove-protection-mask": "Rimuovi Maschera: Clicca qui per disattivare la magia e sbloccare tutte le zone rosse protette.",
            "magic-wand-tolerance": "Tolleranza Magica: Aumentala se vuoi che la bacchetta magica protegga anche i pixel leggermente più scuri o più chiari del colore che hai cliccato.",
            
            "draw-tool-picker": "Copia Colore (Pipetta): Clicca un punto sul disegno per 'rubare' quel colore e metterlo subito nel tuo pennello.",
            "btn-add-text-layer": "Scritta: Aggiungi un blocco di scritte. Potrai poi spostarlo e ingrandirlo.",
            
            // SFONDO TRASPARENTE (GREEN SCREEN)
            "tab-prop-bg": "Sfondo Trasparente: Usa quest'area per trasformare le tue immagini rendendo trasparenti i colori di sfondo, come un green-screen televisivo.",
            "btn-pick-transparency-color": "Pipetta Trasparenza: 1) Clicca questo tasto 2) poi clicca sul disegno il colore esatto che vuoi bucare.",
            "transparency-tolerance": "Tolleranza: Se lo sfondo ha difetti o sfumature simili, aumenta questo valore per fargli catturare ed eliminare più pixel simili al colore che hai scelto.",
            "transparency-match-type": "Tipo Area: 'Area Unita' toglie il colore solo se i pixel si toccano tra loro. 'Globale' toglie quel colore ovunque, anche in macchie lontane nella foto.",
            "btn-add-transparency-rule": "Aggiungi Trasparenza: Premi questo pulsante per confermare ed eliminare il colore. L'effetto sarà perfetto e pulito!",
            
            // SOSTITUISCI COLORE
            "tab-prop-colors": "Sostituzione Colore: Quest'area ti permette di cambiare i colori di una foto in modo automatico. (Es: cambiare una maglietta da blu a rossa).",
            "btn-pick-replace-from": "Colore Originale (Dal): Clicca sulla pipetta e scegli sul disegno il colore vecchio da eliminare.",
            "btn-pick-replace-to": "Nuovo Colore (Al): Clicca sulla pipetta e scegli la nuova vernice con cui colorare le zone del colore originale.",
            "replace-tolerance": "Tolleranza Colore: Aumentala se vuoi che anche le sfumature (le ombre) del colore originale vengano verniciate col nuovo colore.",
            "btn-add-color-replace-rule": "Aggiungi Sostituzione: Premi qui per applicare il cambio colore su tutta la GIF!",
            
            // POSIZIONE 3D (XYZ E PROPRIETÀ)
            "tab-prop-xyz": "Posizione & Profondità: Regola manualmente al millimetro la posizione delle tue immagini usando i numeri.",
            "xyz-val-x": "Posizione X: Sposta l'oggetto orizzontalmente (Sinistra/Destra).",
            "xyz-val-y": "Posizione Y: Sposta l'oggetto verticalmente (Su/Giù).",
            "xyz-val-z": "Profondità Z: Vuoi che un'immagine stia sopra o sotto un'altra? Aumenta questo numero per portarla in primo piano rispetto alle altre!",
            "xyz-val-w": "Larghezza (W): Allarga o stringi l'immagine in pixel.",
            "xyz-val-h": "Altezza (H): Alza o schiaccia l'immagine in pixel.",
            "xyz-keep-ratio": "Mantieni Proporzioni: Se ha la spunta, quando allarghi l'immagine, l'altezza si adatterà da sola per non storpiarla.",
            "xyz-val-r": "Rotazione: Scrivi un numero (es. 45 o 90) per inclinare l'immagine come fosse storta.",
            "xyz-val-opacity": "Opacità (%): Abbassa questo numero da 100 a 50 per rendere l'immagine semi-trasparente, come un fantasma.",
            "xyz-text-content": "Testo: Se hai selezionato una scritta, puoi modificarne le parole qui dentro.",
            "xyz-text-size": "Grandezza Testo: Scegli quanto devono essere grandi le parole.",
            "xyz-text-font": "Carattere Testo: Scegli lo stile (font) della scritta.",
            "xyz-text-color": "Colore Testo: Scegli di che colore tingere le parole.",
            
            // TIMELINE E FOTOGRAMMI
            "timeline-controls": "Linea del Tempo (Timeline): Qui vedi lo scorrere della tua animazione. Ogni quadratino rappresenta un fotogramma, ovvero un istante di tempo.",
            "play-btn": "Play / Pausa: Avvia l'animazione per vedere la GIF muoversi nella tavola da disegno centrale.",
            "play-ms": "Velocità MS: Indica quanto tempo deve restare fermo un fotogramma prima di passare al successivo (100 = veloce, 500 = mezzo secondo, 1000 = lento).",
            "play-all-frames-btn": "Mostra Tutti i Frame: Attiva l'anteprima fantasma di tutti i fotogrammi sovrapposti per aiutarti ad animare un movimento.",
            "timeline-layer-select": "Scegli Livello: Clicca questa tendina se vuoi aprire la linea del tempo (keyframes) per animare le proprietà (posizione, rotazione) di un livello in particolare.",
            "kf-sync-auto": "Auto Sincronizzazione: Se spuntato, il computer registrerà in automatico i movimenti che fai sulla tavola creando un'animazione per te.",
            "kf-sync-x": "Registra Posizione X/Y: Registra gli spostamenti in alto/basso o destra/sinistra nel tempo.",
            "kf-sync-r": "Registra Rotazione: Registra le inclinazioni per creare un effetto di girandola nel tempo.",
            "kf-sync-op": "Registra Opacità: Registra le apparizioni e sparizioni (effetto fade) nel tempo.",
            "btn-add-kf": "Aggiungi Animazione (+): Crea un nuovo punto di registrazione (Keyframe) manuale sull'istante esatto che stai guardando.",

            // CANVAS - UNDO/REDO
            "btn-undo": "Annulla (Ctrl+Z): Torna indietro e cancella l'ultima modifica che hai fatto. Se hai sbagliato qualcosa, clicca qui!",
            "btn-redo": "Ripristina (Ctrl+Y): Rimette a posto la modifica che avevi annullato. È il contrario del pulsante Annulla.",

            // ZOOM E GRIGLIA
            "btn-zoom-reset": "Grandezza Reale (100%): Riporta la vista della tavola alla dimensione originale, né troppo grande né troppo piccola.",
            "btn-zoom-in": "Ingrandisci (+): Avvicina la vista per lavorare sui dettagli con più precisione.",
            "btn-toggle-grid": "Griglia Guida: Mostra o nasconde una griglia trasparente sulla tavola da disegno per aiutarti ad allineare gli elementi.",

            // PROGETTO E FILE
            "btn-apply-canvas-size": "Applica Grandezza: Conferma le dimensioni che hai scritto nei campi Larghezza e Altezza e ridimensiona la tavola da disegno.",
            "btn-import-reference": "Importa Riferimento: Carica un'immagine o GIF come livello di riferimento 'bloccato'. Non si può modificare, è solo una guida visiva da usare come traccia.",
            "btn-export-file": "Esporta File: Salva il tuo lavoro sul computer nel formato scelto (PNG, JPG o GIF animata). Questo è il risultato finale!",
            "file-dropzone": "Zona Importazione: Trascina qui un file PNG, JPG o GIF dal tuo computer, oppure clicca per aprire il pannello di selezione file.",

            // TRASPARENZA SFONDO AUTOMATICA
            "btn-pick-transparent-color": "Pipetta Trasparenza: 1) Clicca questo tasto, il cursore cambierà. 2) Poi clicca direttamente sul colore dell'immagine che vuoi rendere trasparente.",
            "btn-pick-bg-remove-color": "Pipetta Sfondo Auto: Clicca e poi clicca sul bordo esterno dell'immagine per indicare al programma qual è il colore di sfondo da rimuovere automaticamente.",
            "bg-remove-active": "Attiva/Disattiva Sfondo Auto: Accende o spegne la rimozione automatica dello sfondo. Quando è verde, il bordo dell'immagine viene reso trasparente in tempo reale.",
            "label-bg-remove-active": "Attiva Trasparenza Sfondo: Pulsante interruttore. Se è verde/acceso, il programma sta rimuovendo automaticamente il colore di sfondo dai bordi dell'immagine.",
            "filter-border-radius": "Smussa Angoli: Scrivi un numero per arrotondare gli angoli dell'immagine selezionata. 0 = angoli perfettamente quadrati, 50+ = angoli molto morbidi.",
            "btn-apply-corners": "Arrotonda: Applica il valore scelto per smussare gli angoli dell'immagine. L'effetto è visibile subito sulla tavola da disegno.",

            // SOSTITUZIONE COLORE
            "btn-add-replacement": "Aggiungi Sostituzione: Conferma e applica la sostituzione colore scelta. Da questo momento, tutti i pixel di quel colore saranno tinti con la nuova tinta scelta.",

            // TIMELINE CONTROLLI AVANZATI
            "btn-play-gif": "Play / Pausa: Avvia l'anteprima della tua animazione GIF. Clicca di nuovo per fermarla. Puoi vedere la GIF che si muove nella tavola da disegno!",
            "btn-apply-delay-all": "Applica a Tutti: Imposta la stessa durata in millisecondi a tutti i fotogrammi. Utile per uniformare la velocità dell'intera animazione.",
            "btn-duplicate-frame": "Duplica Frame: Crea una copia identica del fotogramma che stai guardando e la inserisce subito dopo. Utile per creare piccole variazioni a partire da un frame.",
            "btn-delete-frame": "Elimina Frame: Cancella definitivamente il fotogramma che hai selezionato. Attenzione: non si può recuperare!",
            "btn-reverse-frames": "Inverti Ordine: Capovolge l'ordine di tutti i fotogrammi, mettendo l'ultimo al posto del primo. Crea effetti di animazione a ritroso.",
            "btn-optimize-gif": "Ottimizza GIF ⚡: Analizza la tua animazione e rimuove i fotogrammi statici identici per ridurre il peso del file finale. Consigliato prima di esportare!",
            "timeline-delay": "Durata Frame (ms): Indica quanti millisecondi deve stare fermo ogni fotogramma prima di passare al successivo. 100ms = veloce, 500ms = mezzo secondo lento.",
            "timeline-speed-scale": "Velocità Anteprima: Cambia la velocità dell'anteprima nel programma (non influisce sulla GIF finale). 1x = normale, 2x = doppio rapido.",

            // KEYFRAME NAVIGATION
            "btn-goto-prev-keyframe": "Keyframe Precedente ◀: Salta al punto di animazione registrato precedente. Utile per navigare rapidamente tra i vari momenti animati.",
            "btn-add-keyframe": "Aggiungi Keyframe ◆: Registra manualmente la posizione attuale del livello in questo esatto fotogramma. Il programma userà questo punto come riferimento per l'animazione.",
            "btn-delete-keyframe": "Elimina Keyframe ✕: Rimuove il punto di animazione registrato nel fotogramma corrente. L'animazione non avrà più questo punto di riferimento.",
            "btn-goto-next-keyframe": "Keyframe Successivo ▶: Salta al punto di animazione registrato successivo. Utile per controllare il percorso dell'animazione.",
            "keyframe-target": "Livello da Animare: Scegli quale livello vuoi controllare con i keyframe. 'Principale' è la GIF caricata, 'Attivo' è il livello selezionato nella lista.",
            "kf-auto-keyframe": "Registrazione Automatica: Quando è spuntata, ogni volta che sposti, ruoti o cambi un livello, il programma registra automaticamente un keyframe per te.",
            "kf-prop-x": "Registra Posizione Orizzontale (X): Se spuntata, l'animazione terrà conto degli spostamenti sinistra-destra del livello.",
            "kf-prop-y": "Registra Posizione Verticale (Y): Se spuntata, l'animazione terrà conto degli spostamenti su-giù del livello.",
            "kf-prop-r": "Registra Rotazione (R): Se spuntata, l'animazione terrà conto delle rotazioni del livello (effetto girandola).",
            "kf-prop-opacity": "Registra Opacità (Op): Se spuntata, l'animazione terrà conto delle variazioni di trasparenza del livello (effetto dissolvenza).",
            "kf-prop-z": "Registra Profondità (Z): Se spuntata, anima la profondità del livello nel tempo (va avanti o indietro rispetto agli altri).",
            "kf-prop-w": "Registra Larghezza (W): Se spuntata, il livello può allargarsi e stringersi nel tempo come se venisse schiacciato.",
            "kf-prop-h": "Registra Altezza (H): Se spuntata, il livello può alzarsi e abbassarsi nel tempo come se venisse allungato.",

            // SEZIONI TIMELINE VISIBILI
            "timeline-frames-box": "Sequenza Fotogrammi: La fila di quadratini qui sotto rappresenta i fotogrammi della tua animazione. Clicca su uno per andare a quel momento.",
            "keyframes-track-box": "Traccia Keyframe: La fila qui sotto mostra i punti di animazione registrati. I rombi colorati indicano dove hai memorizzato una posizione o un effetto.",

            // SEZIONI PROGETTO VISIBILI
            "export-format": "Formato Esportazione: Scegli come salvare il tuo lavoro. PNG mantiene la trasparenza, JPG è una foto normale, GIF crea un'animazione."
        };

        if(!btnTutorial || !tooltip) return;

        btnTutorial.addEventListener("click", (e) => {
            isTutorialMode = !isTutorialMode;
            if(isTutorialMode) {
                document.body.classList.add("tutorial-mode");
                btnTutorial.classList.add("active-glow");
            } else {
                document.body.classList.remove("tutorial-mode");
                btnTutorial.classList.remove("active-glow");
                tooltip.classList.remove("show-tooltip");
            }
        });

        // Ascolta la pressione del tasto ESC per uscire
        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape" && isTutorialMode) {
                btnTutorial.click();
            }
        });

        let akiEasterEggClicks = 0;
        let akiBarVisible = false;

        // Intercetta tutti i click in fase di cattura
        document.addEventListener("click", (e) => {
            if(!isTutorialMode) return;
            
            // Trova l'elemento cliccato
            let target = e.target;
            
            // Se clicco proprio il tasto tutorial, lascialo funzionare per disattivare la modalità
            if(target.closest("#btn-tutorial-mode")) {
                return;
            }

            // Blocca il funzionamento normale dell'app
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // Cerca la spiegazione risalendo l'albero DOM
            let explanation = null;
            let currentElement = target;
            let elementTitle = "";

            // EASTER EGG AKI MODE
            let clickedThemeTitle = false;
            let tempElement = target;
            while(tempElement && tempElement !== document.body) {
                if(tempElement.id === "app-main-title") {
                    clickedThemeTitle = true; break;
                }
                tempElement = tempElement.parentElement;
            }

            if (clickedThemeTitle) {
                akiEasterEggClicks++;
                if (akiEasterEggClicks === 10 && !akiBarVisible) {
                    akiBarVisible = true;
                    const canvasWorkspace = document.querySelector('.canvas-workspace-wrapper');
                    const akiBar = document.createElement('div');
                    akiBar.id = "aki-secret-bar";
                    akiBar.style.position = "absolute";
                    akiBar.style.top = "50%";
                    akiBar.style.left = "50%";
                    akiBar.style.transform = "translate(-50%, -50%)";
                    akiBar.style.background = "rgba(0,0,0,0.85)";
                    akiBar.style.padding = "10px 20px";
                    akiBar.style.borderRadius = "8px";
                    akiBar.style.border = "1px solid var(--accent-color)";
                    akiBar.style.zIndex = "9999";
                    akiBar.style.display = "flex";
                    akiBar.style.gap = "10px";
                    akiBar.style.boxShadow = "0 4px 15px rgba(0,0,0,0.5)";
                    akiBar.innerHTML = `
                        <span style="color: var(--accent-color); font-weight: bold; font-size: 14px; line-height: 24px;">Code:</span>
                        <input type="text" id="aki-secret-input" placeholder="..." style="background: #111; color: white; border: 1px solid #333; padding: 4px 8px; border-radius: 4px; outline: none; width: 100px;">
                        <button id="aki-secret-submit" class="btn btn-accent btn-sm">Enter</button>
                    `;
                    canvasWorkspace.appendChild(akiBar);
                    // Disattiva modalita tutorial per poter scrivere
                    if (isTutorialMode) btnTutorial.click();

                    document.getElementById("aki-secret-submit").addEventListener("click", () => {
                        const val = document.getElementById("aki-secret-input").value.trim().toLowerCase();
                        if (val === "aki") {
                            akiBar.remove();
                            akiEasterEggClicks = 0;
                            akiBarVisible = false;
                            
                            // Disattiva e rimuovi Sind se esiste
                            const oldSindBtn = document.getElementById("btn-theme-sind");
                            if (oldSindBtn) oldSindBtn.remove();
                            document.body.classList.remove("sind-mode-active");
                            document.querySelectorAll(".sind-entity").forEach(f => f.remove());

                            const themesGrid = document.querySelector('.preset-theme-grid');
                            if (themesGrid && !document.getElementById("btn-theme-aki")) {
                                const akiBtn = document.createElement('button');
                                akiBtn.id = "btn-theme-aki";
                                akiBtn.className = "theme-btn";
                                akiBtn.innerText = "Aki Mode";
                                akiBtn.style.background = "linear-gradient(45deg, #ff0000, #00ff00, #0000ff)";
                                akiBtn.style.backgroundSize = "200% 200%";
                                akiBtn.style.color = "white";
                                akiBtn.style.fontWeight = "bold";
                                akiBtn.style.border = "2px solid #fff";
                                akiBtn.style.boxShadow = "0 0 10px #ff0000";
                                akiBtn.style.animation = "akiBtnAnim 2s linear infinite";
                                
                                akiBtn.addEventListener("click", () => {
                                    const allBtns = document.querySelectorAll('.preset-theme-grid .theme-btn');
                                    
                                    if(document.body.classList.contains("aki-mode-active")) {
                                        // Spegni Aki Mode e torna al default
                                        document.querySelector(".preset-theme-grid .theme-btn[data-theme='default']").click(); 
                                    } else {
                                        // Togli "active" da tutti gli altri temi
                                        allBtns.forEach(b => b.classList.remove('active'));
                                        // Metti "active" a questo
                                        akiBtn.classList.add('active');
                                        
                                        // Disattiva Sind se era attivo
                                        document.body.classList.remove("sind-mode-active");
                                        document.querySelectorAll(".sind-entity").forEach(f => f.remove());
                                        
                                        document.body.classList.add("aki-mode-active");
                                        
                                        // Helper per convertire HSL in RGB (necessario per --accent-color-rgb)
                                        const hslToRgbStr = (h, s, l) => {
                                            let r, g, b; h /= 360;
                                            if (s === 0) { r = g = b = l; } else {
                                                const hue2rgb = (p, q, t) => {
                                                    if (t < 0) t += 1; if (t > 1) t -= 1;
                                                    if (t < 1/6) return p + (q - p) * 6 * t;
                                                    if (t < 1/2) return q;
                                                    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                                                    return p;
                                                };
                                                const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                                                const p = 2 * l - q;
                                                r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
                                            }
                                            return Math.round(r * 255) + ", " + Math.round(g * 255) + ", " + Math.round(b * 255);
                                        };

                                        let hue = 0;
                                        if (window._akiInterval) clearInterval(window._akiInterval);
                                        
                                        window._akiInterval = setInterval(() => {
                                            hue = (hue + 1.5) % 360; // Velocità del loop RGB
                                            
                                            // Sfondo principale RGB sfumato a 3 colori (solo gradiente)
                                            document.documentElement.style.setProperty('--aki-bg', `linear-gradient(135deg, hsl(${hue}, 100%, 50%), hsl(${(hue + 45) % 360}, 100%, 50%), hsl(${(hue + 90) % 360}, 100%, 50%))`);
                                            document.documentElement.style.setProperty('--desktop-pattern', 'none'); 
                                            
                                            // Finestre ed Header semi-trasparenti
                                            document.documentElement.style.setProperty('--bg-window', `hsla(${(hue + 180) % 360}, 100%, 12%, 0.8)`);
                                            document.documentElement.style.setProperty('--bg-header', `hsla(${(hue + 200) % 360}, 100%, 10%, 0.9)`);
                                            
                                            // Testi RGB puri
                                            document.documentElement.style.setProperty('--text-main', `hsl(${hue}, 100%, 80%)`);
                                            document.documentElement.style.setProperty('--text-secondary', `hsl(${(hue + 60) % 360}, 100%, 65%)`);
                                            
                                            // Dettagli, accenti, bordi, ombre
                                            document.documentElement.style.setProperty('--border-window', `hsl(${(hue + 270) % 360}, 100%, 50%)`);
                                            document.documentElement.style.setProperty('--accent-color', `hsl(${(hue + 270) % 360}, 100%, 50%)`);
                                            document.documentElement.style.setProperty('--accent-color-rgb', hslToRgbStr((hue + 270) % 360, 1, 0.5));
                                        }, 35);
                                    }
                                });
                                themesGrid.appendChild(akiBtn);

                                if(!document.getElementById("aki-css-anim")) {
                                    const style = document.createElement('style');
                                    style.id = "aki-css-anim";
                                    style.innerHTML = `
                                        @keyframes akiBtnAnim { 
                                            0% { background-position: 0% 50%; box-shadow: 0 0 10px #ff0055; } 
                                            33% { background-position: 100% 50%; box-shadow: 0 0 10px #0055ff; }
                                            66% { background-position: 50% 100%; box-shadow: 0 0 10px #ffaa00; }
                                            100% { background-position: 0% 50%; box-shadow: 0 0 10px #ff0055; }
                                        }
                                        
                                        @keyframes akiHexAnim {
                                            from { background-position: 0 0; }
                                            to { background-position: 300px 300px; }
                                        }

                                        body.aki-mode-active #desktop {
                                            background-image: var(--aki-bg) !important;
                                            background-size: 100% 100% !important;
                                        }
                                        
                                        body.aki-mode-active #desktop::before {
                                            content: "";
                                            position: absolute;
                                            top: 0; left: 0; right: 0; bottom: 0;
                                            background-image: url('img/hexagon_grid.png');
                                            background-size: 300px 300px;
                                            background-repeat: repeat;
                                            mix-blend-mode: multiply;
                                            pointer-events: none;
                                            animation: akiHexAnim 25s linear infinite;
                                            z-index: 1;
                                            opacity: 0.9;
                                        }
                                    `;
                                    document.head.appendChild(style);
                                }
                            }
                        } else if (val === "sind") {
                            akiBar.remove();
                            akiEasterEggClicks = 0;
                            akiBarVisible = false;
                            
                            // Disattiva e rimuovi Aki se esiste
                            const oldAkiBtn = document.getElementById("btn-theme-aki");
                            if (oldAkiBtn) oldAkiBtn.remove();
                            if (window._akiInterval) clearInterval(window._akiInterval);
                            document.body.classList.remove("aki-mode-active");

                            const themesGrid = document.querySelector('.preset-theme-grid');
                            if (themesGrid && !document.getElementById("btn-theme-sind")) {
                                const sindBtn = document.createElement('button');
                                sindBtn.id = "btn-theme-sind";
                                sindBtn.className = "theme-btn";
                                sindBtn.innerText = "Sind Mode 🎣";
                                sindBtn.style.background = "linear-gradient(45deg, #001144, #00aaff)";
                                sindBtn.style.color = "white";
                                sindBtn.style.fontWeight = "bold";
                                sindBtn.style.border = "2px solid #00ffff";
                                sindBtn.style.animation = "sindBtnAnim 3s infinite";
                                
                                sindBtn.addEventListener("click", () => {
                                    const allBtns = document.querySelectorAll('.preset-theme-grid .theme-btn');
                                    
                                    if(document.body.classList.contains("sind-mode-active")) {
                                        document.querySelector(".preset-theme-grid .theme-btn[data-theme='default']").click(); 
                                    } else {
                                        if (window._akiInterval) clearInterval(window._akiInterval);
                                        document.body.classList.remove("aki-mode-active");
                                        
                                        allBtns.forEach(b => b.classList.remove('active'));
                                        sindBtn.classList.add('active');
                                        
                                        document.body.classList.add("sind-mode-active");
                                        
                                        // Crea l'acquario completo!
                                        document.querySelectorAll(".sind-entity").forEach(f => f.remove());
                                        const desktop = document.getElementById("desktop");
                                        const fishes = ['img/neon_fish.png', 'img/guppy_fish.png', 'img/neon_tetra.png'];
                                        
                                        // 1. Branco di pesci
                                        for(let i=0; i<12; i++) {
                                            const fish = document.createElement("div");
                                            fish.className = "sind-entity sind-fish";
                                            const img = fishes[Math.floor(Math.random() * fishes.length)];
                                            fish.style.backgroundImage = `url('${img}')`;
                                            
                                            let size = 100 + Math.random() * 100;
                                            if (img.includes("tetra")) size = 50 + Math.random() * 40;
                                            fish.style.width = `${size}px`;
                                            fish.style.height = `${size * 0.7}px`;
                                            fish.style.top = `${10 + Math.random() * 80}%`;
                                            
                                            const duration = 15 + Math.random() * 25;
                                            const delay = -(Math.random() * 30); 
                                            const dir = Math.random() > 0.5 ? "swimRight" : "swimLeft";
                                            
                                            fish.style.animation = `${dir} ${duration}s ease-in-out ${delay}s infinite`;
                                            fish.style.opacity = 0.6 + Math.random() * 0.4;
                                            desktop.appendChild(fish);
                                        }
                                        
                                        // 2. Bolle d'aria
                                        for(let i=0; i<35; i++) {
                                            const bubble = document.createElement("div");
                                            bubble.className = "sind-entity sind-bubble";
                                            const size = 4 + Math.random() * 12;
                                            bubble.style.width = `${size}px`;
                                            bubble.style.height = `${size}px`;
                                            bubble.style.left = `${Math.random() * 100}%`;
                                            
                                            const duration = 6 + Math.random() * 8;
                                            const delay = -(Math.random() * 15);
                                            bubble.style.animation = `bubbleRise ${duration}s ease-in ${delay}s infinite`;
                                            desktop.appendChild(bubble);
                                        }
                                        
                                        // 3. Pioggia e increspature in alto
                                        for(let i=0; i<20; i++) {
                                            const ripple = document.createElement("div");
                                            ripple.className = "sind-entity sind-ripple";
                                            ripple.style.left = `${Math.random() * 100}%`;
                                            ripple.style.top = `${Math.random() * 20}%`;
                                            
                                            const duration = 2 + Math.random() * 4;
                                            const delay = -(Math.random() * 6);
                                            ripple.style.animation = `rippleEffect ${duration}s linear ${delay}s infinite`;
                                            desktop.appendChild(ripple);
                                        }
                                    }
                                });
                                themesGrid.appendChild(sindBtn);

                                if(!document.getElementById("sind-css-anim")) {
                                    const style = document.createElement('style');
                                    style.id = "sind-css-anim";
                                    style.innerHTML = `
                                        @keyframes sindBtnAnim { 
                                            0% { box-shadow: 0 0 8px #00aaff; } 
                                            50% { box-shadow: 0 0 18px #00ffff; }
                                            100% { box-shadow: 0 0 8px #00aaff; }
                                        }
                                        
                                        @keyframes sindBgAnim {
                                            from { background-position: 0 0; }
                                            to { background-position: -400px 400px; }
                                        }

                                        body.sind-mode-active #desktop {
                                            background-image: url('img/sind_bg.png') !important;
                                            background-size: 250px 250px !important;
                                            background-repeat: repeat !important;
                                            background-color: #00122e !important;
                                            background-blend-mode: multiply !important;
                                            animation: sindBgAnim 30s linear infinite !important;
                                        }
                                        
                                        body.sind-mode-active .app-header,
                                        body.sind-mode-active #top-bar,
                                        body.sind-mode-active .window-panel,
                                        body.sind-mode-active .timeline-compact {
                                            background: rgba(0, 15, 40, 0.8) !important;
                                            backdrop-filter: blur(5px) !important;
                                            -webkit-backdrop-filter: blur(5px) !important;
                                            border-color: rgba(0, 255, 255, 0.3) !important;
                                            box-shadow: inset 0 0 20px rgba(0,255,255,0.05) !important;
                                        }

                                        body.sind-mode-active {
                                            --text-main: #cce5ff !important;
                                            --text-secondary: #70a1ff !important;
                                            --accent-color: #ff6a00 !important;
                                            --accent-color-rgb: 255, 106, 0 !important;
                                            --border-window: #ff6a00 !important;
                                        }
                                        
                                        body.sind-mode-active .btn-accent {
                                            background: linear-gradient(135deg, #ff4500, #ff8c00) !important;
                                            border: none !important;
                                            color: #fff !important;
                                        }
                                        
                                        .sind-fish {
                                            position: absolute;
                                            background-size: contain;
                                            background-repeat: no-repeat;
                                            background-position: center;
                                            mix-blend-mode: screen; 
                                            pointer-events: none; 
                                            z-index: 1; 
                                        }
                                        
                                        .sind-bubble {
                                            position: absolute;
                                            bottom: -20px;
                                            border: 1px solid rgba(255, 255, 255, 0.4);
                                            border-radius: 50%;
                                            pointer-events: none;
                                            z-index: 5;
                                        }
                                        
                                        .sind-ripple {
                                            position: absolute;
                                            border: 2px solid rgba(255, 255, 255, 0.2);
                                            border-radius: 50%;
                                            width: 40px;
                                            height: 40px;
                                            transform: scale(0) rotateX(70deg);
                                            pointer-events: none;
                                            z-index: 10;
                                        }

                                        /* Caustiche e Squalo Balena Gigante (Tramite pseudo-elementi del desktop) */
                                        body.sind-mode-active #desktop::before,
                                        body.sind-mode-active #desktop::after {
                                            content: "";
                                            position: absolute;
                                            top: 0; left: 0; right: 0; bottom: 0;
                                            pointer-events: none;
                                        }
                                        
                                        /* Raggi solari sott'acqua che illuminano pure i vetri dell'app! */
                                        body.sind-mode-active #desktop::before {
                                            background-image: url('img/light_caustics.png');
                                            background-size: 400px 400px;
                                            background-repeat: repeat;
                                            mix-blend-mode: color-dodge; /* Effetto luce estremo */
                                            opacity: 0.15;
                                            z-index: 9999; /* Sta SPRA tutte le finestre dell'app! */
                                            animation: causticsAnim 20s linear infinite;
                                        }
                                        
                                        /* Squalo Balena (Boss) sullo sfondo abissale */
                                        body.sind-mode-active #desktop::after {
                                            background-image: url('img/whale_shark.png');
                                            background-size: 1000px;
                                            background-repeat: no-repeat;
                                            mix-blend-mode: screen;
                                            opacity: 0.12; /* Lontanissimo in profondità */
                                            z-index: 0; /* Dietro ai pesciolini */
                                            animation: sharkSwim 80s linear infinite;
                                        }

                                        @keyframes swimRight {
                                            0% { left: -300px; transform: translateY(0px) scaleX(1); }
                                            30% { transform: translateY(-40px) scaleX(1); }
                                            70% { transform: translateY(30px) scaleX(1); }
                                            100% { left: 110vw; transform: translateY(-10px) scaleX(1); }
                                        }

                                        @keyframes swimLeft {
                                            0% { right: -300px; transform: translateY(0px) scaleX(-1); } 
                                            40% { transform: translateY(50px) scaleX(-1); }
                                            80% { transform: translateY(-20px) scaleX(-1); }
                                            100% { right: 110vw; transform: translateY(30px) scaleX(-1); }
                                        }
                                        
                                        @keyframes bubbleRise {
                                            0% { transform: translateY(0) scale(1); opacity: 0; }
                                            10% { opacity: 1; }
                                            100% { transform: translateY(-110vh) scale(1.5); opacity: 0; }
                                        }
                                        
                                        @keyframes rippleEffect {
                                            0% { transform: scale(0) rotateX(70deg); opacity: 0.8; }
                                            100% { transform: scale(3) rotateX(70deg); opacity: 0; }
                                        }
                                        
                                        @keyframes causticsAnim {
                                            from { background-position: 0 0; }
                                            to { background-position: -400px 400px; }
                                        }
                                        
                                        @keyframes sharkSwim {
                                            0% { background-position: 150vw 50%; }
                                            100% { background-position: -80vw 60%; }
                                        }
                                    `;
                                    document.head.appendChild(style);
                                }
                            }
                        } else {
                            akiBar.remove();
                            akiEasterEggClicks = 0;
                            akiBarVisible = false;
                        }
                    });
                    
                    return; // Ferma il click qui per evitare che il tooltip venga mostrato
                }
            } else {
                akiEasterEggClicks = 0;
            }

            while (currentElement && currentElement !== document.body) {
                let id = currentElement.id;
                let dataTab = currentElement.getAttribute("data-tab"); // per i tab
                
                // Controlla dizionario tramite ID o attributo tab
                if (id && tutorialDict[id]) {
                    explanation = tutorialDict[id];
                    break;
                }
                if (dataTab && tutorialDict[dataTab]) {
                    explanation = tutorialDict[dataTab];
                    break;
                }
                // Controlla se siamo su un tab-content
                if (currentElement.classList.contains("tab-content") && tutorialDict[id]) {
                    explanation = tutorialDict[id];
                    break;
                }

                currentElement = currentElement.parentElement;
            }

            if (!explanation) {
                explanation = "Clicca su uno strumento o su una linguetta per scoprire a cosa serve!";
            } else {
                let splitParts = explanation.split(":");
                if(splitParts.length > 1) {
                    elementTitle = splitParts[0].trim();
                    explanation = splitParts.slice(1).join(":").trim();
                }
            }

            // Mostra il tooltip
            tooltip.innerHTML = (elementTitle ? `<strong>${elementTitle}</strong>` : "") + explanation;
            
            // Posiziona il tooltip vicino al mouse
            let x = e.clientX + 15;
            let y = e.clientY + 15;

            // Evita che il tooltip esca dallo schermo
            let tooltipWidth = 300; // larghezza massima da CSS
            let tooltipHeight = 100; // altezza approssimativa
            if(x + tooltipWidth > window.innerWidth) x = window.innerWidth - tooltipWidth - 20;
            if(y + tooltipHeight > window.innerHeight) y = e.clientY - tooltipHeight - 20;

            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
            tooltip.classList.add("show-tooltip");

        }, true);
    }

    // ======================================================================
    // LOGICA PANNELLO DEBUG / TESTER
    // ======================================================================
    function initDebugPanel() {
        const winDebug = document.getElementById('win-debug');
        const btnCloseDebug = document.getElementById('btn-close-debug');
        const autoAdaptCheck = document.getElementById('debug-auto-adapt');
        const zoomSlider = document.getElementById('debug-zoom-slider');
        const zoomInput = document.getElementById('debug-zoom-input');
        const canvasW = document.getElementById('debug-canvas-w');
        const canvasH = document.getElementById('debug-canvas-h');
        const imgX = document.getElementById('debug-img-x');
        const imgY = document.getElementById('debug-img-y');

        if (!winDebug) return;

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
                e.preventDefault();
                winDebug.style.display = winDebug.style.display === 'none' ? 'flex' : 'none';
                if (window.updateDebugPanelUI) window.updateDebugPanelUI();
            }
        });

        btnCloseDebug.addEventListener('click', () => {
            winDebug.style.display = 'none';
        });

        autoAdaptCheck.addEventListener('change', (e) => {
            state.autoAdaptGrid = e.target.checked;
        });

        zoomSlider.addEventListener('input', (e) => {
            const z = parseFloat(e.target.value);
            zoomInput.value = z.toFixed(1);
            adjustZoom(z);
        });

        zoomInput.addEventListener('input', (e) => {
            const z = parseFloat(e.target.value);
            if(!isNaN(z)) {
                zoomSlider.value = z;
                adjustZoom(z);
            }
        });

        canvasW.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if(!isNaN(val)) {
                applyWorkspaceDimensions(val, state.canvasHeight);
            }
        });

        canvasH.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if(!isNaN(val)) {
                applyWorkspaceDimensions(state.canvasWidth, val);
            }
        });

        imgX.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if(!isNaN(val) && state.activeLayerId) {
                const frame = state.frames[state.activeFrameIndex];
                const layer = frame.layers.find(l => l.id === state.activeLayerId);
                if (layer) { layer.x = val; requestRender(); }
            }
        });

        imgY.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if(!isNaN(val) && state.activeLayerId) {
                const frame = state.frames[state.activeFrameIndex];
                const layer = frame.layers.find(l => l.id === state.activeLayerId);
                if (layer) { layer.y = val; requestRender(); }
            }
        });

        window.updateDebugPanelUI = function() {
            if (winDebug.style.display === 'none') return;
            autoAdaptCheck.checked = state.autoAdaptGrid;
            if(document.activeElement !== zoomSlider && document.activeElement !== zoomInput) {
                zoomSlider.value = state.zoom;
                zoomInput.value = state.zoom.toFixed(1);
            }
            if(document.activeElement !== canvasW) canvasW.value = state.canvasWidth;
            if(document.activeElement !== canvasH) canvasH.value = state.canvasHeight;
            
            if (state.activeLayerId) {
                const frame = state.frames[state.activeFrameIndex];
                if(frame) {
                    const layer = frame.layers.find(l => l.id === state.activeLayerId);
                    if (layer) {
                        if(document.activeElement !== imgX) imgX.value = Math.round(layer.x);
                        if(document.activeElement !== imgY) imgY.value = Math.round(layer.y);
                    }
                }
            }
        };
    }

    initTabOrderSystem();
    initInteractiveTutorial();
    initDebugPanel();
    startApp();
});
