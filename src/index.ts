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
  StringSelectMenuBuilder, // Import StringSelectMenuBuilder
  StringSelectMenuOptionBuilder, // Import StringSelectMenuOptionBuilder
} from "discord.js"
import { CustomClient } from "./CustomClient" // Import CustomClient
import puppeteer from "puppeteer" // Import puppeteer
import { PrismaClient } from "@prisma/client" // Import PrismaClient
import path from "path"
import fs from "fs"
import { all } from "axios"

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

async function fetchItemDetails(
  url: string,
  targetCondition: string // Add targetCondition parameter
): Promise<{ price: number | null; condition: string | null }> {
  let browser
  try {
    browser = await puppeteer.launch({ headless: false, devtools: true }) // Launch with devtools enabled
    const page = await browser.newPage()
    await page.goto(url) // Use the passed URL
    await new Promise((resolve) => setTimeout(resolve, 10000)) // Increased wait time for debugging

    // Wait for the price and condition elements to be available
    // Use Promise.all to wait for all potential selectors concurrently
    await Promise.all([
      page
        .waitForSelector("span.spotlight__price", { timeout: 5000 })
        .catch(() => null),
      page
        .waitForSelector("section.spotlight__condition", { timeout: 5000 })
        .catch(() => null),
      page
        .waitForSelector(".listing-item__listing-data__info__price", {
          timeout: 5000,
        })
        .catch(() => null),
      page
        .waitForSelector(".listing-item__listing-data__info__condition a", {
          timeout: 5000,
        })
        .catch(() => null),
    ])

    const details = await page.evaluate((targetConditionInBrowser: string) => {
      // debugger // Breakpoint for debugging in browser DevTools
      const allPrices: { price: number; condition: string | null }[] = []

      // Function to extract price and normalize condition
      const extractPriceAndCondition = (
        priceText: string | null,
        conditionText: string | null
      ) => {
        let price: number | null = null
        if (priceText) {
          const match = priceText.match(/\$([0-9]+\.?[0-9]*)/)
          if (match && match[1]) {
            price = parseFloat(match[1])
          }
        }

        let condition: string | null = null
        if (conditionText) {
          condition = conditionText.replace(/\s/g, "") // Remove spaces
        }
        return { price, condition }
      }

      // --- Scrape "Spotlight" details ---
      const spotlightPriceElement = document.querySelector(".spotlight__price")
      const spotlightConditionElement = document.querySelector(
        ".spotlight__condition"
      )
      const spotlightDetails = extractPriceAndCondition(
        spotlightPriceElement?.textContent || null,
        spotlightConditionElement?.textContent || null
      )
      if (spotlightDetails.price !== null) {
        allPrices.push({
          price: spotlightDetails.price,
          condition: spotlightDetails.condition,
        })
      }

      // --- Scrape "Listing Item" details ---
      const listingItems = document.querySelectorAll(".listing-item")
      listingItems.forEach((itemElement) => {
        // Check if the item has the ".listing-item__listing-data__listo" class
        if (itemElement.querySelector(".listing-item__listing-data__listo")) {
          return // Skip this item if it contains the specified class
        }

        const listItemPriceElement = itemElement.querySelector(
          ".listing-item__listing-data__info__price"
        )
        const listItemConditionAnchor = itemElement.querySelector(
          ".listing-item__listing-data__info__condition a"
        )

        const listItemDetails = extractPriceAndCondition(
          listItemPriceElement?.textContent || null,
          listItemConditionAnchor?.textContent || null
        )
        if (listItemDetails.price !== null) {
          allPrices.push({
            price: listItemDetails.price,
            condition: listItemDetails.condition,
          })
        }
      })

      // --- Determine the lowest price and its corresponding condition ---
      let lowestPrice: number | null = null
      let correspondingCondition: string | null = null

      // Filter by targetConditionInBrowser first
      const filteredPrices = allPrices.filter(
        (item) => item.condition === targetConditionInBrowser
      )

      if (filteredPrices.length > 0) {
        // Sort by price to find the lowest among matching conditions
        filteredPrices.sort(
          (a, b) => (a.price || Infinity) - (b.price || Infinity)
        )
        lowestPrice = filteredPrices[0].price
        correspondingCondition = filteredPrices[0].condition
      } else if (allPrices.length > 0) {
        // Fallback: if no matching condition found, use the overall lowest price
        // This might not be desired, but ensures a price is returned if possible.
        // Re-sort allPrices if not already sorted by price
        allPrices.sort((a, b) => (a.price || Infinity) - (b.price || Infinity))
        lowestPrice = allPrices[0].price
        correspondingCondition = allPrices[0].condition
      }

      return { price: lowestPrice, condition: correspondingCondition }
    }, targetCondition) // Pass targetCondition from Node.js context

    console.log(`Raw price found: ${details.price}`)
    console.log(`Raw condition found: ${details.condition}`)

    if (details.price === null) {
      console.warn(`Could not find price on TCGPlayer page for URL: ${url}.`)
    }
    if (details.condition === null) {
      console.warn(
        `Could not find condition on TCGPlayer page for URL: ${url}.`
      )
    }

    return details
  } catch (error) {
    console.error(
      `Error fetching item details from TCGPlayer for URL: ${url}:`,
      error
    )
    return { price: null, condition: null }
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
      `[${timestamp}] Checking price for: ${item.name} (${item.url.url}) with condition: ${item.condition}`
    ) // Access url from the relation
    const itemDetails = await fetchItemDetails(item.url.url, item.condition) // Pass item.condition

    const currentPrice = itemDetails.price
    const scrapedCondition = itemDetails.condition

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

    // Only alert if currentPrice is below the item's threshold AND condition matches
    if (currentPrice < item.threshold && scrapedCondition === item.condition) {
      console.log(
        `[${timestamp}] Price $${currentPrice} for ${item.name} (Condition: ${scrapedCondition}) is below threshold $${item.threshold} and condition matches. Sending alert.`
      )
      const channel = (await client.channels.fetch(
        config.CHANNEL_ID
      )) as TextChannel
      if (channel) {
        // Find all users monitoring this specific URL
        const usersToNotify = await prisma.monitoredItem.findMany({
          where: { urlId: item.urlId },
          select: { discordUserId: true },
        })

        const uniqueUserIds = [
          ...new Set(usersToNotify.map((u) => u.discordUserId)),
        ]
        const mentions = uniqueUserIds.map((id) => `<@${id}>`).join(" ")

        await channel.send(
          `${mentions} 🚨 PRICE ALERT! 🚨\n` + // Add mentions here
            `Item: ${item.name} (Condition: ${scrapedCondition})\n` + // Include scraped condition
            `The price has dropped to $${currentPrice}!\n` +
            `Threshold: $${item.threshold}\n` +
            `Link: ${item.url.url}`
        ) // Access url from the relation
      } else {
        console.error(`Could not find channel with ID: ${config.CHANNEL_ID}`)
      }
    } else {
      console.log(
        `[${timestamp}] Price $${currentPrice} for ${item.name} (Condition: ${scrapedCondition}) is above or equal to threshold $${item.threshold} or condition does not match. No alert needed.`
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

    const conditionInput = new TextInputBuilder()
      .setCustomId("conditionInput")
      .setLabel("Item Condition (Unopened, Near Mint, etc.)") // Shortened label
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(existingItem.condition) // Set the current condition

    const firstActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput)
    const secondActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput)
    const thirdActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(thresholdInput)
    const fourthActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(conditionInput) // New row for condition

    modal.addComponents(
      firstActionRow,
      secondActionRow,
      thirdActionRow,
      fourthActionRow
    ) // Add the new row

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
  const newCondition = interaction.fields.getTextInputValue("conditionInput") // Get the new condition

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
      condition?:
        | "Unopened"
        | "NearMint"
        | "LightlyPlayed"
        | "ModeratelyPlayed"
        | "HeavilyPlayed" // Update condition to updateData type
    } = {}

    // Only update if value has changed or is provided
    if (newName !== existingItem.name && newName !== "") {
      updateData.name = newName
    }

    // Validate and update condition
    const validConditions = [
      "Unopened",
      "NearMint",
      "LightlyPlayed", // New value
      "ModeratelyPlayed",
      "HeavilyPlayed",
    ] // Updated valid conditions
    if (
      newCondition !== "" &&
      newCondition !== existingItem.condition &&
      validConditions.includes(newCondition)
    ) {
      updateData.condition = newCondition as
        | "Unopened"
        | "NearMint"
        | "LightlyPlayed" // Update type
        | "ModeratelyPlayed"
        | "HeavilyPlayed"
    } else if (newCondition !== "" && !validConditions.includes(newCondition)) {
      await interaction.editReply(
        "Failed to update item: Invalid condition provided. Must be 'Unopened', 'Near Mint', 'Lightly Played', 'Moderately Played', or 'Heavily Played'."
      )
      return
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
