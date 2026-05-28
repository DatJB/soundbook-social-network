create database soundbook_db;
use soundbook_db;
-- Notes:
-- 1) dm_threads: app MUST store ordered pair user1_id < user2_id to make UNIQUE work.
-- 2) reactions.target_id is polymorphic (POST/COMMENT) so no FK for target_id.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ===================== CORE =====================
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  email         VARCHAR(255) NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  google_sub    VARCHAR(255) NULL UNIQUE,
  display_name  VARCHAR(100) NOT NULL,
  role          ENUM('USER','MODERATOR','ADMIN') NOT NULL DEFAULT 'USER',
  status        ENUM('ACTIVE','BANNED','DELETED') NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id              BIGINT PRIMARY KEY,
  username             VARCHAR(50) NOT NULL UNIQUE,
  avatar_url           VARCHAR(500) NULL,
  cover_url            VARCHAR(500) NULL,
  bio                  VARCHAR(500) NULL,
  public_info          VARCHAR(1000) NULL,
  bio_visibility       ENUM('PUBLIC','FRIENDS','FOLLOWERS','PRIVATE') NOT NULL DEFAULT 'PUBLIC',
  public_info_visibility ENUM('PUBLIC','FRIENDS','FOLLOWERS','PRIVATE') NOT NULL DEFAULT 'PUBLIC',
  theme_mode           ENUM('LIGHT','DARK','AUTO') NOT NULL DEFAULT 'AUTO',
  pinned_track_id      VARCHAR(64) NULL,
  pinned_track_visibility ENUM('PUBLIC','FRIENDS','FOLLOWERS','PRIVATE') NOT NULL DEFAULT 'PUBLIC',
  allow_preview_player TINYINT(1) NOT NULL DEFAULT 1,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id         BIGINT PRIMARY KEY,
  music_connected TINYINT(1) NOT NULL DEFAULT 0,
  music_dna_ready TINYINT(1) NOT NULL DEFAULT 0,
  book_dna_ready  TINYINT(1) NOT NULL DEFAULT 0,
  taste_dna_ready TINYINT(1) NOT NULL DEFAULT 0,
  completed_at    DATETIME NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_onboarding_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== OAUTH (SPOTIFY) =====================
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id          BIGINT NOT NULL,
  provider         ENUM('SPOTIFY') NOT NULL,
  provider_user_id VARCHAR(128) NOT NULL,
  status           ENUM('CONNECTED','DISCONNECTED','ERROR') NOT NULL DEFAULT 'CONNECTED',
  scope            VARCHAR(500) NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_oauth_user_provider UNIQUE (user_id, provider),
  CONSTRAINT uq_oauth_provider_user UNIQUE (provider, provider_user_id),
  CONSTRAINT fk_oauth_accounts_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  oauth_account_id BIGINT NOT NULL,
  access_token     TEXT NOT NULL,
  refresh_token    TEXT NULL,
  expires_at       DATETIME NOT NULL,
  token_type       VARCHAR(20) NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_oauth_tokens_account (oauth_account_id),
  CONSTRAINT fk_oauth_tokens_account
    FOREIGN KEY (oauth_account_id) REFERENCES oauth_accounts(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== DNA =====================
CREATE TABLE IF NOT EXISTS user_music_dna (
  user_id       BIGINT PRIMARY KEY,
  built_from    ENUM('MANUAL','SPOTIFY','MIXED') NOT NULL DEFAULT 'MANUAL',
  prefs_json    JSON NOT NULL,
  vector_json   JSON NOT NULL,
  confidence    DECIMAL(3,2) NOT NULL DEFAULT 0.55,
  version       INT NOT NULL DEFAULT 1,
  calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_music_dna_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_book_dna (
  user_id       BIGINT PRIMARY KEY,
  prefs_json    JSON NOT NULL,
  vector_json   JSON NOT NULL,
  confidence    DECIMAL(3,2) NOT NULL DEFAULT 0.55,
  version       INT NOT NULL DEFAULT 1,
  calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_book_dna_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_taste_dna (
  user_id           BIGINT PRIMARY KEY,
  music_vector_json JSON NOT NULL,
  book_vector_json  JSON NOT NULL,
  music_confidence  DECIMAL(3,2) NOT NULL DEFAULT 0.55,
  book_confidence   DECIMAL(3,2) NOT NULL DEFAULT 0.55,
  w_music           DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  w_book            DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  version           INT NOT NULL DEFAULT 1,
  calculated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_taste_dna_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== POSTS / FEED =====================
CREATE TABLE IF NOT EXISTS posts (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT NOT NULL,
  type         ENUM('MUSIC_QUICK_NOTE','BOOK_READING_UPDATE','BOOK_QUOTE_CARD','BOOK_REVIEW','BLOG') NOT NULL,
  visibility   ENUM('PUBLIC','FRIENDS','FOLLOWERS','PRIVATE') NOT NULL DEFAULT 'PUBLIC',
  caption      TEXT NULL,
  content_rich LONGTEXT NULL,
  ref_json     JSON NULL,
  mood_tag     VARCHAR(50) NULL,
  comments_enabled TINYINT(1) NOT NULL DEFAULT 1,
  share_count BIGINT NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_posts_created (created_at),
  INDEX idx_posts_user_created (user_id, created_at),
  CONSTRAINT fk_posts_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS post_media (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  post_id    BIGINT NOT NULL,
  media_type ENUM('IMAGE','VIDEO') NOT NULL,
  url        VARCHAR(500) NOT NULL,
  width      INT NULL,
  height     INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_post_media_post (post_id),
  CONSTRAINT fk_post_media_post
    FOREIGN KEY (post_id) REFERENCES posts(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comments (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  post_id    BIGINT NOT NULL,
  user_id    BIGINT NOT NULL,
  parent_id  BIGINT NULL,
  content    TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_comments_post_created (post_id, created_at),
  INDEX idx_comments_user (user_id),
  INDEX idx_comments_parent (parent_id),
  CONSTRAINT fk_comments_post
    FOREIGN KEY (post_id) REFERENCES posts(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_comments_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_comments_parent
    FOREIGN KEY (parent_id) REFERENCES comments(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reactions (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       BIGINT NOT NULL,
  target_type   ENUM('POST','COMMENT') NOT NULL,
  target_id     BIGINT NOT NULL,
  reaction_type ENUM('LIKE','HEART','FIRE', 'HAHA', 'WOW','SAD','ANGRY') NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_reaction_once UNIQUE (user_id, target_type, target_id),
  INDEX idx_reactions_target (target_type, target_id),
  CONSTRAINT fk_reactions_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== COLLECTIONS =====================
CREATE TABLE IF NOT EXISTS user_music_collection (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id     BIGINT NOT NULL,
  item_type   ENUM('TRACK','ALBUM','PLAYLIST') NOT NULL,
  item_id     VARCHAR(64) NOT NULL,
  title       VARCHAR(300) NOT NULL,
  subtitle    VARCHAR(300) NULL,
  cover_url   VARCHAR(500) NULL,
  preview_url VARCHAR(500) NULL,
  visibility  ENUM('PUBLIC','FRIENDS','FOLLOWERS','PRIVATE') NOT NULL DEFAULT 'PUBLIC',
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_music_collection_user (user_id, sort_order),
  CONSTRAINT fk_music_collection_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bookshelves (
  id   INT PRIMARY KEY,
  code ENUM('WILL_READ','READING','FINISHED','DROPPED') NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_bookshelf_items (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id           BIGINT NOT NULL,
  shelf_id          INT NOT NULL,
  book_key          VARCHAR(128) NOT NULL,
  book_payload_json JSON NOT NULL,
  progress_page     INT NULL,
  progress_percent  DECIMAL(5,2) NULL,
  rating            TINYINT NULL,
  visibility        ENUM('PUBLIC','FRIENDS','FOLLOWERS','PRIVATE') NOT NULL DEFAULT 'PUBLIC',
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_shelf_book UNIQUE (user_id, shelf_id, book_key),
  INDEX idx_bookshelf_user_shelf_updated (user_id, shelf_id, updated_at),
  CONSTRAINT fk_user_bookshelf_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_user_bookshelf_shelf
    FOREIGN KEY (shelf_id) REFERENCES bookshelves(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== CONNECTIONS =====================
CREATE TABLE IF NOT EXISTS follows (
  follower_id BIGINT NOT NULL,
  followee_id BIGINT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, followee_id),
  INDEX idx_follows_follower (follower_id),
  INDEX idx_follows_followee (followee_id),
  CONSTRAINT fk_follows_follower
    FOREIGN KEY (follower_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_follows_followee
    FOREIGN KEY (followee_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS friend_requests (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  requester_id BIGINT NOT NULL,
  receiver_id  BIGINT NOT NULL,
  status       ENUM('PENDING','ACCEPTED','DECLINED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Nếu muốn cho phép gửi lại request sau khi DECLINED/ACCEPTED thì bỏ UNIQUE này và enforce bằng app
  CONSTRAINT uq_friend_request_pair UNIQUE (requester_id, receiver_id),
  INDEX idx_friend_requests_receiver_status (receiver_id, status, created_at),
  CONSTRAINT fk_friend_requests_requester
    FOREIGN KEY (requester_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_friend_requests_receiver
    FOREIGN KEY (receiver_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS friendships (
  user_id    BIGINT NOT NULL,
  friend_id  BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, friend_id),
  INDEX idx_friendships_user (user_id),
  CONSTRAINT fk_friendships_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_friendships_friend
    FOREIGN KEY (friend_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== ROOMS =====================
CREATE TABLE IF NOT EXISTS rooms (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  host_user_id BIGINT NOT NULL,
  name         VARCHAR(120) NOT NULL,
  topic        VARCHAR(200) NULL,
  is_public    TINYINT(1) NOT NULL DEFAULT 1,
  status       ENUM('LIVE','ENDED') NOT NULL DEFAULT 'LIVE',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at     DATETIME NULL,
  is_closed_by_admin TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_rooms_status_created (status, created_at),
  CONSTRAINT fk_rooms_host
    FOREIGN KEY (host_user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS room_members (
  room_id   BIGINT NOT NULL,
  user_id   BIGINT NOT NULL,
  role      ENUM('HOST','MEMBER','PENDING') NOT NULL DEFAULT 'MEMBER',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at   DATETIME NULL,
  is_banned TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, user_id),
  INDEX idx_room_members_user (user_id),
  CONSTRAINT fk_room_members_room
    FOREIGN KEY (room_id) REFERENCES rooms(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_room_members_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migration for existing databases
ALTER TABLE room_members MODIFY COLUMN role ENUM('HOST','MEMBER','PENDING') NOT NULL DEFAULT 'MEMBER';

CREATE TABLE IF NOT EXISTS room_playback_state (
  room_id            BIGINT PRIMARY KEY,
  track_id           VARCHAR(64) NULL,
  track_payload_json JSON NULL,
  position_ms        INT NOT NULL DEFAULT 0,
  is_playing         TINYINT(1) NOT NULL DEFAULT 0,
  updated_by         BIGINT NULL,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_room_playback_room
    FOREIGN KEY (room_id) REFERENCES rooms(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_room_playback_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS room_messages (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  room_id      BIGINT NOT NULL,
  sender_id    BIGINT NOT NULL,
  content_type ENUM('TEXT','EMOJI','REACTION_GIF') NOT NULL DEFAULT 'TEXT',
  content_text TEXT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_room_messages_room_created (room_id, created_at),
  INDEX idx_room_messages_sender (sender_id),
  CONSTRAINT fk_room_messages_room
    FOREIGN KEY (room_id) REFERENCES rooms(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_room_messages_sender
    FOREIGN KEY (sender_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS room_queue (
  id                 BIGINT PRIMARY KEY AUTO_INCREMENT,
  room_id            BIGINT NOT NULL,
  track_id           VARCHAR(64) NOT NULL,
  track_payload_json JSON NOT NULL,
  added_by_id        BIGINT NOT NULL,
  vote_count         INT NOT NULL DEFAULT 0,
  position_order     INT NOT NULL DEFAULT 0,
  played_at          DATETIME NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_room_queue_room_order (room_id, position_order),
  INDEX idx_room_queue_room_played (room_id, played_at),
  CONSTRAINT fk_room_queue_room
    FOREIGN KEY (room_id) REFERENCES rooms(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_room_queue_added_by
    FOREIGN KEY (added_by_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== DM =====================
CREATE TABLE IF NOT EXISTS dm_threads (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user1_id   BIGINT NOT NULL,
  user2_id   BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_dm_thread_pair UNIQUE (user1_id, user2_id),
  INDEX idx_dm_threads_user1_updated (user1_id, updated_at),
  INDEX idx_dm_threads_user2_updated (user2_id, updated_at),
  CONSTRAINT fk_dm_threads_user1
    FOREIGN KEY (user1_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_dm_threads_user2
    FOREIGN KEY (user2_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dm_messages (
  id                   BIGINT PRIMARY KEY AUTO_INCREMENT,
  thread_id            BIGINT NOT NULL,
  sender_id            BIGINT NOT NULL,
  message_type         ENUM('TEXT','CARD') NOT NULL DEFAULT 'TEXT',
  content_text         TEXT NULL,
  card_payload_json    JSON NULL,
  reply_to_message_id  BIGINT NULL,
  delivered_at         DATETIME NULL,
  seen_at              DATETIME NULL,
  deleted_for_sender   TINYINT(1) NOT NULL DEFAULT 0,
  deleted_for_receiver TINYINT(1) NOT NULL DEFAULT 0,
  deleted_for_everyone TINYINT(1) NOT NULL DEFAULT 0,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dm_messages_thread_created (thread_id, created_at),
  INDEX idx_dm_messages_sender (sender_id),
  CONSTRAINT fk_dm_messages_thread
    FOREIGN KEY (thread_id) REFERENCES dm_threads(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_dm_messages_sender
    FOREIGN KEY (sender_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_dm_messages_reply
    FOREIGN KEY (reply_to_message_id) REFERENCES dm_messages(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== NOTIFICATIONS =====================
CREATE TABLE IF NOT EXISTS notifications (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       BIGINT NOT NULL, -- recipient
  type          ENUM('LIKE','COMMENT','FOLLOW','FRIEND_REQUEST','ROOM_INVITE','MATCH') NOT NULL,
  actor_user_id BIGINT NULL,
  target_type   ENUM('POST','COMMENT','ROOM','USER','DM_THREAD') NULL,
  target_id     BIGINT NULL,
  content       VARCHAR(300) NULL,
  is_read       TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user_created (user_id, created_at),
  INDEX idx_notifications_user_read (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_recipient
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notifications_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== REPORTS =====================
CREATE TABLE IF NOT EXISTS reports (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  reporter_id   BIGINT NOT NULL, -- người báo cáo
  target_type   ENUM('POST','COMMENT','USER','DM_MESSAGE') NOT NULL,
  target_id     BIGINT NOT NULL,

  reason        ENUM(
    'SPAM',
    'HARASSMENT',
    'HATE_SPEECH',
    'NUDITY',
    'VIOLENCE',
    'MISINFORMATION',
    'OTHER'
  ) NOT NULL,

  description   VARCHAR(500) NULL, -- user ghi thêm

  status        ENUM('PENDING','REVIEWED','RESOLVED','REJECTED')
                NOT NULL DEFAULT 'PENDING',

  reviewed_by   BIGINT NULL, -- admin/mod
  reviewed_at   DATETIME NULL,

  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- tránh spam report cùng 1 target
  CONSTRAINT uq_report_once
    UNIQUE (reporter_id, target_type, target_id),

  INDEX idx_reports_target (target_type, target_id),
  INDEX idx_reports_status (status),

  CONSTRAINT fk_reports_reporter
    FOREIGN KEY (reporter_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_reports_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
