/*
  Warnings:

  - The primary key for the `monitored_items` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Made the column `discordUserId` on table `monitored_items` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "price_history" DROP CONSTRAINT "price_history_monitoredItemId_fkey";

-- DropIndex
DROP INDEX "monitored_items_url_key";

-- AlterTable
ALTER TABLE "monitored_items" DROP CONSTRAINT "monitored_items_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "discordUserId" SET NOT NULL,
ADD CONSTRAINT "monitored_items_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "monitored_items_id_seq";

-- AlterTable
ALTER TABLE "price_history" ALTER COLUMN "monitoredItemId" SET DATA TYPE TEXT;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_monitoredItemId_fkey" FOREIGN KEY ("monitoredItemId") REFERENCES "monitored_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
