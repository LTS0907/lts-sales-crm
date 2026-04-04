-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "certDriveFileId" TEXT,
ADD COLUMN     "signedPdfHash" TEXT,
ADD COLUMN     "signerUserAgent" TEXT,
ADD COLUMN     "viewerIp" TEXT,
ADD COLUMN     "viewerUserAgent" TEXT;
