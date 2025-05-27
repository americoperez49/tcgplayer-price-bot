import { SlashCommandBuilder } from "discord.js"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export default {
  data: new SlashCommandBuilder()
    .setName("list-items")
    .setDescription(
      "Lists your monitored items or all items if you are the server owner."
    ),
  async execute(interaction: any) {
    // Use 'any' for interaction for simplicity
    await interaction.deferReply({ ephemeral: true })

    const discordUserId = interaction.user.id
    const isServerOwner = interaction.guild.ownerId === discordUserId

    let items
    try {
      if (isServerOwner) {
        items = await prisma.monitoredItem.findMany({
          include: { url: true }, // Include the related Url data
        })
      } else {
        items = await prisma.monitoredItem.findMany({
          where: { discordUserId: discordUserId },
          include: { url: true }, // Include the related Url data
        })
      }

      if (items.length === 0) {
        await interaction.editReply(
          "You are not monitoring any items. Use /add-item to add one!"
        )
        return
      }

      let replyMessage = `**${
        isServerOwner ? "All Monitored Items" : "Your Monitored Items"
      }:**\n\n`
      items.forEach((item: any) => {
        replyMessage +=
          `**Name:** ${item.name}\n` +
          `**Condition:** ${item.condition}\n` + // Display the condition
          `**URL:** ${item.url.url}\n` + // Access url from the relation
          `**Threshold:** $${item.threshold}\n` +
          `**Added by:** <@${item.discordUserId}>\n` +
          `**ID:** \`${item.id}\`\n\n`
      })

      await interaction.editReply(replyMessage)
    } catch (error) {
      console.error("Error listing items:", error)
      await interaction.editReply(
        "Failed to list items due to a database error."
      )
    } finally {
      await prisma.$disconnect()
    }
  },
}
