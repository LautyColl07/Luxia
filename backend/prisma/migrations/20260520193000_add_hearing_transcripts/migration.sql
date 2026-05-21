CREATE TABLE `User` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NULL,
  `name` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Case` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `Case_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Hearing` (
  `id` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NULL,
  `date` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `Hearing_caseId_idx`(`caseId`),
  INDEX `Hearing_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `File` (
  `id` VARCHAR(191) NOT NULL,
  `hearingId` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `fileName` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NULL,
  `path` TEXT NOT NULL,
  `documentType` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `File_caseId_idx`(`caseId`),
  INDEX `File_hearingId_idx`(`hearingId`),
  INDEX `File_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Transcript` (
  `id` VARCHAR(191) NOT NULL,
  `hearingId` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `text` LONGTEXT NOT NULL,
  `audioPath` TEXT NULL,
  `pdfPath` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'recording',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `Transcript_hearingId_userId_key`(`hearingId`, `userId`),
  INDEX `Transcript_caseId_idx`(`caseId`),
  INDEX `Transcript_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Case`
  ADD CONSTRAINT `Case_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Hearing`
  ADD CONSTRAINT `Hearing_caseId_fkey`
  FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Hearing`
  ADD CONSTRAINT `Hearing_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `File`
  ADD CONSTRAINT `File_caseId_fkey`
  FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `File`
  ADD CONSTRAINT `File_hearingId_fkey`
  FOREIGN KEY (`hearingId`) REFERENCES `Hearing`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `File`
  ADD CONSTRAINT `File_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Transcript`
  ADD CONSTRAINT `Transcript_caseId_fkey`
  FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Transcript`
  ADD CONSTRAINT `Transcript_hearingId_fkey`
  FOREIGN KEY (`hearingId`) REFERENCES `Hearing`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Transcript`
  ADD CONSTRAINT `Transcript_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
