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
    ),
  async execute(interaction: any) {
    // Use 'any' for interaction for simplicity
    const itemName = interaction.options.getString("name")
    const itemUrl = interaction.options.getString("url")
    const itemThreshold = interaction.options.getNumber("threshold")
    const discordUserId = interaction.user.id // Get the Discord user ID

    await interaction.deferReply({ ephemeral: true }) // Defer reply as database operation might take time

    try {
      const newItem = await prisma.monitoredItem.create({
        data: {
          name: itemName,
          url: itemUrl,
          threshold: itemThreshold,
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
