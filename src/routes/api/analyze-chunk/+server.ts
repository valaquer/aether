import { json } from '@sveltejs/kit';
import { getMessages } from '$lib/server/aether-db';
import { sendToKitty, isTabAlive } from '$lib/server/kitten';

export async function POST({ request }: { request: Request }) {
	try {
		const { roomId, messageId } = await request.json();

		if (!roomId || !messageId) {
			return json({ error: 'Missing roomId or messageId' }, { status: 400 });
		}

		// Get all conversational messages in the room
		const allMessages = getMessages(roomId).filter(
			(m: { sender: string; toolCall?: boolean }) =>
				m.sender !== 'system' && !m.toolCall
		);

		if (allMessages.length === 0) {
			return json({ error: 'No messages found' }, { status: 404 });
		}

		// Find the clicked message
		const clickedIdx = allMessages.findIndex((m: { id: string }) => m.id === messageId);
		if (clickedIdx === -1) {
			return json({ error: 'Message not found' }, { status: 404 });
		}

		// Find the Boss message that anchors this chunk
		// Walk backwards from the clicked message to find the nearest Boss message
		let anchorIdx = clickedIdx;
		while (anchorIdx >= 0 && allMessages[anchorIdx].sender !== 'boss') {
			anchorIdx--;
		}
		if (anchorIdx < 0) {
			return json({ error: 'No Boss message found before this point in the conversation.' }, { status: 400 });
		}

		// Find the end of the chunk -- next Boss message after anchor, or end of messages
		let endIdx = anchorIdx + 1;
		while (endIdx < allMessages.length && allMessages[endIdx].sender !== 'boss') {
			endIdx++;
		}

		// Extract the chunk
		const chunk = allMessages.slice(anchorIdx, endIdx);

		if (chunk.length === 0) {
			return json({ error: 'Empty chunk' }, { status: 400 });
		}

		// Format the chunk for Jeh
		const header = `[huddle-room: ${roomId}]`;
		const body = chunk
			.map((m: { sender: string; content: string }) => `${m.sender}: ${m.content}`)
			.join('\n\n');
		const payload = `${header}\n\n${body}`;

		// Check if Jeh is alive
		const jehAlive = await isTabAlive('jeh');
		if (!jehAlive) {
			return json({ error: 'Jeh is not running. Launch him first.' }, { status: 503 });
		}

		// Send to Jeh via sendToKitty
		await sendToKitty('jeh', {
			sender: 'aether',
			room: `direct-jeh`,
			body: payload,
			timestamp: new Date().toISOString()
		});

		return json({
			status: 'sent',
			chunkSize: chunk.length,
			anchor: chunk[0].sender + ': ' + chunk[0].content.substring(0, 80)
		});
	} catch (e) {
		console.error('[analyze-chunk]', e);
		return json({ error: 'Internal error' }, { status: 500 });
	}
}
