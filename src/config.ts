export interface MonitoredItem {
  name: string
  url: string
  threshold: number
}

function parseMonitoredItems(): MonitoredItem[] {
  const jsonString = process.env.MONITORED_ITEMS_JSON
  if (!jsonString) {
    console.warn(
      "MONITORED_ITEMS_JSON not found in .env. No items will be monitored."
    )
    return []
  }
  try {
    const items = JSON.parse(jsonString)
    if (!Array.isArray(items)) {
      console.error("MONITORED_ITEMS_JSON is not a valid JSON array.")
      return []
    }
    // Basic validation for each item
    return items.filter(
      (item) =>
        typeof item.name === "string" &&
        typeof item.url === "string" &&
        typeof item.threshold === "number"
    )
  } catch (error) {
    console.error("Error parsing MONITORED_ITEMS_JSON:", error)
    return []
  }
}

export const config = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || "",
  CHANNEL_ID: process.env.CHANNEL_ID || "",
  POLLING_INTERVAL_MS: parseInt(
    process.env.POLLING_INTERVAL_MS || (60 * 60 * 1000).toString(),
    10
  ), // Default to 1 hour if not set
  MONITORED_ITEMS: parseMonitoredItems(),
}
