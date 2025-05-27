/*
  Warnings:

  - You are about to drop the column `url` on the `monitored_items` table. All the data in the column will be lost.
  - Added the required column `urlId` to the `monitored_items` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "monitored_items" DROP COLUMN "url",
ADD COLUMN     "urlId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "urls" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "urls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "urls_url_key" ON "urls"("url");

-- AddForeignKey
ALTER TABLE "monitored_items" ADD CONSTRAINT "monitored_items_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "urls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
