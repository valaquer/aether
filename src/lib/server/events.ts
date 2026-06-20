import { EventEmitter } from "events";

export interface AetherEvent {
	type: "message" | "huddle_update" | "mute_update";
	id?: string;
	conversationId?: string;
	sender?: string;
	content?: string;
	timestamp?: string;
	toolCall?: boolean;
	response?: boolean;
	summary?: string;
}

globalThis.__aetherEmitter ??= new EventEmitter();
globalThis.__aetherEmitter.setMaxListeners(100);

export function emitEvent(event: AetherEvent): void {
	globalThis.__aetherEmitter.emit("aether-event", event);
}

export function onEvent(listener: (event: AetherEvent) => void): () => void {
	globalThis.__aetherEmitter.on("aether-event", listener);
	return () => {
		globalThis.__aetherEmitter.off("aether-event", listener);
	};
}
