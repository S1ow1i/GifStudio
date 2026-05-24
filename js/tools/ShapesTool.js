import { state } from '../core/State.js';
import { dom } from '../core/DOM.js';
import { eventBus } from '../core/EventEmitter.js';
import { generateId } from '../core/Utils.js';

export class ShapesTool {
    constructor() {
        this.bindEvents();
    }

    bindEvents() {
        if (!dom.drawToolShapes) return;
        
        if (dom.shapeTypeRect) dom.shapeTypeRect.addEventListener("click", () => this.setType("rect"));
        if (dom.shapeTypeCircle) dom.shapeTypeCircle.addEventListener("click", () => this.setType("circle"));
        if (dom.shapeTypeLine) dom.shapeTypeLine.addEventListener("click", () => this.setType("line"));

        if (dom.shapeStrokeWidth) dom.shapeStrokeWidth.addEventListener("input", (e) => state.shapes.strokeWidth = parseInt(e.target.value) || 2);
        if (dom.shapeStrokeColor) dom.shapeStrokeColor.addEventListener("input", (e) => state.shapes.strokeColor = e.target.value);
        if (dom.shapeFillEnabled) dom.shapeFillEnabled.addEventListener("change", (e) => state.shapes.fillEnabled = e.target.checked);
        if (dom.shapeFillColor) dom.shapeFillColor.addEventListener("input", (e) => state.shapes.fillColor = e.target.value);
    }

    setType(type) {
        state.shapes.type = type;
        if (dom.shapeTypeRect) dom.shapeTypeRect.classList.toggle("active", type === "rect");
        if (dom.shapeTypeCircle) dom.shapeTypeCircle.classList.toggle("active", type === "circle");
        if (dom.shapeTypeLine) dom.shapeTypeLine.classList.toggle("active", type === "line");
    }

    onMouseDown(coords) {
        state.shapes.isDrawing = true;
        state.shapes.startX = coords.x;
        state.shapes.startY = coords.y;
        state.shapes.currentX = coords.x;
        state.shapes.currentY = coords.y;
        eventBus.emit("requestRender");
    }

    onMouseMove(coords) {
        if (!state.shapes.isDrawing) return;
        state.shapes.currentX = coords.x;
        state.shapes.currentY = coords.y;
        eventBus.emit("requestRender");
    }

    onMouseUp(coords, createLayerCallback) {
        if (!state.shapes.isDrawing) return;
        state.shapes.isDrawing = false;
        const sx = state.shapes.startX;
        const sy = state.shapes.startY;
        const ex = state.shapes.currentX;
        const ey = state.shapes.currentY;

        if (Math.abs(ex - sx) < 3 && Math.abs(ey - sy) < 3) {
            eventBus.emit("requestRender");
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
        sCtx.lineWidth = state.shapes.strokeWidth;
        sCtx.fillStyle = state.shapes.fillColor;
        const fill = state.shapes.fillEnabled;
        
        sCtx.beginPath();
        if (state.shapes.type === "rect") {
            sCtx.rect(pad, pad, w, h);
            if (fill) sCtx.fill();
            sCtx.stroke();
        } else if (state.shapes.type === "circle") {
            const rx = w / 2;
            const ry = h / 2;
            sCtx.ellipse(pad + rx, pad + ry, rx, ry, 0, 0, Math.PI * 2);
            if (fill) sCtx.fill();
            sCtx.stroke();
        } else if (state.shapes.type === "line") {
            const lineStartX = sx < ex ? pad : w + pad;
            const lineStartY = sy < ey ? pad : h + pad;
            const lineEndX = sx < ex ? w + pad : pad;
            const lineEndY = sy < ey ? h + pad : pad;
            sCtx.moveTo(lineStartX, lineStartY);
            sCtx.lineTo(lineEndX, lineEndY);
            sCtx.stroke();
        }
        
        createLayerCallback(shapeCanvas, minX - pad, minY - pad, shapeCanvas.width, shapeCanvas.height);
        eventBus.emit("requestRender");
    }
}
export const shapesTool = new ShapesTool();
