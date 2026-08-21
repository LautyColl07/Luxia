CREATE TABLE `ActivityLog` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NOT NULL,
  `relatedEntityType` VARCHAR(191) NULL,
  `relatedEntityId` VARCHAR(191) NULL,
  `relatedEntityName` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `ActivityLog_userId_idx`(`userId`),
  INDEX `ActivityLog_type_idx`(`type`),
  INDEX `ActivityLog_createdAt_idx`(`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ActivityLog`
  ADD CONSTRAINT `ActivityLog_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
