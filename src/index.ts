import dotenv from "dotenv"
dotenv.config() // Load environment variables first

import { config } from "./config" // Import config
import {
  GatewayIntentBits,
  TextChannel,
  Collection, // Keep Collection if it's used elsewhere for commands
  Events, // Keep Events if it's used elsewhere
  MessageFlags, // Import MessageFlags
} from "discord.js"
import { CustomClient } from "./CustomClient" // Import CustomClient
import puppeteer from "puppeteer" // Import puppeteer
import { PrismaClient } from "@prisma/client" // Import PrismaClient
import path from "path"
import fs from "fs"

const prisma = new PrismaClient() // Instantiate PrismaClient

const client = new CustomClient({
  // Use CustomClient
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
})

setupCommands() // Setup commands after CustomClient is instantiated
// client.commands is now initialized in CustomClient constructor

function setupCommands() {
  const foldersPath = path.join(__dirname, "discord_bot_commands") // Corrected path
  const commandFolders = fs.readdirSync(foldersPath)

  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder)
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".js"))
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file)
      const command = require(filePath).default // Access the default export
      // Set a new item in the Collection with the key as the command name and the value as the exported module
      if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command)
      } else {
        console.log(
          `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
        )
      }
    }
  }
}

async function fetchPrice(url: string): Promise<number | null> {
  let browser
  try {
    browser = await puppeteer.launch({ headless: false }) // Use true for headless mode
    const page = await browser.newPage()
    await page.goto(url) // Use the passed URL
    await new Promise((resolve) => setTimeout(resolve, 6000)) // Wait for 6 seconds as requested by the user

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
  // Fetch all items to monitor from the database (threshold is now a required field)
  const itemsToMonitor = await prisma.monitoredItem.findMany()

  if (itemsToMonitor.length === 0) {
    console.warn(
      "No items with a price threshold configured in the database. Please add items to the 'monitored_items' table with a 'threshold' value to monitor them."
    )
    return
  }

  for (const item of itemsToMonitor) {
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

    // Only alert if currentPrice is below the item's threshold
    if (currentPrice < item.threshold) {
      // threshold is now required, so no need for null check
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

client.on(Events.InteractionCreate, async (interaction) => {
  // Made async
  if (!interaction.isChatInputCommand()) return
  const client = interaction.client as CustomClient // Assert as CustomClient
  const command = client.commands.get(interaction.commandName)

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`)
    return
  }

  try {
    await command.execute(interaction)
  } catch (error) {
    console.error(error)
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      })
    } else {
      await interaction.reply({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      })
    }
  }
})

console.log("Logging in to Discord...")
client.login(config.DISCORD_TOKEN)
