import { Client, Collection, GatewayIntentBits } from "discord.js"

// Define a type for the selectable item state
interface SelectableItemState {
  itemId: string
  condition: string
  isFoil: boolean
  sellerVerified: boolean
}

// Extend the base Client class to include 'commands' and 'messageStates' properties
export class CustomClient extends Client {
  commands: Collection<string, any> // You might want to define a more specific type for 'any' later
  messageStates: Map<string, SelectableItemState> // Map to store state for messages with selectable components

  constructor(options: { intents: GatewayIntentBits[] }) {
    super(options)
    this.commands = new Collection()
    this.messageStates = new Map()
  }
}
