-- CreateIndex
-- Supports the same-day duplicate check in sendPushToUser
-- (lib/pushNotification/server.ts), which looks up an existing identical
-- notification (same profileId/title/message/url, created today) before
-- inserting a new one. This fixes the "morning brief" notification (and
-- any other notification type) flooding the in-app list with back-to-back
-- duplicates.
CREATE INDEX "notifications_profileId_title_message_url_createdAt_idx" ON "notifications"("profileId", "title", "message", "url", "createdAt");
