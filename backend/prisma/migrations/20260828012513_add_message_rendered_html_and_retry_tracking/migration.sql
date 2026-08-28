-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "attempts_made" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "rendered_html" TEXT;
