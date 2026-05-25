import { generateId } from './Utils.js';

export const state = {
        canvasWidth: 800,
        canvasHeight: 600,
        zoom: 1.0,
        gridActive: false,
        autoAdaptGrid: true, // Flag per il pannello di debug tester
        
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
        activeTool: "select", // "select" (sposta), "brush" (pennello), "eraser" (gomma), "picker" (copia colore), "magic_wand"
        eraserMode: "brush", // "brush" (tratti) o "gif" (pixel sfondo GIF)
        editScope: "local", // "local" (solo frame corrente) o "global" (tutta la gif)
        colorReplacements: [], // lista sostituzioni globali
        magicWandTolerance: 20,
        protectionMask: null, // Maschera di protezione calcolata dalla bacchetta magica
        history: {
            past: [],
            future: []
        },
        brush: {
            size: 5,
            color: "#00ffcc",
            hardness: 100,
            isDrawing: false,
            lastX: 0,
            lastY: 0
        },
        shapes: {
            type: "rect",
            strokeColor: "#00ffcc",
            strokeWidth: 2,
            fillEnabled: false,
            fillColor: "#1e1e24",
            isDrawing: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0
        },
        lasso: {
            mode: "free",
            isDrawing: false,
            hasSelection: false,
            points: [],
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0
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
        colorPickerTarget: "brush", // "brush", "chroma", "replace-from", "replace-to", "bg-remove", "bg-transparent-pick"
        lastPickedTransparencyCoords: null,
        exportDirectoryHandle: null,
        autoKeyframe: true
    };
