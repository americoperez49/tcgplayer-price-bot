import dotenv from "dotenv"
dotenv.config() // Load environment variables first

import { config } from "./config" // Import config
import {
  GatewayIntentBits,
  TextChannel,
  Collection, // Keep Collection if it's used elsewhere for commands
  Events, // Keep Events if it's used elsewhere
  MessageFlags, // Import MessageFlags
  ModalBuilder, // Import ModalBuilder
  TextInputBuilder, // Import TextInputBuilder
  TextInputStyle, // Import TextInputStyle
  ActionRowBuilder, // Import ActionRowBuilder for modal components
} from "discord.js"
import { CustomClient } from "./CustomClient" // Import CustomClient
import puppeteer from "puppeteer" // Import puppeteer
import { PrismaClient } from "@prisma/client" // Import PrismaClient
import path from "path"
import fs from "fs"

const prisma = new PrismaClient() // Instantiate PrismaClient

const client = new CustomClient({
  // Use CustomClient
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers, // Add GuildMembers intent for ownerId access
  ],
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
  const itemsToMonitor = await prisma.monitoredItem.findMany({
    include: { url: true }, // Include the related Url data
  })

  if (itemsToMonitor.length === 0) {
    console.warn(
      "No items with a price threshold configured in the database. Please add items to the 'monitored_items' table with a 'threshold' value to monitor them."
    )
    return
  }

  for (const item of itemsToMonitor) {
    const timestamp = new Date().toLocaleString()
    console.log(
      `[${timestamp}] Checking price for: ${item.name} (${item.url.url})`
    ) // Access url from the relation
    const currentPrice = await fetchPrice(item.url.url) // Pass the actual URL

    if (currentPrice === null) {
      console.log(
        `[${timestamp}] Failed to get current price for ${item.name}. Skipping notification.`
      )
      continue // Move to the next item
    }

    // Fetch the last recorded price for this URL
    const lastPriceRecord = await prisma.priceHistory.findFirst({
      where: { urlId: item.urlId },
      orderBy: { timestamp: "desc" },
    })
    const lastRecordedPrice = lastPriceRecord ? lastPriceRecord.price : null

    console.log(
      `[${timestamp}] Current price for ${item.name}: $${currentPrice}`
    )
    if (lastRecordedPrice !== null) {
      console.log(
        `[${timestamp}] Last recorded price for ${item.name}: $${lastRecordedPrice}`
      )
    }

    // Add entry to PriceHistory only if price has changed or it's the first entry
    if (lastRecordedPrice === null || currentPrice !== lastRecordedPrice) {
      await prisma.priceHistory.create({
        data: {
          urlId: item.urlId,
          price: currentPrice,
        },
      })
      console.log(
        `[${timestamp}] Price change detected for ${item.name}. New price history entry added.`
      )
    }

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
            `Link: ${item.url.url}`
        ) // Access url from the relation
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

async function handleDeleteItemSelect(interaction: any) {
  await interaction.deferUpdate() // Defer the update to the select menu interaction

  const itemId = interaction.values[0] // Get the selected item ID
  const discordUserId = interaction.user.id
  const isServerOwner = interaction.guild.ownerId === discordUserId

  try {
    const existingItem = await prisma.monitoredItem.findUnique({
      where: { id: itemId },
    })

    if (!existingItem) {
      await interaction.followUp({
        content:
          "Item not found with the provided ID. It might have been deleted already.",
        ephemeral: true,
      })
      return
    }

    // Ownership check
    if (!isServerOwner && existingItem.discordUserId !== discordUserId) {
      await interaction.followUp({
        content:
          "You do not have permission to delete this item. Only the server owner or the item's owner can delete it.",
        ephemeral: true,
      })
      return
    }

    await prisma.monitoredItem.delete({
      where: { id: itemId },
    })

    await interaction.followUp({
      content: `Successfully deleted item "${existingItem.name}" (ID: \`${existingItem.id}\`).`,
      ephemeral: true,
    })
  } catch (error) {
    console.error("Error deleting item via select menu:", error)
    await interaction.followUp({
      content:
        "Failed to delete item due to a database error. Please check the console for details.",
      ephemeral: true,
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function handleUpdateItemSelect(interaction: any) {
  const itemId = interaction.values[0] // Get the selected item ID
  const discordUserId = interaction.user.id
  const isServerOwner = interaction.guild.ownerId === discordUserId

  try {
    const existingItem = await prisma.monitoredItem.findUnique({
      where: { id: itemId },
      include: { url: true }, // Include the related Url data
    })

    if (!existingItem) {
      await interaction.followUp({
        content:
          "Item not found with the provided ID. It might have been deleted already.",
        ephemeral: true,
      })
      return
    }

    // Ownership check
    if (!isServerOwner && existingItem.discordUserId !== discordUserId) {
      await interaction.followUp({
        content:
          "You do not have permission to update this item. Only the server owner or the item's owner can update it.",
        ephemeral: true,
      })
      return
    }

    const truncatedName =
      existingItem.name.length > 30
        ? existingItem.name.substring(0, 27) + "..."
        : existingItem.name
    const modal = new ModalBuilder()
      .setCustomId(`update_item_modal_${itemId}`)
      .setTitle(`Update ${truncatedName}`) // Truncate title to fit Discord's 45 char limit

    const nameInput = new TextInputBuilder()
      .setCustomId("nameInput")
      .setLabel("Item Name")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(existingItem.name)

    const urlInput = new TextInputBuilder()
      .setCustomId("urlInput")
      .setLabel("TCGPlayer URL")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setValue(existingItem.url.url) // Access url from the relation

    const thresholdInput = new TextInputBuilder()
      .setCustomId("thresholdInput")
      .setLabel("Price Threshold")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(existingItem.threshold.toString()) // Convert number to string for TextInput

    const firstActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput)
    const secondActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput)
    const thirdActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(thresholdInput)

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow)

    await interaction.showModal(modal)
  } catch (error) {
    console.error("Error preparing update modal:", error)
    await interaction.followUp({
      content: "Failed to prepare update modal due to a database error.",
      ephemeral: true,
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function handleUpdateItemModalSubmit(interaction: any) {
  await interaction.deferReply({ ephemeral: true })

  const itemId = interaction.customId.split("_")[3] // Extract ID from customId: 'update_item_modal_ITEM_ID'
  const newName = interaction.fields.getTextInputValue("nameInput")
  const newUrl = interaction.fields.getTextInputValue("urlInput")
  const newThresholdString =
    interaction.fields.getTextInputValue("thresholdInput")
  const newThreshold = parseFloat(newThresholdString)

  const discordUserId = interaction.user.id
  const isServerOwner = interaction.guild.ownerId === discordUserId

  try {
    const existingItem = await prisma.monitoredItem.findUnique({
      where: { id: itemId },
      include: { url: true }, // Include the related Url data
    })

    if (!existingItem) {
      await interaction.editReply(
        "Item not found with the provided ID. It might have been deleted already."
      )
      return
    }

    // Ownership check (redundant if modal was properly shown, but good for safety)
    if (!isServerOwner && existingItem.discordUserId !== discordUserId) {
      await interaction.editReply(
        "You do not have permission to update this item."
      )
      return
    }

    const updateData: {
      name?: string
      urlId?: string // Change from url to urlId
      threshold?: number
    } = {}

    // Only update if value has changed or is provided
    if (newName !== existingItem.name && newName !== "") {
      updateData.name = newName
    }

    if (newUrl !== existingItem.url.url && newUrl !== "") {
      let urlRecord = await prisma.url.findUnique({
        where: { url: newUrl },
      })

      if (!urlRecord) {
        urlRecord = await prisma.url.create({
          data: { url: newUrl },
        })
      }
      updateData.urlId = urlRecord.id // Update urlId
    }

    if (newThreshold !== existingItem.threshold && !isNaN(newThreshold)) {
      updateData.threshold = newThreshold
    }

    if (Object.keys(updateData).length === 0) {
      await interaction.editReply(
        "No changes detected or invalid input. Item was not updated."
      )
      return
    }

    const updatedItem = await prisma.monitoredItem.update({
      where: { id: itemId },
      data: updateData,
    })

    await interaction.editReply(
      `Successfully updated item "${updatedItem.name}" (ID: \`${updatedItem.id}\`).`
    )
  } catch (error: any) {
    if (error.code === "P2002" && error.meta?.target?.includes("url")) {
      // Adjust error message for unique URL constraint on the Url table
      await interaction.editReply(
        "Failed to update item: The provided URL is already associated with another item."
      )
    } else {
      console.error("Error updating item via modal:", error)
      await interaction.editReply(
        "Failed to update item due to a database error. Please check the console for details."
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const client = interaction.client as CustomClient
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
  } else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "delete_item_select") {
      await handleDeleteItemSelect(interaction)
    } else if (interaction.customId === "update_item_select") {
      // Handle update select menu
      await handleUpdateItemSelect(interaction)
    }
  } else if (interaction.isModalSubmit()) {
    // Handle modal submissions
    if (interaction.customId.startsWith("update_item_modal_")) {
      await handleUpdateItemModalSubmit(interaction)
    }
  }
})

console.log("Logging in to Discord...")
client.login(config.DISCORD_TOKEN)
