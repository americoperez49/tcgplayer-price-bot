import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export default {
  data: new SlashCommandBuilder()
    .setName("delete-item")
    .setDescription("Deletes a monitored item by selecting from a list."),
  async execute(interaction: any) {
    // Use 'any' for interaction for simplicity
    await interaction.deferReply({ ephemeral: true })

    const discordUserId = interaction.user.id
    const isServerOwner = interaction.guild.ownerId === discordUserId

    let items
    try {
      if (isServerOwner) {
        items = await prisma.monitoredItem.findMany()
      } else {
        items = await prisma.monitoredItem.findMany({
          where: { discordUserId: discordUserId },
        })
      }

      if (items.length === 0) {
        await interaction.editReply(
          "You are not monitoring any items to delete."
        )
        return
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("delete_item_select")
        .setPlaceholder("Select an item to delete")

      items.forEach((item: any) => {
        selectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(`${item.name} (ID: ${item.id.substring(0, 8)}...)`) // Truncate ID for display
            .setValue(item.id)
        )
      })

      const actionRow = new ActionRowBuilder().addComponents(selectMenu)

      await interaction.editReply({
        content: "Please select an item to delete:",
        components: [actionRow],
      })
    } catch (error) {
      console.error("Error preparing delete menu:", error)
      await interaction.editReply(
        "Failed to prepare delete menu due to a database error."
      )
    } finally {
      await prisma.$disconnect()
    }
  },
}
