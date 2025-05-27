import { REST, Routes } from "discord.js"
import "dotenv/config" // Load .env file
import path from "path" // Import path module
import fs from "fs" // Import fs module

const commands = []

// Grab all the command folders from the commands directory
const foldersPath = path.join(__dirname, "discord_bot_commands") // Corrected path
const commandFolders = fs.readdirSync(foldersPath)

for (const folder of commandFolders) {
  // Grab all the command files from the commands directory
  const commandsPath = path.join(foldersPath, folder)
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js")) // Compiled JS files
  // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file)
    const command = require(filePath).default // Access the default export
    if ("data" in command && "execute" in command) {
      commands.push(command.data.toJSON())
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      )
    }
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN || "")

// and deploy your commands!
;(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`
    )

    // The put method is used to fully refresh all commands in the guild with the current set
    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID || "",
        process.env.SERVER_ID || ""
      ), // Use CLIENT_ID and SERVER_ID from .env
      { body: commands }
    )

    console.log(
      `Successfully reloaded ${
        Array.isArray(data) ? data.length : "unknown number of"
      } application (/) commands.`
    )
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error)
  }
})()
