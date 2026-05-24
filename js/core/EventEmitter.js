/**
 * Sistema di comunicazione globale tra le "Famiglie" (Componenti).
 * Permette ai moduli di inviare messaggi (emit) e ascoltare (on)
 * senza conoscersi direttamente, garantendo l'indipendenza.
 */
class EventEmitter {
    constructor() {
        this.events = {};
    }

    on(event, listener) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
        return () => this.off(event, listener);
    }

    off(event, listener) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(l => l !== listener);
    }

    emit(event, payload) {
        if (!this.events[event]) return;
        this.events[event].forEach(listener => listener(payload));
    }
}

export const eventBus = new EventEmitter();
