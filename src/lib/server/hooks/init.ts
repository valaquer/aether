import { config, ready } from "$lib/server/config";
import { logger } from "$lib/server/logger";
import { initExitHandler } from "$lib/server/exitHandler";
import { checkAndRunMigrations } from "$lib/migrations/migrations";
import { refreshConversationStats } from "$lib/jobs/refresh-conversation-stats";
import { loadMcpServersOnStartup } from "$lib/server/mcp/registry";
import { AbortedGenerations } from "$lib/server/abortedGenerations";
import { adminTokenManager } from "$lib/server/adminToken";
import { MetricsServer } from "$lib/server/metrics";

export async function initServer(): Promise<void> {
	// Wait for config to be fully loaded
	await ready;

	// Ensure legacy env expected by some libs: map OPENAI_API_KEY -> HF_TOKEN if absent
	const canonicalToken = config.OPENAI_API_KEY || config.HF_TOKEN;
	if (canonicalToken) {
		process.env.HF_TOKEN ??= canonicalToken;
	}

	// Warn if legacy-only var is used
	if (!config.OPENAI_API_KEY && config.HF_TOKEN) {
		logger.warn(
			"HF_TOKEN is deprecated in favor of OPENAI_API_KEY. Please migrate to OPENAI_API_KEY."
		);
	}

	logger.info("Starting server...");
	initExitHandler();

	if (config.METRICS_ENABLED === "true") {
		MetricsServer.getInstance();
	}

	// MongoDB migrations + stats skipped — Aether uses SQLite (aether-db.ts), not MongoDB
	// checkAndRunMigrations();
	// refreshConversationStats();

	// Load MCP servers at startup
	loadMcpServersOnStartup();

	// Start harness reader — watches OpenCode SQLite DB for terminal chatter + tool calls
	const { startHarnessReader } = await import("$lib/server/harness-reader");
	startHarnessReader();

	// Init AbortedGenerations refresh process
	AbortedGenerations.getInstance();

	adminTokenManager.displayToken();

	if (config.EXPOSE_API) {
		logger.warn(
			"The EXPOSE_API flag has been deprecated. The API is now required for chat-ui to work."
		);
	}
}
