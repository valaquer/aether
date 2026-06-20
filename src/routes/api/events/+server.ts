import type { RequestHandler } from "./$types";
import { onEvent } from "$lib/server/events";

export const GET: RequestHandler = async ({ request }) => {
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;

			function cleanup() {
				if (closed) return;
				closed = true;
				unsubscribe();
				try {
					controller.close();
				} catch {
					// already closed
				}
			}

			function safeEnqueue(data: string) {
				if (closed || request.signal.aborted) {
					cleanup();
					return;
				}
				try {
					controller.enqueue(encoder.encode(data));
				} catch {
					cleanup();
				}
			}

			const unsubscribe = onEvent((event) => {
				safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
			});

			safeEnqueue(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

			request.signal.addEventListener("abort", cleanup);
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
};
