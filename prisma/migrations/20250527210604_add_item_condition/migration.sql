-- CreateEnum
CREATE TYPE "conditions" AS ENUM ('Unopened', 'NearMint');

-- AlterTable
ALTER TABLE "monitored_items" ADD COLUMN     "condition" "conditions" NOT NULL DEFAULT 'NearMint';
