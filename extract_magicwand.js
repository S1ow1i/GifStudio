const fs = require('fs');

const magicWandToolCode = `import { state } from '../core/State.js';
import { dom } from '../core/DOM.js';
import { eventBus } from '../core/EventEmitter.js';

export class MagicWandTool {
    constructor() {
        this.bindEvents();
    }

    bindEvents() {
        if (!dom.drawMagicWand) return;
        
        if (dom.magicWandTolerance) {
            dom.magicWandTolerance.addEventListener("input", (e) => {
                state.magicWandTolerance = parseInt(e.target.value) || 20;
                if (dom.magicWandToleranceText) {
                    dom.magicWandToleranceText.textContent = state.magicWandTolerance;
                }
            });
        }
        
        if (dom.btnRemoveProtectionMask) {
            dom.btnRemoveProtectionMask.addEventListener("click", () => {
                state.protectionMask = null;
                eventBus.emit("requestRender");
            });
        }
    }

    onMouseDown(coords, layer) {
        if (!layer) return;
        eventBus.emit("magicWandCommand", { coords, layer });
    }
}
export const magicWandTool = new MagicWandTool();
`;

fs.writeFileSync('js/tools/MagicWandTool.js', magicWandToolCode);
console.log('MagicWandTool created!');
