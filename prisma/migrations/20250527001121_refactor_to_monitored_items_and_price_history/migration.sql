/*
  Warnings:

  - You are about to drop the `ItemPrice` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "ItemPrice";

-- CreateTable
CREATE TABLE "monitored_items" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION,

    CONSTRAINT "monitored_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" SERIAL NOT NULL,
    "monitoredItemId" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monitored_items_url_key" ON "monitored_items"("url");

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_monitoredItemId_fkey" FOREIGN KEY ("monitoredItemId") REFERENCES "monitored_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
