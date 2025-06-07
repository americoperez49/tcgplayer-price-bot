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
import path from "path"
import fs from "fs"
import axios from "axios" // Corrected import for axios
import express from "express" // Import express
import cors from "cors" // Import cors
import { Server } from "socket.io" // Import Server from socket.io
import priceHistoryRouter from "./api/price-history" // Import the price history router
import monitoredItemsRouter from "./api/monitored-items" // Import the monitored items router

// Initialize Express app
const app = express()
app.use(
  cors({
    origin: "http://localhost:4200", // Allow requests from your Angular frontend
    credentials: true, // Allow cookies to be sent
  })
) // Enable CORS for specific origin
app.use(express.json()) // Enable JSON body parsing

// Mount API routers
app.use("/api", priceHistoryRouter)
app.use("/api", monitoredItemsRouter)

// Start the API server
const server = app.listen(config.API_PORT, () => {
  console.log(`API server listening on port ${config.API_PORT}`)
})

// Setup Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for now, refine later if needed
    methods: ["GET", "POST"],
  },
})

io.on("connection", (socket) => {
  console.log("Socket.IO client connected")
  socket.on("disconnect", () => console.log("Socket.IO client disconnected"))
})

// Export io so it can be used by other modules (e.g., API routes)
export { io }

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
  basePrice: number | null // New: Base price
  totalPrice: number | null // New: Total price (including shipping)
  condition: string | null
  imageUrl: string | null
  shippingCost: number | null
}> {
  let browser
  try {
    browser = await puppeteer.launch({
      headless: false, // Use headless mode for server environments
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // Recommended args for Docker
    })
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

    await page.goto(url, { timeout: 60000 }) // Use the passed URL, increased timeout to 60 seconds
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
      const allPrices: {
        basePrice: number | null
        shippingCost: number | null
        totalPrice: number | null
        condition: string | null
      }[] = []
      let imageUrl: string | null = null // Initialize imageUrl

      // Function to extract base price and normalize condition
      const extractBasePriceAndCondition = (
        priceText: string | null,
        conditionText: string | null
      ) => {
        let basePrice: number | null = null
        if (priceText) {
          const match = priceText.match(/\$([0-9,]+\.?[0-9]*)/)
          if (match && match[1]) {
            basePrice = parseFloat(match[1].replace(/,/g, ""))
          }
        }

        let condition: string | null = null
        if (conditionText) {
          condition = conditionText.replace(/\s/g, "") // Remove spaces
        }
        return { basePrice, condition }
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
      const spotlightShippingElement = document.querySelector(
        ".spotlight__shipping"
      ) // New: Get shipping element
      let spotlightShippingCost: number = 0 // Initialize shipping cost for spotlight
      if (spotlightShippingElement) {
        if (
          spotlightShippingElement.textContent?.includes("Shipping: Included")
        ) {
          spotlightShippingCost = 0 // Shipping is included
        } else {
          const shippingPriceElement = spotlightShippingElement.querySelector(
            ".shipping-messages__price"
          )
          if (shippingPriceElement) {
            const shippingMatch =
              shippingPriceElement.textContent?.match(/\$([0-9]+\.?[0-9]*)/)
            if (shippingMatch && shippingMatch[1]) {
              spotlightShippingCost = parseFloat(shippingMatch[1])
            }
          }
        }
      }

      const spotlightDetails = extractBasePriceAndCondition(
        spotlightPriceElement?.textContent || null,
        spotlightConditionElement?.textContent || null
      )
      if (spotlightDetails.basePrice !== null) {
        allPrices.push({
          basePrice: spotlightDetails.basePrice,
          totalPrice: spotlightDetails.basePrice + spotlightShippingCost, // Calculate total price
          condition: spotlightDetails.condition,
          shippingCost: spotlightShippingCost, // Store the actual shipping cost
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

        // Remove local declaration, use the outer one
        const listingDataInfo = itemElement.querySelector(
          ".listing-item__listing-data__info"
        )

        // This `shippingCost` variable is local to the forEach loop iteration
        let currentItemShippingCost: number = 0 // Declare a new variable for current item's shipping cost
        // Check the third child of listingDataInfo for "Shipping: Included"
        if (
          listingDataInfo &&
          listingDataInfo.children.length > 2 && // Ensure there's a third child (index 2)
          (listingDataInfo.children[2] as HTMLElement).innerText?.includes(
            "Shipping: Included"
          )
        ) {
          // Shipping is included, no need to add anything
          currentItemShippingCost = 0
        } else {
          // Check for shipping-messages__price if shipping is not explicitly included
          const shippingPriceElement = listingDataInfo?.querySelector(
            ".shipping-messages__price"
          )
          if (shippingPriceElement) {
            const shippingMatch =
              shippingPriceElement.textContent?.match(/\$([0-9]+\.?[0-9]*)/)
            if (shippingMatch && shippingMatch[1]) {
              currentItemShippingCost = parseFloat(shippingMatch[1])
            }
          }
        }

        const listItemDetails = extractBasePriceAndCondition(
          listItemPriceElement?.textContent || null,
          listItemConditionAnchor?.textContent || null
        )
        if (listItemDetails.basePrice !== null) {
          allPrices.push({
            basePrice: listItemDetails.basePrice,
            totalPrice: listItemDetails.basePrice + currentItemShippingCost, // This is the total price
            condition: listItemDetails.condition,
            shippingCost: currentItemShippingCost, // Store the shipping cost for this specific item
          })
        }
      })

      // --- Determine the lowest price and its corresponding condition ---
      let lowestBasePrice: number | null = null
      let lowestTotalPrice: number | null = null
      let correspondingCondition: string | null = null
      let correspondingShippingCost: number | null = null // New variable to store shipping cost

      // Filter by targetConditionInBrowser first
      const filteredPrices = allPrices.filter(
        (item) => item.condition === targetConditionInBrowser
      )

      if (filteredPrices.length > 0) {
        // Sort by totalPrice to find the lowest among matching conditions
        filteredPrices.sort(
          (a, b) => (a.totalPrice || Infinity) - (b.totalPrice || Infinity)
        )
        lowestBasePrice = filteredPrices[0].basePrice
        lowestTotalPrice = filteredPrices[0].totalPrice
        correspondingCondition = filteredPrices[0].condition
        correspondingShippingCost = filteredPrices[0].shippingCost // Get shipping cost
      } else if (allPrices.length > 0) {
        // Fallback: if no matching condition found, use the overall lowest price
        // This might not be desired, but ensures a price is returned if possible.
        // Re-sort allPrices if not already sorted by totalPrice
        allPrices.sort(
          (a, b) => (a.totalPrice || Infinity) - (b.totalPrice || Infinity)
        )
        lowestBasePrice = allPrices[0].basePrice
        lowestTotalPrice = allPrices[0].totalPrice
        correspondingCondition = allPrices[0].condition
        correspondingShippingCost = allPrices[0].shippingCost // Get shipping cost
      }

      return {
        basePrice: lowestBasePrice,
        totalPrice: lowestTotalPrice,
        condition: correspondingCondition,
        imageUrl: imageUrl,
        shippingCost: correspondingShippingCost, // Return the corresponding shippingCost
      }
    }, targetCondition) // Pass targetCondition from Node.js context

    console.log(
      "\n" +
        `--- Item Details ---\n` +
        `Base Price:    $${details.basePrice}\n` + // New: Display base price
        `Shipping:      $${details.shippingCost}\n` +
        `Total Price:   $${details.totalPrice}\n` + // New: Display total price
        `Condition:     ${details.condition}\n` +
        `--------------------` // Add a separator line
    )

    if (details.totalPrice === null) {
      console.warn(
        `Could not find total price on TCGPlayer page for URL: ${url}.`
      )
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
    return {
      basePrice: null,
      totalPrice: null,
      condition: null,
      imageUrl: null,
      shippingCost: null,
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

async function checkPriceAndNotify() {
  // Fetch all items to monitor from the API
  const itemsToMonitorResponse = await axios.get(
    `http://localhost:8080/api/monitored-items`
  )
  const itemsToMonitor = itemsToMonitorResponse.data

  if (itemsToMonitor.length === 0) {
    console.warn(
      "No items with a price threshold configured in the database. Please add items to the 'monitored_items' table with a 'threshold' value to monitor them."
    )
    return
  }

  for (const item of itemsToMonitor) {
    const timestamp = new Date().toISOString()
    const effectiveCondition = item.isFoil
      ? `${item.condition}Foil`
      : item.condition // Construct effective condition
    console.log(
      "\n" +
        `[${timestamp}] Checking price for: ${item.name} (Condition: ${effectiveCondition}) \n[${item.url.url}]`
    ) // Access url from the relation
    const itemDetails = await fetchItemDetails(
      item.url.url,
      effectiveCondition,
      item.sellerVerified
    ) // Pass effectiveCondition and sellerVerified

    const currentTotalPrice = itemDetails.totalPrice // Use totalPrice for comparison
    const scrapedCondition = itemDetails.condition
    const scrapedImageUrl = itemDetails.imageUrl // Get the scraped image URL

    if (currentTotalPrice === null) {
      console.log(
        `[${timestamp}] Failed to get current total price for ${item.name}. Skipping notification.`
      )
      continue // Move to the next item
    }

    // If the URL record doesn't have an image yet, and we scraped one, store it via API
    if (!item.url.imageUrl && scrapedImageUrl) {
      await axios.put(
        `http://localhost:8080/api/urls/${item.url.id}/image-url`,
        { imageUrl: scrapedImageUrl }
      )
      console.log(
        `[${timestamp}] Stored image URL for ${item.name}: ${scrapedImageUrl}`
      )
    }

    // Fetch the last recorded price for this URL via API
    let lastRecordedPrice: number | null = null
    try {
      const lastPriceResponse = await axios.get(
        `http://localhost:8080/api/price-history/latest/${item.urlId}`
      )
      lastRecordedPrice = lastPriceResponse.data.price
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        console.log(
          `[${timestamp}] No previous price history found for ${item.name}.`
        )
      } else {
        console.error(
          `[${timestamp}] Error fetching last price for ${item.name}:`,
          error.message
        )
      }
    }

    console.log(
      `[${timestamp}] Current Total Price for ${item.name}: $${currentTotalPrice}`
    )
    if (lastRecordedPrice !== null) {
      console.log(
        `[${timestamp}] Last recorded price for ${item.name}: $${lastRecordedPrice}`
      )
    }

    // Add entry to PriceHistory only if price has changed or it's the first entry via API
    if (lastRecordedPrice === null || currentTotalPrice !== lastRecordedPrice) {
      await axios.post(`http://localhost:8080/api/price-history`, {
        urlId: item.urlId,
        price: currentTotalPrice, // Store total price in history
      })
      console.log(
        `[${timestamp}] Price change detected for ${item.name}. New price history entry added.`
      )
    }

    // Only alert if currentTotalPrice is below the item's threshold AND condition matches
    if (
      currentTotalPrice < item.threshold &&
      scrapedCondition === effectiveCondition
    ) {
      console.log(
        `[${timestamp}] Total Price $${currentTotalPrice} for ${item.name} (Condition: ${scrapedCondition}) is below threshold $${item.threshold} and condition matches. Sending alert.`
      )
      const channel = (await client.channels.fetch(
        config.CHANNEL_ID
      )) as TextChannel
      if (channel) {
        // Find all users monitoring this specific URL via API
        const usersToNotifyResponse = await axios.get(
          `http://localhost:8080/api/monitored-items/users-to-notify/${item.urlId}`
        )
        const usersToNotify = usersToNotifyResponse.data

        const uniqueUserIds = [
          ...new Set(
            usersToNotify.map((u: { discordUserId: string }) => u.discordUserId)
          ),
        ]
        const mentions = uniqueUserIds.map((id) => `<@${id}>`).join(" ")

        await channel.send(
          `${mentions} 🚨 PRICE ALERT! 🚨\n` + // Add mentions here
            `Item: ${item.name} (Condition: ${scrapedCondition})\n` + // Include scraped condition
            `Base Price: $${itemDetails.basePrice}\n` + // Display base price
            `Total Price: $${itemDetails.totalPrice}!\n` + // Display total price
            `Threshold: $${item.threshold}\n` +
            `Link: ${item.url.url}`
        ) // Access url from the relation
      } else {
        console.error(`Could not find channel with ID: ${config.CHANNEL_ID}`)
      }
    } else {
      console.log(
        `[${timestamp}] Total Price $${currentTotalPrice} for ${item.name} (Condition: ${scrapedCondition}) is above or equal to threshold $${item.threshold} or condition does not match. No alert needed.`
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
    const existingItemResponse = await axios.get(
      `http://localhost:8080/api/monitored-items/${itemId}`
    )
    const existingItem = existingItemResponse.data

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

    await axios.delete(`http://localhost:8080/api/monitored-items/${itemId}`)

    await interaction.followUp({
      content: `Successfully deleted item "${existingItem.name}" (ID: \`${existingItem.id}\`).`,
      ephemeral: true,
    })
  } catch (error: any) {
    console.error("Error deleting item via select menu:", error)
    if (error.response && error.response.status === 404) {
      await interaction.followUp({
        content:
          "Item not found with the provided ID. It might have been deleted already.",
        ephemeral: true,
      })
    } else {
      await interaction.followUp({
        content:
          "Failed to delete item due to a database error. Please check the console for details.",
        ephemeral: true,
      })
    }
  }
}

async function handleUpdateItemSelect(interaction: any) {
  await interaction.deferUpdate() // Defer the update to the select menu interaction

  const itemId = interaction.values[0] // Get the selected item ID
  const discordUserId = interaction.user.id
  const isServerOwner = interaction.guild.ownerId === discordUserId

  try {
    const existingItemResponse = await axios.get(
      `http://localhost:8080/api/monitored-items/${itemId}`
    )
    const existingItem = existingItemResponse.data

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
  } catch (error: any) {
    console.error("Error preparing update options:", error)
    if (error.response && error.response.status === 404) {
      await interaction.followUp({
        content:
          "Item not found with the provided ID. It might have been deleted already.",
        ephemeral: true,
      })
    } else {
      await interaction.followUp({
        content: "Failed to prepare update options due to a database error.",
        ephemeral: true,
      })
    }
  }
}

async function handleUpdateFreeFormFields(interaction: any) {
  const itemId = interaction.customId.split("_")[3] // Extract ID from customId: 'update_free_form_ITEM_ID'
  const discordUserId = interaction.user.id
  const isServerOwner = interaction.guild.ownerId === discordUserId

  try {
    const existingItemResponse = await axios.get(
      `http://localhost:8080/api/monitored-items/${itemId}`
    )
    const existingItem = existingItemResponse.data

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
  } catch (error: any) {
    console.error("Error preparing free form update modal:", error)
    if (error.response && error.response.status === 404) {
      await interaction.reply({
        content:
          "Item not found with the provided ID. It might have been deleted already.",
        ephemeral: true,
      })
    } else {
      await interaction.reply({
        content:
          "Failed to prepare free form update modal due to a database error.",
        ephemeral: true,
      })
    }
  }
}

async function handleUpdateSelectableFields(interaction: any) {
  const itemId = interaction.customId.split("_")[2] // Extract ID from customId: 'update_selectable_ITEM_ID'
  const discordUserId = interaction.user.id
  const isServerOwner = interaction.guild.ownerId === discordUserId

  try {
    const existingItemResponse = await axios.get(
      `http://localhost:${config.API_PORT}/api/monitored-items/${itemId}`
    )
    const existingItem = existingItemResponse.data

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

    // Item Condition Select Menu
    const conditionSelect = new StringSelectMenuBuilder()
      .setCustomId(`update_condition_select_${itemId}`)
      .setPlaceholder("Select Item Condition")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Unopened")
          .setValue("Unopened")
          .setDefault(existingItem.condition === "Unopened"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Near Mint")
          .setValue("NearMint")
          .setDefault(existingItem.condition === "NearMint"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Lightly Played")
          .setValue("LightlyPlayed")
          .setDefault(existingItem.condition === "LightlyPlayed"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Moderately Played")
          .setValue("ModeratelyPlayed")
          .setDefault(existingItem.condition === "ModeratelyPlayed"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Heavily Played")
          .setValue("HeavilyPlayed")
          .setDefault(existingItem.condition === "HeavilyPlayed")
      )

    // Is Foil Select Menu
    const isFoilSelect = new StringSelectMenuBuilder()
      .setCustomId(`update_is_foil_select_${itemId}`)
      .setPlaceholder("Is the item foil?")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Yes (Foil)")
          .setValue("true")
          .setDefault(existingItem.isFoil === true),
        new StringSelectMenuOptionBuilder()
          .setLabel("No (Non-Foil)")
          .setValue("false")
          .setDefault(existingItem.isFoil === false)
      )

    // Seller Verified Select Menu
    const sellerVerifiedSelect = new StringSelectMenuBuilder()
      .setCustomId(`update_seller_verified_select_${itemId}`)
      .setPlaceholder("Require verified sellers?")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Yes (Verified Sellers Only)")
          .setValue("true")
          .setDefault(existingItem.sellerVerified === true),
        new StringSelectMenuOptionBuilder()
          .setLabel("No (Any Seller)")
          .setValue("false")
          .setDefault(existingItem.sellerVerified === false)
      )

    const submitButton = new ButtonBuilder()
      .setCustomId(`submit_selectable_update_${itemId}`)
      .setLabel("Submit Changes")
      .setStyle(ButtonStyle.Success)

    const cancelButton = new ButtonBuilder()
      .setCustomId(`cancel_selectable_update_${itemId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger)

    const conditionRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        conditionSelect
      )
    const isFoilRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        isFoilSelect
      )
    const sellerVerifiedRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        sellerVerifiedSelect
      )
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      submitButton,
      cancelButton
    )

    const replyMessage = await interaction.reply({
      content: `Update selectable fields for **${truncatedName}**:`,
      components: [conditionRow, isFoilRow, sellerVerifiedRow, buttonRow],
      ephemeral: true,
      fetchReply: true, // Required to get the message object
    })

    // Store the initial state of the selectable fields in the client's messageStates map
    client.messageStates.set(replyMessage.id, {
      itemId: existingItem.id,
      condition: existingItem.condition,
      isFoil: existingItem.isFoil,
      sellerVerified: existingItem.sellerVerified,
    })
  } catch (error: any) {
    console.error(
      "Error preparing selectable update message components:",
      error
    )
    if (error.response && error.response.status === 404) {
      await interaction.reply({
        content:
          "Item not found with the provided ID. It might have been deleted already.",
        ephemeral: true,
      })
    } else {
      await interaction.reply({
        content:
          "Failed to prepare selectable update options due to an internal error.",
        ephemeral: true,
      })
    }
  }
}

async function handleFreeFormModalSubmit(interaction: any) {
  await interaction.deferReply({ ephemeral: true })

  const itemId = interaction.customId.split("_")[4] // Extract ID from customId: 'update_free_form_modal_ITEM_ID'
  const discordUserId = interaction.user.id
  const isServerOwner = interaction.guild.ownerId === discordUserId

  try {
    const existingItemResponse = await axios.get(
      `http://localhost:${config.API_PORT}/api/monitored-items/${itemId}`
    )
    const existingItem = existingItemResponse.data

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
      let urlRecord = null
      try {
        const urlRecordResponse = await axios.get(
          `https://tcg-player-bot-357901268879.us-south1.run.app/api/urls/by-string?url=${encodeURIComponent(
            newUrl
          )}`
        )
        urlRecord = urlRecordResponse.data
      } catch (error: any) {
        if (error.response && error.response.status === 404) {
          // URL not found, create it
          const newUrlResponse = await axios.post(
            `https://tcg-player-bot-357901268879.us-south1.run.app/api/urls`,
            { url: newUrl }
          )
          urlRecord = newUrlResponse.data
        } else {
          throw error // Re-throw other errors
        }
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

    const updatedItemResponse = await axios.put(
      `https://tcg-player-bot-357901268879.us-south1.run.app/api/monitored-items/${itemId}`,
      updateData
    )
    const updatedItem = updatedItemResponse.data

    await interaction.editReply(
      `Successfully updated item "${updatedItem.name}" (ID: \`${updatedItem.id}\`).`
    )
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      await interaction.editReply(
        "Item not found with the provided ID. It might have been deleted already."
      )
    } else if (error.code === "P2002" && error.meta?.target?.includes("url")) {
      await interaction.editReply(
        "Failed to update item: The provided URL is already associated with another item."
      )
    } else {
      console.error("Error updating free form item via modal:", error)
      await interaction.editReply(
        "Failed to update item due to a database error. Please check the console for details."
      )
    }
  }
}

async function handleSubmitSelectableUpdate(interaction: any) {
  await interaction.deferUpdate() // Defer the button interaction

  const itemId = interaction.customId.split("_")[3] // Extract ID from customId: 'submit_selectable_update_ITEM_ID'
  const discordUserId = interaction.user.id
  const isServerOwner = interaction.guild.ownerId === discordUserId
  const messageId = interaction.message.id

  const finalItemState = client.messageStates.get(messageId)

  if (!finalItemState) {
    await interaction.followUp({
      content:
        "Error: Could not find state for this message. Please try again.",
      ephemeral: true,
    })
    return
  }

  try {
    const existingItemResponse = await axios.get(
      `http://localhost:${config.API_PORT}/api/monitored-items/${itemId}`
    )
    const existingItem = existingItemResponse.data

    if (!existingItem) {
      await interaction.followUp({
        content:
          "Item not found with the provided ID. It might have been deleted already.",
        ephemeral: true,
      })
      client.messageStates.delete(messageId) // Clean up state
      return
    }

    if (!isServerOwner && existingItem.discordUserId !== discordUserId) {
      await interaction.followUp({
        content:
          "You do not have permission to update this item. Only the server owner or the item's owner can update it.",
        ephemeral: true,
      })
      client.messageStates.delete(messageId) // Clean up state
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
      sellerVerified?: boolean
    } = {}

    let changesMade = false

    const validConditions = [
      "Unopened",
      "NearMint",
      "LightlyPlayed",
      "ModeratelyPlayed",
      "HeavilyPlayed",
    ]

    if (
      finalItemState.condition !== undefined &&
      finalItemState.condition !== existingItem.condition &&
      validConditions.includes(finalItemState.condition)
    ) {
      updateData.condition = finalItemState.condition as
        | "Unopened"
        | "NearMint"
        | "LightlyPlayed"
        | "ModeratelyPlayed"
        | "HeavilyPlayed"
      changesMade = true
    }

    if (
      finalItemState.isFoil !== undefined &&
      finalItemState.isFoil !== existingItem.isFoil
    ) {
      updateData.isFoil = finalItemState.isFoil
      changesMade = true
    }

    if (
      finalItemState.sellerVerified !== undefined &&
      finalItemState.sellerVerified !== existingItem.sellerVerified
    ) {
      updateData.sellerVerified = finalItemState.sellerVerified
      changesMade = true
    }

    if (!changesMade) {
      await interaction.followUp({
        content: "No changes detected. Item was not updated.",
        ephemeral: true,
      })
      await interaction.message.delete() // Delete the original message with components
      client.messageStates.delete(messageId) // Clean up state
      return
    }

    const updatedItemResponse = await axios.put(
      `http://localhost:${config.API_PORT}/api/monitored-items/${itemId}`,
      updateData
    )
    const updatedItem = updatedItemResponse.data

    await interaction.followUp({
      content: `Successfully updated item "${updatedItem.name}" (ID: \`${updatedItem.id}\`).`,
      ephemeral: true,
    })
    // Removed interaction.message.delete() as per user feedback
    client.messageStates.delete(messageId) // Clean up state
  } catch (error: any) {
    console.error("Error updating selectable item via components:", error)
    if (error.response && error.response.status === 404) {
      await interaction.followUp({
        content:
          "Item not found with the provided ID. It might have been deleted already.",
        ephemeral: true,
      })
    } else {
      await interaction.followUp({
        content:
          "Failed to update item due to an internal error. Please check the console for details.", // Changed message to be more generic
        ephemeral: true,
      })
    }
    client.messageStates.delete(messageId) // Clean up state on error
  }
}

async function handleCancelSelectableUpdate(interaction: any) {
  await interaction.deferUpdate() // Defer the button interaction
  await interaction.followUp({
    content: "Update cancelled.",
    ephemeral: true,
  })
  // Removed interaction.message.delete() as per user feedback
  client.messageStates.delete(interaction.message.id) // Clean up state
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
      // This is the initial select menu for choosing an item to update
      await handleUpdateItemSelect(interaction)
    } else if (interaction.customId.startsWith("update_condition_select_")) {
      await handleSelectMenuUpdate(interaction)
    } else if (interaction.customId.startsWith("update_is_foil_select_")) {
      await handleSelectMenuUpdate(interaction)
    } else if (
      interaction.customId.startsWith("update_seller_verified_select_")
    ) {
      await handleSelectMenuUpdate(interaction)
    }
  } else if (interaction.isButton()) {
    if (interaction.customId.startsWith("update_free_form_")) {
      await handleUpdateFreeFormFields(interaction)
    } else if (interaction.customId.startsWith("update_selectable_")) {
      await handleUpdateSelectableFields(interaction)
    } else if (interaction.customId.startsWith("submit_selectable_update_")) {
      await handleSubmitSelectableUpdate(interaction)
    } else if (interaction.customId.startsWith("cancel_selectable_update_")) {
      await handleCancelSelectableUpdate(interaction)
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("update_free_form_modal_")) {
      await handleFreeFormModalSubmit(interaction)
    }
    // Removed handleSelectableModalSubmit as it's no longer used
  }
})

async function handleSelectMenuUpdate(interaction: any) {
  await interaction.deferUpdate() // Defer the select menu interaction

  const selectedCustomId = interaction.customId // The customId of the select menu that was interacted with
  const selectedValue = interaction.values[0] // The newly selected value
  const messageId = interaction.message.id

  const currentItemState = client.messageStates.get(messageId)

  if (!currentItemState) {
    await interaction.followUp({
      content:
        "Error: Could not find state for this message. Please try again.",
      ephemeral: true,
    })
    return
  }

  // Update the state based on the interacted select menu
  if (selectedCustomId.startsWith("update_condition_select_")) {
    currentItemState.condition = selectedValue
  } else if (selectedCustomId.startsWith("update_is_foil_select_")) {
    currentItemState.isFoil = selectedValue === "true"
  } else if (selectedCustomId.startsWith("update_seller_verified_select_")) {
    currentItemState.sellerVerified = selectedValue === "true"
  }

  // Update the state in the map
  client.messageStates.set(messageId, currentItemState)

  // Reconstruct all select menus with updated default values based on currentItemState
  const conditionSelect = new StringSelectMenuBuilder()
    .setCustomId(`update_condition_select_${currentItemState.itemId}`)
    .setPlaceholder("Select Item Condition")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Unopened")
        .setValue("Unopened")
        .setDefault(currentItemState.condition === "Unopened"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Near Mint")
        .setValue("NearMint")
        .setDefault(currentItemState.condition === "NearMint"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Lightly Played")
        .setValue("LightlyPlayed")
        .setDefault(currentItemState.condition === "LightlyPlayed"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Moderately Played")
        .setValue("ModeratelyPlayed")
        .setDefault(currentItemState.condition === "ModeratelyPlayed"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Heavily Played")
        .setValue("HeavilyPlayed")
        .setDefault(currentItemState.condition === "HeavilyPlayed")
    )

  const isFoilSelect = new StringSelectMenuBuilder()
    .setCustomId(`update_is_foil_select_${currentItemState.itemId}`)
    .setPlaceholder("Is the item foil?")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Yes (Foil)")
        .setValue("true")
        .setDefault(currentItemState.isFoil === true),
      new StringSelectMenuOptionBuilder()
        .setLabel("No (Non-Foil)")
        .setValue("false")
        .setDefault(currentItemState.isFoil === false)
    )

  const sellerVerifiedSelect = new StringSelectMenuBuilder()
    .setCustomId(`update_seller_verified_select_${currentItemState.itemId}`)
    .setPlaceholder("Require verified sellers?")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Yes (Verified Sellers Only)")
        .setValue("true")
        .setDefault(currentItemState.sellerVerified === true),
      new StringSelectMenuOptionBuilder()
        .setLabel("No (Any Seller)")
        .setValue("false")
        .setDefault(currentItemState.sellerVerified === false)
    )

  const submitButton = new ButtonBuilder()
    .setCustomId(`submit_selectable_update_${currentItemState.itemId}`)
    .setLabel("Submit Changes")
    .setStyle(ButtonStyle.Success)

  const cancelButton = new ButtonBuilder()
    .setCustomId(`cancel_selectable_update_${currentItemState.itemId}`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Danger)

  const conditionRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      conditionSelect
    )
  const isFoilRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(isFoilSelect)
  const sellerVerifiedRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      sellerVerifiedSelect
    )
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    submitButton,
    cancelButton
  )

  await interaction.editReply({
    content: interaction.message.content, // Keep the original content
    components: [conditionRow, isFoilRow, sellerVerifiedRow, buttonRow],
  })
}

console.log("Logging in to Discord...")
client.login(config.DISCORD_TOKEN)
