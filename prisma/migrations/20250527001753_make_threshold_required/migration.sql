/*
  Warnings:

  - Made the column `threshold` on table `monitored_items` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "monitored_items" ALTER COLUMN "threshold" SET NOT NULL;
