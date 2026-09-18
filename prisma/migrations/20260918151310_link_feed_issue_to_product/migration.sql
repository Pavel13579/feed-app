-- CreateIndex
CREATE INDEX "FeedIssue_productId_idx" ON "FeedIssue"("productId");

-- AddForeignKey
ALTER TABLE "FeedIssue" ADD CONSTRAINT "FeedIssue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
