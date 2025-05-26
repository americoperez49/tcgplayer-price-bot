import dotenv from "dotenv"
dotenv.config() // Load environment variables first

import { config, MonitoredItem } from "./config" // Import MonitoredItem interface
import { Client, GatewayIntentBits, TextChannel } from "discord.js"
import puppeteer from "puppeteer" // Import puppeteer
import { PrismaClient } from "@prisma/client" // Import PrismaClient

const prisma = new PrismaClient() // Instantiate PrismaClient

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
})

async function fetchPrice(url: string): Promise<number | null> {
  let browser
  try {
    browser = await puppeteer.launch({ headless: false }) // Use true for headless mode
    const page = await browser.newPage()
    await page.goto(url) // Use the passed URL
    await new Promise((resolve) => setTimeout(resolve, 3000)) // Wait for 3 seconds as requested by the user

    // Wait for the price element to be available (still good to have this as a fallback/confirmation)
    await page.waitForSelector("span.spotlight__price", { timeout: 5000 }) // Reduced timeout as we already waited

    const priceText = await page.evaluate(() => {
      const element = document.querySelector(".spotlight__price")
      return element ? element.textContent : null
    })

    console.log(`Raw price text found: ${priceText}`)

    if (priceText) {
      const match = priceText.match(/\$([0-9]+\.?[0-9]*)/)
      if (match && match[1]) {
        const price = parseFloat(match[1])
        return price
      }
    }

    console.warn(`Could not find price on TCGPlayer page for URL: ${url}.`)
    return null
  } catch (error) {
    console.error(`Error fetching price from TCGPlayer for URL: ${url}:`, error)
    return null
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

async function checkPriceAndNotify() {
  if (config.MONITORED_ITEMS.length === 0) {
    console.warn(
      "No items configured for monitoring. Please check MONITORED_ITEMS_JSON in your .env file."
    )
    return
  }

  for (const item of config.MONITORED_ITEMS) {
    const timestamp = new Date().toLocaleString()
    console.log(`[${timestamp}] Checking price for: ${item.name} (${item.url})`)
    const currentPrice = await fetchPrice(item.url)

    if (currentPrice === null) {
      console.log(
        `[${timestamp}] Failed to get current price for ${item.name}. Skipping notification.`
      )
      continue // Move to the next item
    }

    console.log(
      `[${timestamp}] Current price for ${item.name}: $${currentPrice}`
    )

    // Save price to database
    try {
      await prisma.itemPrice.create({
        data: {
          name: item.name,
          url: item.url,
          price: currentPrice,
          timestamp: new Date(),
        },
      })
      console.log(`[${timestamp}] Price for ${item.name} saved to database.`)
    } catch (dbError) {
      console.error(
        `[${timestamp}] Error saving price for ${item.name} to database:`,
        dbError
      )
    }

    if (currentPrice < item.threshold) {
      console.log(
        `[${timestamp}] Price $${currentPrice} for ${item.name} is below threshold $${item.threshold}. Sending alert.`
      )
      const channel = (await client.channels.fetch(
        config.CHANNEL_ID
      )) as TextChannel
      if (channel) {
        await channel.send(
          `🚨 PRICE ALERT! 🚨\n` +
            `Item: ${item.name}\n` +
            `The price has dropped to $${currentPrice}!\n` +
            `Threshold: $${item.threshold}\n` +
            `Link: ${item.url}`
        )
      } else {
        console.error(`Could not find channel with ID: ${config.CHANNEL_ID}`)
      }
    } else {
      console.log(
        `[${timestamp}] Price $${currentPrice} for ${item.name} is above or equal to threshold $${item.threshold}. No alert needed.`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 5000)) // Wait for 5 seconds between items
  }
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user?.tag}!`)
  console.log("Starting price monitoring...")
  checkPriceAndNotify() // Initial check
  setInterval(checkPriceAndNotify, config.POLLING_INTERVAL_MS)
})

console.log("Logging in to Discord...")
client.login(config.DISCORD_TOKEN)
