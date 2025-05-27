import { Client, Collection, GatewayIntentBits } from "discord.js"

// Extend the base Client class to include a 'commands' property
export class CustomClient extends Client {
  commands: Collection<string, any> // You might want to define a more specific type for 'any' later

  constructor(options: { intents: GatewayIntentBits[] }) {
    super(options)
    this.commands = new Collection()
  }
}
