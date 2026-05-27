import { state } from '../core/State.js';
import { dom } from '../core/DOM.js';
import { eventBus } from '../core/EventEmitter.js';
import { generateId } from '../core/Utils.js';

export class LassoTool {
    constructor() {
        this.bindEvents();
    }

    bindEvents() {
        if (!dom.drawToolLasso) return;
        
        if (dom.lassoModeFree) dom.lassoModeFree.addEventListener("click", () => this.setMode("free"));
        if (dom.lassoModeRect) dom.lassoModeRect.addEventListener("click", () => this.setMode("rect"));
        if (dom.lassoModeCircle) dom.lassoModeCircle.addEventListener("click", () => this.setMode("circle"));
        // Nota: btnLassoCut e btnLassoClear sono gestiti direttamente in app.js
    }

    setMode(mode) {
        state.lasso.mode = mode;
        if (dom.lassoModeFree) dom.lassoModeFree.classList.toggle("active", mode === "free");
        if (dom.lassoModeRect) dom.lassoModeRect.classList.toggle("active", mode === "rect");
        if (dom.lassoModeCircle) dom.lassoModeCircle.classList.toggle("active", mode === "circle");
    }

    cutSelection() {
        if (!state.lasso.hasSelection || state.lasso.points.length < 3) return;
        eventBus.emit("lassoCommand", { action: "cut" });
    }

    clearSelection() {
        if (!state.lasso.hasSelection || state.lasso.points.length < 3) return;
        eventBus.emit("lassoCommand", { action: "clear" });
    }

    onMouseDown(coords) {
        state.lasso.isDrawing = true;
        state.lasso.hasSelection = false;
        state.lasso.ellipse = null;
        // Per i modi rect e circle i punti vengono generati al mouseup
        // Per il modo free partiamo già con il primo punto
        state.lasso.points = state.lasso.mode === "free"
            ? [{ x: coords.x, y: coords.y }]
            : [];
        state.lasso.startX = coords.x;
        state.lasso.startY = coords.y;
        state.lasso.currentX = coords.x;
        state.lasso.currentY = coords.y;
        eventBus.emit("requestRender");
    }

    onMouseMove(coords) {
        if (!state.lasso.isDrawing) return;
        state.lasso.currentX = coords.x;
        state.lasso.currentY = coords.y;
        if (state.lasso.mode === "free") {
            state.lasso.points.push({ x: coords.x, y: coords.y });
        }
        eventBus.emit("requestRender");
    }

    onMouseUp(coords) {
        if (!state.lasso.isDrawing) return;
        state.lasso.isDrawing = false;

        if (state.lasso.mode === "rect") {
            const sx = state.lasso.startX;
            const sy = state.lasso.startY;
            const ex = state.lasso.currentX;
            const ey = state.lasso.currentY;
            state.lasso.points = [
                { x: sx, y: sy },
                { x: ex, y: sy },
                { x: ex, y: ey },
                { x: sx, y: ey }
            ];
            state.lasso.ellipse = null;
        } else if (state.lasso.mode === "circle") {
            // Genera i punti del percorso ellittico perfetto (64 campioni)
            const sx = state.lasso.startX;
            const sy = state.lasso.startY;
            const ex = state.lasso.currentX;
            const ey = state.lasso.currentY;
            const cx = (sx + ex) / 2;
            const cy = (sy + ey) / 2;
            const rx = Math.abs(ex - sx) / 2;
            const ry = Math.abs(ey - sy) / 2;
            if (rx > 1 && ry > 1) {
                const STEPS = 64;
                state.lasso.points = [];
                for (let i = 0; i < STEPS; i++) {
                    const angle = (2 * Math.PI * i) / STEPS;
                    state.lasso.points.push({
                        x: cx + rx * Math.cos(angle),
                        y: cy + ry * Math.sin(angle)
                    });
                }
                // Salva i parametri ellisse per un clip preciso nei handler di taglio
                state.lasso.ellipse = { cx, cy, rx, ry };
            } else {
                state.lasso.points = [];
                state.lasso.ellipse = null;
            }
        }

        if (state.lasso.points.length > 2) {
            state.lasso.hasSelection = true;
        } else {
            state.lasso.hasSelection = false;
            state.lasso.points = [];
        }
        eventBus.emit("requestRender");
    }
}
export const lassoTool = new LassoTool();
