/*
  Warnings:

  - You are about to drop the `price_history` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "price_history" DROP CONSTRAINT "price_history_monitoredItemId_fkey";

-- DropTable
DROP TABLE "price_history";
