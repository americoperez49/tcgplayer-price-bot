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
    .setName("update-item")
    .setDescription("Select an item to update its details."),
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
          "You are not monitoring any items to update."
        )
        return
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("update_item_select")
        .setPlaceholder("Select an item to update")

      items.forEach((item: any) => {
        selectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(`${item.name} (ID: ${item.id.substring(0, 8)}...)`) // Truncate ID for display
            .setValue(item.id)
        )
      })

      const actionRow = new ActionRowBuilder().addComponents(selectMenu)

      await interaction.editReply({
        content: "Please select an item to update:",
        components: [actionRow],
      })
    } catch (error) {
      console.error("Error preparing update menu:", error)
      await interaction.editReply(
        "Failed to prepare update menu due to a database error."
      )
    } finally {
      await prisma.$disconnect()
    }
  },
}
