import { SlashCommandBuilder } from "discord.js"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export default {
  data: new SlashCommandBuilder()
    .setName("add-item")
    .setDescription("Adds a new item to monitor for price changes.")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription(
          'The name of the item (e.g., "Collector Booster Display")'
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("The TCGPlayer URL of the item")
        .setRequired(true)
    )
    .addNumberOption((option) =>
      option
        .setName("threshold")
        .setDescription("The price threshold below which to send an alert")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("condition")
        .setDescription('The condition of the item ("Unopened" or "Near Mint")')
        .setRequired(true)
        .addChoices(
          { name: "Unopened", value: "Unopened" },
          { name: "Near Mint", value: "NearMint" },
          { name: "Lightly Played", value: "LightlyPlayed" }, // New choice
          { name: "Moderately Played", value: "ModeratelyPlayed" },
          { name: "Heavily Played", value: "HeavilyPlayed" }
        )
    ),
  async execute(interaction: any) {
    // Use 'any' for interaction for simplicity
    const itemName = interaction.options.getString("name")
    const itemUrl = interaction.options.getString("url")
    const itemThreshold = interaction.options.getNumber("threshold")
    const itemCondition = interaction.options.getString("condition") // Get the condition
    const discordUserId = interaction.user.id // Get the Discord user ID

    if (itemName.length > 45) {
      await interaction.reply({
        content: "Item name cannot exceed 45 characters.",
        ephemeral: true,
      })
      return
    }

    await interaction.deferReply({ ephemeral: true }) // Defer reply as database operation might take time

    try {
      let urlRecord = await prisma.url.findUnique({
        where: { url: itemUrl },
      })

      if (!urlRecord) {
        urlRecord = await prisma.url.create({
          data: { url: itemUrl },
        })
      }

      const newItem = await prisma.monitoredItem.create({
        data: {
          name: itemName,
          urlId: urlRecord.id, // Use the ID from the Url record
          threshold: itemThreshold,
          condition: itemCondition, // Include the condition
          discordUserId: discordUserId, // Include the Discord user ID
        },
      })

      await interaction.editReply(
        `Successfully added "${newItem.name}" to monitored items (threshold: $${newItem.threshold}) by user <@${newItem.discordUserId}>.`
      )
    } catch (error: any) {
      if (error.code === "P2002" && error.meta?.target?.includes("url")) {
        await interaction.editReply(
          "Failed to add item: An item with this URL is already being monitored."
        )
      } else {
        console.error("Error adding item to database:", error)
        await interaction.editReply(
          "Failed to add item due to a database error. Please check the console for details."
        )
      }
    } finally {
      await prisma.$disconnect() // Disconnect Prisma client after operation
    }
  },
}
