/*
  Warnings:

  - The `summary` column on the `Note` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."Note" DROP COLUMN "summary",
ADD COLUMN     "summary" JSONB;
