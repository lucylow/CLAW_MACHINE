export type EventListener<T = any> = (data: T) => void | Promise<void>;

/**
 * Enhanced Type-Safe EventEmitter for Agent Lifecycle.
 */
export class EventEmitter {
    private listeners: Map<string, Set<EventListener>>;

    constructor() {
        this.listeners = new Map();
    }

    /**
     * Subscribe to an event with automatic cleanup.
     */
    on<T = any>(event: string, listener: EventListener<T>): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);
        return () => this.off(event, listener);
    }

    /**
     * Subscribe to an event once.
     */
    once<T = any>(event: string, listener: EventListener<T>): void {
        const wrapper = (data: T) => {
            this.off(event, wrapper);
            return listener(data);
        };
        this.on(event, wrapper);
    }

    /**
     * Unsubscribe a specific listener.
     */
    off<T = any>(event: string, listener: EventListener<T>): void {
        this.listeners.get(event)?.delete(listener);
        if (this.listeners.get(event)?.size === 0) {
            this.listeners.delete(event);
        }
    }

    /**
     * Emit an event and await all async listeners safely.
     */
    async emit<T = any>(event: string, data: T): Promise<void> {
        const eventListeners = this.listeners.get(event);
        if (!eventListeners) return;

        const executions = Array.from(eventListeners).map(async (listener) => {
            try {
                await listener(data);
            } catch (error) {
                console.error(`[EventEmitter] Error in listener for "${event}":`, error);
            }
        });

        await Promise.allSettled(executions);
    }

    /**
     * Clear all listeners for an event or the entire emitter.
     */
    clear(event?: string): void {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }

    /**
     * Returns the count of active listeners for an event.
     */
    listenerCount(event: string): number {
        return this.listeners.get(event)?.size || 0;
    }
}
