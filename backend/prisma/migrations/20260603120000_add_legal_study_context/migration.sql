CREATE TABLE `LegalStudy` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LegalStudyMember` (
  `id` VARCHAR(191) NOT NULL,
  `legalStudyId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `LegalStudyMember_legalStudyId_userId_key`(`legalStudyId`, `userId`),
  INDEX `LegalStudyMember_userId_idx`(`userId`),
  INDEX `LegalStudyMember_legalStudyId_idx`(`legalStudyId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Case`
  ADD COLUMN `createdById` VARCHAR(191) NULL,
  ADD COLUMN `ownerUserId` VARCHAR(191) NULL,
  ADD COLUMN `legalStudyId` VARCHAR(191) NULL;

ALTER TABLE `TranscriptSession`
  ADD COLUMN `legalStudyId` VARCHAR(191) NULL;

CREATE INDEX `Case_createdById_idx` ON `Case`(`createdById`);
CREATE INDEX `Case_ownerUserId_idx` ON `Case`(`ownerUserId`);
CREATE INDEX `Case_legalStudyId_idx` ON `Case`(`legalStudyId`);
CREATE INDEX `TranscriptSession_createdById_idx` ON `TranscriptSession`(`createdById`);
CREATE INDEX `TranscriptSession_legalStudyId_idx` ON `TranscriptSession`(`legalStudyId`);

ALTER TABLE `LegalStudyMember`
  ADD CONSTRAINT `LegalStudyMember_legalStudyId_fkey`
  FOREIGN KEY (`legalStudyId`) REFERENCES `LegalStudy`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `LegalStudyMember`
  ADD CONSTRAINT `LegalStudyMember_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Case`
  ADD CONSTRAINT `Case_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Case`
  ADD CONSTRAINT `Case_ownerUserId_fkey`
  FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Case`
  ADD CONSTRAINT `Case_legalStudyId_fkey`
  FOREIGN KEY (`legalStudyId`) REFERENCES `LegalStudy`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
