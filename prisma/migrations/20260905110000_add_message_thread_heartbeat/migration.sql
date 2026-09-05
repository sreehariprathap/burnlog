-- The heartbeat route and message-send push-skip check already read/write
-- these columns, but the migration adding them was never created — every
-- message send fails because the SELECT in the send route references
-- columns that don't exist.
ALTER TABLE "social_message_threads"
  ADD COLUMN "participantALastActiveAt" TIMESTAMP(3),
  ADD COLUMN "participantBLastActiveAt" TIMESTAMP(3);
