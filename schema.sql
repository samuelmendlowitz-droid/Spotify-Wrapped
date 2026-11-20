CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK(id=1), phase TEXT NOT NULL DEFAULT 'predictions');
INSERT OR IGNORE INTO game(id,phase) VALUES(1,'predictions');
CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, predictions TEXT NOT NULL DEFAULT '{"artists":[],"songs":[],"genres":[]}', actual TEXT NOT NULL DEFAULT '{"artists":[],"songs":[],"genres":[]}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
