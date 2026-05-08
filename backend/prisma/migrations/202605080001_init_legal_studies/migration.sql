-- Legal Study migration for the existing MariaDB schema.
--
-- Confirmed legacy structure:
-- - User.id is INT AUTO_INCREMENT
-- - Case.id is INT AUTO_INCREMENT
-- - Case.createdById already references User.id
-- - Case.ownerUserId is VARCHAR(191)
-- - Case.legalStudyId is VARCHAR(191)
--
-- Design chosen for compatibility:
-- - LegalStudy.id stays VARCHAR(191)
-- - LegalStudy.ownerId is INT -> references User.id
-- - LegalStudyMember.userId is INT -> references User.id
-- - LegalStudyMember.legalStudyId is VARCHAR(191) -> references LegalStudy.id
-- - Case.createdById remains the true FK to User.id
-- - Case.ownerUserId remains a mirrored VARCHAR legacy/business column
-- - Case.legalStudyId remains VARCHAR(191) and references LegalStudy.id

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `LegalStudy` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `ownerId` INT NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LegalStudy`
  ADD COLUMN IF NOT EXISTS `name` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `description` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `ownerId` INT NULL,
  ADD COLUMN IF NOT EXISTS `deletedAt` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `LegalStudy`
  MODIFY COLUMN `id` VARCHAR(191) NOT NULL,
  MODIFY COLUMN `name` VARCHAR(191) NOT NULL,
  MODIFY COLUMN `description` TEXT NULL,
  MODIFY COLUMN `ownerId` INT NOT NULL,
  MODIFY COLUMN `deletedAt` DATETIME(3) NULL,
  MODIFY COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `LegalStudyMember` (
  `id` VARCHAR(191) NOT NULL,
  `userId` INT NOT NULL,
  `legalStudyId` VARCHAR(191) NOT NULL,
  `role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER') NOT NULL DEFAULT 'MEMBER',
  `status` ENUM('ACTIVE', 'PENDING', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LegalStudyMember`
  ADD COLUMN IF NOT EXISTS `userId` INT NULL,
  ADD COLUMN IF NOT EXISTS `legalStudyId` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER') NOT NULL DEFAULT 'MEMBER',
  ADD COLUMN IF NOT EXISTS `status` ENUM('ACTIVE', 'PENDING', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `LegalStudyMember`
  MODIFY COLUMN `id` VARCHAR(191) NOT NULL,
  MODIFY COLUMN `userId` INT NOT NULL,
  MODIFY COLUMN `legalStudyId` VARCHAR(191) NOT NULL,
  MODIFY COLUMN `role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER') NOT NULL DEFAULT 'MEMBER',
  MODIFY COLUMN `status` ENUM('ACTIVE', 'PENDING', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
  MODIFY COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ENGINE=InnoDB;

ALTER TABLE `User`
  ADD COLUMN IF NOT EXISTS `name` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `firebaseUid` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `displayName` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `firstName` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `lastName` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `role` VARCHAR(191) NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- Relax firebaseUid to support pending users before Firebase signup.
ALTER TABLE `User`
  MODIFY COLUMN `firebaseUid` VARCHAR(191) NULL;

ALTER TABLE `Case`
  ADD COLUMN IF NOT EXISTS `ownerUserId` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `legalStudyId` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `scope` ENUM('PRIVATE', 'LEGAL_STUDY') NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN IF NOT EXISTS `deletedAt` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- Mirror createdById into ownerUserId when ownerUserId is empty.
UPDATE `Case`
SET `ownerUserId` = CAST(`createdById` AS CHAR)
WHERE (`ownerUserId` IS NULL OR `ownerUserId` = '')
  AND `createdById` IS NOT NULL;

-- Existing records stay private by default unless reassigned later.
UPDATE `Case`
SET `scope` = 'PRIVATE'
WHERE `scope` IS NULL OR `scope` = '';

ALTER TABLE `Case`
  MODIFY COLUMN `ownerUserId` VARCHAR(191) NOT NULL,
  MODIFY COLUMN `legalStudyId` VARCHAR(191) NULL,
  MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- User indexes
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'User'
    AND INDEX_NAME = 'User_firebaseUid_key'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX `User_firebaseUid_key` ON `User`(`firebaseUid`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'User'
    AND INDEX_NAME = 'User_email_key'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX `User_email_key` ON `User`(`email`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- LegalStudy indexes
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'LegalStudy'
    AND INDEX_NAME = 'LegalStudy_ownerId_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `LegalStudy_ownerId_idx` ON `LegalStudy`(`ownerId`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'LegalStudy'
    AND INDEX_NAME = 'LegalStudy_deletedAt_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `LegalStudy_deletedAt_idx` ON `LegalStudy`(`deletedAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- LegalStudyMember indexes
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'LegalStudyMember'
    AND INDEX_NAME = 'LegalStudyMember_userId_legalStudyId_key'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX `LegalStudyMember_userId_legalStudyId_key` ON `LegalStudyMember`(`userId`, `legalStudyId`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'LegalStudyMember'
    AND INDEX_NAME = 'LegalStudyMember_legalStudyId_status_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `LegalStudyMember_legalStudyId_status_idx` ON `LegalStudyMember`(`legalStudyId`, `status`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Case indexes
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Case'
    AND INDEX_NAME = 'Case_ownerUserId_scope_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `Case_ownerUserId_scope_idx` ON `Case`(`ownerUserId`, `scope`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Case'
    AND INDEX_NAME = 'Case_legalStudyId_scope_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `Case_legalStudyId_scope_idx` ON `Case`(`legalStudyId`, `scope`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Case'
    AND INDEX_NAME = 'Case_deletedAt_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `Case_deletedAt_idx` ON `Case`(`deletedAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Foreign keys on LegalStudy
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'LegalStudy'
    AND CONSTRAINT_NAME = 'LegalStudy_ownerId_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `LegalStudy` ADD CONSTRAINT `LegalStudy_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Foreign keys on LegalStudyMember
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'LegalStudyMember'
    AND CONSTRAINT_NAME = 'LegalStudyMember_userId_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `LegalStudyMember` ADD CONSTRAINT `LegalStudyMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'LegalStudyMember'
    AND CONSTRAINT_NAME = 'LegalStudyMember_legalStudyId_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `LegalStudyMember` ADD CONSTRAINT `LegalStudyMember_legalStudyId_fkey` FOREIGN KEY (`legalStudyId`) REFERENCES `LegalStudy`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Foreign key from Case to LegalStudy
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Case'
    AND CONSTRAINT_NAME = 'Case_legalStudyId_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `Case` ADD CONSTRAINT `Case_legalStudyId_fkey` FOREIGN KEY (`legalStudyId`) REFERENCES `LegalStudy`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
