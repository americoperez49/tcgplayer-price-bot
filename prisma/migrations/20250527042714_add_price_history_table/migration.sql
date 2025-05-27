-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "urlId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "urls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
