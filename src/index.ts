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
  ButtonBuilder, // Import ButtonBuilder
  ButtonStyle, // Import ButtonStyle
} from "discord.js"
import { CustomClient } from "./CustomClient" // Import CustomClient
import puppeteer from "puppeteer" // Import puppeteer and Protocol
import { PrismaClient } from "@prisma/client" // Import PrismaClient
import path from "path"
import fs from "fs"
import { all } from "axios"
import express from "express" // Import express
import cors from "cors" // Import cors
import priceHistoryRouter from "./api/price-history" // Import the price history router

const prisma = new PrismaClient() // Instantiate PrismaClient

// Initialize Express app
const app = express()
app.use(cors()) // Enable CORS for all routes
app.use(express.json()) // Enable JSON body parsing

// Mount API routers
app.use("/api", priceHistoryRouter)

// Start the API server
app.listen(config.API_PORT, () => {
  console.log(`API server listening on port ${config.API_PORT}`)
})

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
      const filePath = path.join(commandsPath, file) // Corrected this line
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
  targetCondition: string, // Add targetCondition parameter
  sellerVerified: boolean // Add sellerVerified parameter
): Promise<{
  price: number | null
  condition: string | null
  imageUrl: string | null
}> {
  // Add imageUrl to return type
  let browser
  try {
    browser = await puppeteer.launch({ headless: false, devtools: true }) // Launch with devtools enabled
    const page = await browser.newPage()

    // Set the cookie for TCGPlayer
    await browser.defaultBrowserContext().setCookie({
      name: "product-display-settings",
      value: "sort=price+shipping&size=25",
      domain: "www.tcgplayer.com",
      path: "/",
      expires: Date.now() / 1000 + 365 * 24 * 60 * 60, // Expires in 1 year
    })

    // Conditionally set the SellerVerified cookie
    if (sellerVerified) {
      await browser.defaultBrowserContext().setCookie({
        name: "SearchCriteria",
        value:
          "M=1&WantVerifiedSellers=True&WantDirect=False&WantSellersInCart=False&WantWPNSellers=False",
        domain: "www.tcgplayer.com",
        path: "/",
        expires: Date.now() / 1000 + 365 * 24 * 60 * 60, // Expires in 1 year
      })
    }

    await page.goto(url) // Use the passed URL
    await new Promise((resolve) => setTimeout(resolve, 10000)) // Increased wait time for debugging

    // Wait for the price, condition, and image elements to be available
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
      page
        .waitForSelector(".lazy-image__wrapper img", { timeout: 5000 }) // Wait for the image
        .catch(() => null),
    ])

    const details = await page.evaluate((targetConditionInBrowser: string) => {
      // debugger // Breakpoint for debugging in browser DevTools
      const allPrices: { price: number; condition: string | null }[] = []
      let imageUrl: string | null = null // Initialize imageUrl

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

      // Extract image URL
      const imageElement = document.querySelector(".lazy-image__wrapper img")
      if (imageElement instanceof HTMLImageElement) {
        const srcset = imageElement.srcset
        if (srcset) {
          // Parse srcset to find the highest resolution image
          const sources = srcset.split(",").map((s) => s.trim().split(" "))
          let highestResUrl: string | null = null
          let highestWidth = 0

          for (const source of sources) {
            const url = source[0]
            const widthMatch = source[1] ? source[1].match(/(\d+)w/) : null
            if (widthMatch && widthMatch[1]) {
              const width = parseInt(widthMatch[1], 10)
              if (width > highestWidth) {
                highestWidth = width
                highestResUrl = url
              }
            }
          }
          imageUrl = highestResUrl || imageElement.src // Fallback to src if srcset parsing fails
        } else {
          imageUrl = imageElement.src
        }
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

      return {
        price: lowestPrice,
        condition: correspondingCondition,
        imageUrl: imageUrl,
      } // Return imageUrl
    }, targetCondition) // Pass targetCondition from Node.js context

    console.log(`Raw price found: ${details.price}`)
    console.log(`Raw condition found: ${details.condition}`)
    console.log(`Image URL found: ${details.imageUrl}`) // Log the found image URL

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
    return { price: null, condition: null, imageUrl: null }
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
    const effectiveCondition = item.isFoil
      ? `${item.condition}Foil`
      : item.condition // Construct effective condition
    console.log(
      `[${timestamp}] Checking price for: ${item.name} (${item.url.url}) with condition: ${effectiveCondition}`
    ) // Access url from the relation
    const itemDetails = await fetchItemDetails(
      item.url.url,
      effectiveCondition,
      item.sellerVerified
    ) // Pass effectiveCondition and sellerVerified

    const currentPrice = itemDetails.price
    const scrapedCondition = itemDetails.condition
    const scrapedImageUrl = itemDetails.imageUrl // Get the scraped image URL

    if (currentPrice === null) {
      console.log(
        `[${timestamp}] Failed to get current price for ${item.name}. Skipping notification.`
      )
      continue // Move to the next item
    }

    // If the URL record doesn't have an image yet, and we scraped one, store it
    if (!item.url.imageUrl && scrapedImageUrl) {
      await prisma.url.update({
        where: { id: item.url.id },
        data: { imageUrl: scrapedImageUrl },
      })
      console.log(
        `[${timestamp}] Stored image URL for ${item.name}: ${scrapedImageUrl}`
      )
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
    if (
      currentPrice < item.threshold &&
      scrapedCondition === effectiveCondition
    ) {
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
          ...new Set(
            usersToNotify.map((u: { discordUserId: string }) => u.discordUserId)
          ),
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
  await interaction.deferUpdate() // Defer the update to the select menu interaction

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

    const freeFormButton = new ButtonBuilder()
      .setCustomId(`update_free_form_${itemId}`)
      .setLabel("Update Free Form Fields")
      .setStyle(ButtonStyle.Primary)

    const selectableButton = new ButtonBuilder()
      .setCustomId(`update_selectable_${itemId}`)
      .setLabel("Update Selectable Fields")
      .setStyle(ButtonStyle.Secondary)

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      freeFormButton,
      selectableButton
    )

    await interaction.followUp({
      content: "What type of fields do you want to update?",
      components: [actionRow],
      ephemeral: true,
    })
  } catch (error) {
    console.error("Error preparing update options:", error)
    await interaction.followUp({
      content: "Failed to prepare update options due to a database error.",
      ephemeral: true,
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function handleUpdateFreeFormFields(interaction: any) {
  const itemId = interaction.customId.split("_")[3] // Extract ID from customId: 'update_free_form_ITEM_ID'
  const discordUserId = interaction.user.id
  const isServerOwner = interaction.guild.ownerId === discordUserId

  try {
    const existingItem = await prisma.monitoredItem.findUnique({
      where: { id: itemId },
      include: { url: true },
    })

    if (!existingItem) {
      await interaction.reply({
        content:
          "Item not found with the provided ID. It might have been deleted already.",
        ephemeral: true,
      })
      return
    }

    if (!isServerOwner && existingItem.discordUserId !== discordUserId) {
      await interaction.reply({
        content:
          "You do not have permission to update this item. Only the server owner or the item's owner can update it.",
        ephemeral: true,
      })
      return
    }

    const maxNameLength = 45 - "Update Free Form Fields for ".length - 3 // 3 for "..."
    const truncatedName =
      existingItem.name.length > maxNameLength
        ? existingItem.name.substring(0, maxNameLength) + "..."
        : existingItem.name
    const modal = new ModalBuilder()
      .setCustomId(`update_free_form_modal_${itemId}`)
      .setTitle(`Update Free Form Fields for ${truncatedName}`)

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
      .setValue(existingItem.url.url)

    const thresholdInput = new TextInputBuilder()
      .setCustomId("thresholdInput")
      .setLabel("Price Threshold")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(existingItem.threshold.toString())

    const firstActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput)
    const secondActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput)
    const thirdActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(thresholdInput)

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow)

    await interaction.showModal(modal)
  } catch (error) {
    console.error("Error preparing free form update modal:", error)
    await interaction.reply({
      content:
        "Failed to prepare free form update modal due to a database error.",
      ephemeral: true,
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function handleUpdateSelectableFields(interaction: any) {
  const itemId = interaction.customId.split("_")[2] // Extract ID from customId: 'update_selectable_ITEM_ID'
  const discordUserId = interaction.user.id
  const isServerOwner = interaction.guild.ownerId === discordUserId

  try {
    const existingItem = await prisma.monitoredItem.findUnique({
      where: { id: itemId },
      include: { url: true },
    })

    if (!existingItem) {
      await interaction.reply({
        content:
          "Item not found with the provided ID. It might have been deleted already.",
        ephemeral: true,
      })
      return
    }

    if (!isServerOwner && existingItem.discordUserId !== discordUserId) {
      await interaction.reply({
        content:
          "You do not have permission to update this item. Only the server owner or the item's owner can update it.",
        ephemeral: true,
      })
      return
    }

    const maxNameLength = 45 - "Update Selectable Fields for ".length - 3 // 3 for "..."
    const truncatedName =
      existingItem.name.length > maxNameLength
        ? existingItem.name.substring(0, maxNameLength) + "..."
        : existingItem.name
    const modal = new ModalBuilder()
      .setCustomId(`update_selectable_modal_${itemId}`)
      .setTitle(`Update Selectable Fields for ${truncatedName}`)

    const conditionInput = new TextInputBuilder()
      .setCustomId("conditionInput")
      .setLabel("Item Condition (Unopened, Near Mint, etc.)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(existingItem.condition)

    const isFoilInput = new TextInputBuilder()
      .setCustomId("isFoilInput")
      .setLabel("Is Foil? (true/false)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(existingItem.isFoil.toString())

    const firstActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(conditionInput)
    const secondActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(isFoilInput)

    modal.addComponents(firstActionRow, secondActionRow)

    await interaction.showModal(modal)
  } catch (error) {
    console.error("Error preparing selectable update modal:", error)
    await interaction.reply({
      content:
        "Failed to prepare selectable update modal due to a database error.",
      ephemeral: true,
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function handleFreeFormModalSubmit(interaction: any) {
  await interaction.deferReply({ ephemeral: true })

  const itemId = interaction.customId.split("_")[4] // Extract ID from customId: 'update_free_form_modal_ITEM_ID'
  const discordUserId = interaction.user.id
  const isServerOwner = interaction.guild.ownerId === discordUserId

  try {
    const existingItem = await prisma.monitoredItem.findUnique({
      where: { id: itemId },
      include: { url: true },
    })

    if (!existingItem) {
      await interaction.editReply(
        "Item not found with the provided ID. It might have been deleted already."
      )
      return
    }

    if (!isServerOwner && existingItem.discordUserId !== discordUserId) {
      await interaction.editReply(
        "You do not have permission to update this item."
      )
      return
    }

    const updateData: {
      name?: string
      urlId?: string
      threshold?: number
    } = {}

    let changesMade = false
    let errorMessage = ""

    const newName = interaction.fields.getTextInputValue("nameInput")
    if (
      newName !== undefined &&
      newName !== existingItem.name &&
      newName !== ""
    ) {
      updateData.name = newName
      changesMade = true
    }

    const newUrl = interaction.fields.getTextInputValue("urlInput")
    if (
      newUrl !== undefined &&
      newUrl !== existingItem.url.url &&
      newUrl !== ""
    ) {
      let urlRecord = await prisma.url.findUnique({
        where: { url: newUrl },
      })

      if (!urlRecord) {
        urlRecord = await prisma.url.create({
          data: { url: newUrl },
        })
      }
      updateData.urlId = urlRecord.id
      changesMade = true
    }

    const newThresholdString =
      interaction.fields.getTextInputValue("thresholdInput")
    if (newThresholdString !== undefined && newThresholdString !== "") {
      const newThreshold = parseFloat(newThresholdString)
      if (!isNaN(newThreshold) && newThreshold !== existingItem.threshold) {
        updateData.threshold = newThreshold
        changesMade = true
      } else if (isNaN(newThreshold)) {
        errorMessage += "Invalid value for Price Threshold. "
      }
    }

    if (errorMessage) {
      await interaction.editReply(`Failed to update item: ${errorMessage}`)
      return
    }

    if (!changesMade) {
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
      await interaction.editReply(
        "Failed to update item: The provided URL is already associated with another item."
      )
    } else {
      console.error("Error updating free form item via modal:", error)
      await interaction.editReply(
        "Failed to update item due to a database error. Please check the console for details."
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

async function handleSelectableModalSubmit(interaction: any) {
  await interaction.deferReply({ ephemeral: true })

  const itemId = interaction.customId.split("_")[3] // Extract ID from customId: 'update_selectable_modal_ITEM_ID'
  const discordUserId = interaction.user.id
  const isServerOwner = interaction.guild.ownerId === discordUserId

  try {
    const existingItem = await prisma.monitoredItem.findUnique({
      where: { id: itemId },
      include: { url: true },
    })

    if (!existingItem) {
      await interaction.editReply(
        "Item not found with the provided ID. It might have been deleted already."
      )
      return
    }

    if (!isServerOwner && existingItem.discordUserId !== discordUserId) {
      await interaction.editReply(
        "You do not have permission to update this item."
      )
      return
    }

    const updateData: {
      condition?:
        | "Unopened"
        | "NearMint"
        | "LightlyPlayed"
        | "ModeratelyPlayed"
        | "HeavilyPlayed"
      isFoil?: boolean
    } = {}

    let changesMade = false
    let errorMessage = ""

    const newCondition = interaction.fields.getTextInputValue("conditionInput")
    const validConditions = [
      "Unopened",
      "NearMint",
      "LightlyPlayed",
      "ModeratelyPlayed",
      "HeavilyPlayed",
    ]
    if (newCondition !== undefined && newCondition !== "") {
      const normalizedNewCondition = newCondition.replace(/\s/g, "")
      if (
        normalizedNewCondition !== existingItem.condition &&
        validConditions.includes(normalizedNewCondition)
      ) {
        updateData.condition = normalizedNewCondition as
          | "Unopened"
          | "NearMint"
          | "LightlyPlayed"
          | "ModeratelyPlayed"
          | "HeavilyPlayed"
        changesMade = true
      } else if (!validConditions.includes(normalizedNewCondition)) {
        errorMessage +=
          "Invalid condition provided. Must be 'Unopened', 'Near Mint', 'Lightly Played', 'Moderately Played', or 'Heavily Played'. "
      }
    }

    const newIsFoilString = interaction.fields.getTextInputValue("isFoilInput")
    if (newIsFoilString !== undefined && newIsFoilString !== "") {
      let newIsFoil: boolean | undefined
      if (newIsFoilString.toLowerCase() === "true") {
        newIsFoil = true
      } else if (newIsFoilString.toLowerCase() === "false") {
        newIsFoil = false
      } else {
        errorMessage += "'Is Foil?' must be 'true' or 'false'. "
      }

      if (newIsFoil !== undefined && newIsFoil !== existingItem.isFoil) {
        updateData.isFoil = newIsFoil
        changesMade = true
      }
    }

    if (errorMessage) {
      await interaction.editReply(`Failed to update item: ${errorMessage}`)
      return
    }

    if (!changesMade) {
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
    console.error("Error updating selectable item via modal:", error)
    await interaction.editReply(
      "Failed to update item due to a database error. Please check the console for details."
    )
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
  } else if (interaction.isButton()) {
    if (interaction.customId.startsWith("update_free_form_")) {
      await handleUpdateFreeFormFields(interaction)
    } else if (interaction.customId.startsWith("update_selectable_")) {
      await handleUpdateSelectableFields(interaction)
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("update_free_form_modal_")) {
      await handleFreeFormModalSubmit(interaction)
    } else if (interaction.customId.startsWith("update_selectable_modal_")) {
      await handleSelectableModalSubmit(interaction)
    }
  }
})

console.log("Logging in to Discord...")
client.login(config.DISCORD_TOKEN)
