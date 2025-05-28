import { Router } from "express"
import type { Request, Response } from "express" // Import types explicitly
import { PrismaClient } from "@prisma/client"
import * as express from "express" // Import express as a namespace

const router = Router()
const prisma = new PrismaClient()

;(router as any).get("/price-history", async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string } // Explicitly type req.query

  if (!url || typeof url !== "string") {
    return res
      .status(400)
      .json({ error: "URL is required and must be a string." })
  }

  try {
    const priceHistory = await prisma.priceHistory.findMany({
      where: {
        url: {
          url: url,
        },
      },
      orderBy: {
        timestamp: "asc",
      },
    })

    if (priceHistory.length === 0) {
      return res
        .status(404)
        .json({ message: "No price history found for the given URL." })
    }

    res.json(priceHistory)
  } catch (error) {
    console.error("Error fetching price history:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})
;(router as any).get("/urls", async (req: Request, res: Response) => {
  try {
    const urls = await prisma.url.findMany({
      include: {
        monitoredItems: {
          select: {
            name: true,
            condition: true,
            isFoil: true,
            threshold: true,
            discordUserName: true,
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

    // Map the results to include the latest price and item name directly
    const formattedUrls = urls.map(
      (url: {
        id: string
        url: string
        imageUrl: string | null
        monitoredItems: {
          name: string | null
          discordUserName: string | null
        }[]
        priceHistory: { price: number | null }[]
      }) => ({
        id: url.id,
        url: url.url,
        imageUrl: url.imageUrl,
        monitoredItemName: url.monitoredItems[0]?.name || null, // Get name from first monitored item
        latestPrice: url.priceHistory[0]?.price || null, // Get latest price
        discordUserNames: Array.from(
          new Set(url.monitoredItems.map((item) => item.discordUserName))
        ).filter((name) => name !== null) as string[],
      })
    )

    res.json(formattedUrls)
  } catch (error) {
    console.error("Error fetching URLs:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

export default router
