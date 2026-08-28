-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "external_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_external_id_key" ON "tenants"("external_id");
