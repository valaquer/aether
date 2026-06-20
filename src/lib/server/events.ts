import { EventEmitter } from "events";

export interface FacadeEvent {
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

globalThis.__facadeEmitter ??= new EventEmitter();
globalThis.__facadeEmitter.setMaxListeners(100);

export function emitEvent(event: FacadeEvent): void {
	globalThis.__facadeEmitter.emit("facade-event", event);
}

export function onEvent(listener: (event: FacadeEvent) => void): () => void {
	globalThis.__facadeEmitter.on("facade-event", listener);
	return () => {
		globalThis.__facadeEmitter.off("facade-event", listener);
	};
}
