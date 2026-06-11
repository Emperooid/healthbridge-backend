/*
  Warnings:

  - You are about to drop the column `datetime` on the `appointments` table. All the data in the column will be lost.
  - You are about to drop the column `isRevoked` on the `share_links` table. All the data in the column will be lost.
  - Added the required column `scheduledAt` to the `appointments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `appointments` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('CONSULTATION', 'FOLLOW_UP', 'LAB_REVIEW', 'PROCEDURE', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ShareLinkStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "appointments" DROP COLUMN "datetime",
ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "scheduledAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "type" "AppointmentType" NOT NULL DEFAULT 'CONSULTATION';

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "assignedDoctorId" TEXT;

-- AlterTable
ALTER TABLE "share_links" DROP COLUMN "isRevoked",
ADD COLUMN     "accessCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxAccess" INTEGER,
ADD COLUMN     "status" "ShareLinkStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "scope" SET DEFAULT 'ALL',
ALTER COLUMN "scope" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "share_grants" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "grantedToId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_grants_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_grantedToId_fkey" FOREIGN KEY ("grantedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
