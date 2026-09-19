-- AlterTable
ALTER TABLE "Feed" ADD COLUMN     "errorCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "healthScore" INTEGER,
ADD COLUMN     "warningCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FeedIssue" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT,

    CONSTRAINT "FeedIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedIssue_feedId_code_idx" ON "FeedIssue"("feedId", "code");

-- CreateIndex
CREATE INDEX "FeedIssue_feedId_productId_idx" ON "FeedIssue"("feedId", "productId");

-- AddForeignKey
ALTER TABLE "FeedIssue" ADD CONSTRAINT "FeedIssue_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "Feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
