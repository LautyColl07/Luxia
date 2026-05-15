CREATE TABLE `TranscriptSession` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'recording',
  `caseId` VARCHAR(191) NULL,
  `hearingId` VARCHAR(191) NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TranscriptChunk` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `chunkIndex` INTEGER NOT NULL,
  `startTime` DOUBLE NULL,
  `endTime` DOUBLE NULL,
  `text` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `TranscriptChunk_sessionId_chunkIndex_key`
  ON `TranscriptChunk`(`sessionId`, `chunkIndex`);

CREATE INDEX `TranscriptChunk_sessionId_idx`
  ON `TranscriptChunk`(`sessionId`);

ALTER TABLE `TranscriptChunk`
  ADD CONSTRAINT `TranscriptChunk_sessionId_fkey`
  FOREIGN KEY (`sessionId`)
  REFERENCES `TranscriptSession`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
