import { Router } from "express"
import type { Request, Response } from "express"
import { PrismaClient } from "@prisma/client"
import { io } from "../index" // Import the Socket.IO server instance

const router = Router()
const prisma = new PrismaClient()

// Endpoint to get all monitored items with their associated URL data
;(router as any).get(
  "/monitored-items",
  async (req: Request, res: Response) => {
    try {
      const items = await prisma.monitoredItem.findMany({
        include: { url: true },
      })
      res.json(items)
    } catch (error) {
      console.error("Error fetching monitored items:", error)
      res.status(500).json({ error: "Internal server error." })
    }
  }
)

// Endpoint to update a URL's image URL
;(router as any).put(
  "/urls/:id/image-url",
  async (req: Request, res: Response) => {
    const { id } = req.params
    const { imageUrl } = req.body

    if (!imageUrl || typeof imageUrl !== "string") {
      return res
        .status(400)
        .json({ error: "Image URL is required and must be a string." })
    }

    try {
      const updatedUrl = await prisma.url.update({
        where: { id: id },
        data: { imageUrl: imageUrl },
      })
      res.json(updatedUrl)
    } catch (error) {
      console.error(`Error updating image URL for URL ID ${id}:`, error)
      res.status(500).json({ error: "Internal server error." })
    }
  }
)

// Endpoint to get the latest price history for a specific URL
;(router as any).get(
  "/price-history/latest/:urlId",
  async (req: Request, res: Response) => {
    const { urlId } = req.params

    try {
      const lastPriceRecord = await prisma.priceHistory.findFirst({
        where: { urlId: urlId },
        orderBy: { timestamp: "desc" },
      })
      if (lastPriceRecord) {
        res.json(lastPriceRecord)
      } else {
        res
          .status(404)
          .json({ message: "No price history found for this URL." })
      }
    } catch (error) {
      console.error(
        `Error fetching latest price history for URL ID ${urlId}:`,
        error
      )
      res.status(500).json({ error: "Internal server error." })
    }
  }
)

// Endpoint to create a new price history entry and notify via WebSocket
;(router as any).post("/price-history", async (req: Request, res: Response) => {
  const { urlId, price } = req.body

  if (!urlId || typeof urlId !== "string" || typeof price !== "number") {
    return res
      .status(400)
      .json({ error: "urlId (string) and price (number) are required." })
  }

  try {
    const newPriceHistory = await prisma.priceHistory.create({
      data: {
        urlId: urlId,
        price: price,
      },
    })

    // Update hasPriceChanged flag for the URL
    const updatedUrl = await prisma.url.update({
      where: { id: urlId },
      data: { hasPriceChanged: true },
      include: {
        monitoredItems: {
          select: {
            name: true,
            condition: true,
            isFoil: true,
            threshold: true,
            discordUserName: true,
            sellerVerified: true, // Include sellerVerified
          },
        },
        priceHistory: {
          orderBy: {
            timestamp: "desc",
          },
          take: 1, // Get only the latest price
        },
      },
    })

    // Prepare data for WebSocket notification
    const notificationData = {
      id: updatedUrl.id,
      url: updatedUrl.url,
      imageUrl: updatedUrl.imageUrl,
      hasPriceChanged: updatedUrl.hasPriceChanged,
      monitoredItemName: updatedUrl.monitoredItems[0]?.name || null,
      latestPrice: updatedUrl.priceHistory[0]?.price || null,
      discordUserNames: Array.from(
        new Set(updatedUrl.monitoredItems.map((item) => item.discordUserName))
      ).filter((name) => name !== null) as string[],
    }

    // Notify all connected Socket.IO clients
    io.emit("priceUpdate", notificationData)

    res.status(201).json(newPriceHistory)
  } catch (error) {
    console.error(
      "Error creating price history entry or sending WebSocket notification:",
      error
    )
    res.status(500).json({ error: "Internal server error." })
  }
})

// Endpoint to find users monitoring a specific URL
;(router as any).get(
  "/monitored-items/users-to-notify/:urlId",
  async (req: Request, res: Response) => {
    const { urlId } = req.params

    try {
      const usersToNotify = await prisma.monitoredItem.findMany({
        where: { urlId: urlId },
        select: { discordUserId: true },
      })
      res.json(usersToNotify)
    } catch (error) {
      console.error(
        `Error fetching users to notify for URL ID ${urlId}:`,
        error
      )
      res.status(500).json({ error: "Internal server error." })
    }
  }
)

// Endpoint to find a unique monitored item
;(router as any).get(
  "/monitored-items/:id",
  async (req: Request, res: Response) => {
    const { id } = req.params

    try {
      const item = await prisma.monitoredItem.findUnique({
        where: { id: id },
        include: { url: true },
      })
      if (item) {
        res.json(item)
      } else {
        res.status(404).json({ message: "Monitored item not found." })
      }
    } catch (error) {
      console.error(`Error fetching monitored item ${id}:`, error)
      res.status(500).json({ error: "Internal server error." })
    }
  }
)

// Endpoint to delete a monitored item
;(router as any).delete(
  "/monitored-items/:id",
  async (req: Request, res: Response) => {
    const { id } = req.params

    try {
      await prisma.monitoredItem.delete({
        where: { id: id },
      })
      res.status(204).send() // No content on successful deletion
    } catch (error) {
      console.error(`Error deleting monitored item ${id}:`, error)
      res.status(500).json({ error: "Internal server error." })
    }
  }
)

// Endpoint to find a URL by its string
;(router as any).get("/urls/by-string", async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string }

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL string is required." })
  }

  try {
    const urlRecord = await prisma.url.findUnique({
      where: { url: url },
    })
    if (urlRecord) {
      res.json(urlRecord)
    } else {
      res.status(404).json({ message: "URL not found." })
    }
  } catch (error) {
    console.error(`Error finding URL by string ${url}:`, error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Endpoint to create a new URL
;(router as any).post("/urls", async (req: Request, res: Response) => {
  const { url } = req.body

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL string is required." })
  }

  try {
    const newUrl = await prisma.url.create({
      data: { url: url },
    })
    res.status(201).json(newUrl)
  } catch (error) {
    console.error(`Error creating URL ${url}:`, error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Endpoint to update a monitored item
;(router as any).put(
  "/monitored-items/:id",
  async (req: Request, res: Response) => {
    const { id } = req.params
    const updateData = req.body // Expecting an object with fields to update

    try {
      const updatedItem = await prisma.monitoredItem.update({
        where: { id: id },
        data: updateData,
      })
      res.json(updatedItem)
    } catch (error) {
      console.error(`Error updating monitored item ${id}:`, error)
      res.status(500).json({ error: "Internal server error." })
    }
  }
)

// Endpoint to acknowledge price change (set hasPriceChanged to false)
;(router as any).put(
  "/urls/:id/acknowledge-price-change",
  async (req: Request, res: Response) => {
    const { id } = req.params

    try {
      const updatedUrl = await prisma.url.update({
        where: { id: id },
        data: { hasPriceChanged: false },
      })
      res.json(updatedUrl)
    } catch (error) {
      console.error(`Error acknowledging price change for URL ID ${id}:`, error)
      res.status(500).json({ error: "Internal server error." })
    }
  }
)

export default router
