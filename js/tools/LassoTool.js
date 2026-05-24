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
        
        if (dom.btnLassoCut) dom.btnLassoCut.addEventListener("click", () => this.cutSelection());
        if (dom.btnLassoClear) dom.btnLassoClear.addEventListener("click", () => this.clearSelection());
    }

    setMode(mode) {
        state.lasso.mode = mode;
        if (dom.lassoModeFree) dom.lassoModeFree.classList.toggle("active", mode === "free");
        if (dom.lassoModeRect) dom.lassoModeRect.classList.toggle("active", mode === "rect");
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
        state.lasso.points = [{ x: coords.x, y: coords.y }];
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
