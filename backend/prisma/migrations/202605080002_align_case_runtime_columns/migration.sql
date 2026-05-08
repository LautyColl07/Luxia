-- Align legacy Case table with the fields used by the current API/runtime.
-- Existing production schema already has legal-study columns, but it may still
-- be missing presentation fields introduced by the Luxia app.

SET NAMES utf8mb4;

ALTER TABLE `Case`
  ADD COLUMN IF NOT EXISTS `court` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `status` VARCHAR(191) NOT NULL DEFAULT 'Activa';

UPDATE `Case`
SET `status` = 'Activa'
WHERE `status` IS NULL OR TRIM(`status`) = '';
