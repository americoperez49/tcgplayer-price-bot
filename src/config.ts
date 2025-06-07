export const config = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || "",
  CHANNEL_ID: process.env.CHANNEL_ID || "",
  CLIENT_ID: process.env.CLIENT_ID || "",
  POLLING_INTERVAL_MS: parseInt(
    process.env.POLLING_INTERVAL_MS || (60 * 60 * 1000).toString(),
    10
  ), // Default to 1 hour if not set
  API_PORT: parseInt(process.env.API_PORT || "8080", 10), // Default to 8080 for Cloud Run
}
