-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Story" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "synopsis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "worldState" JSONB NOT NULL,
    "characterIds" JSONB NOT NULL,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Story" ("characterIds", "createdAt", "genre", "id", "scenario", "title", "worldState") SELECT "characterIds", "createdAt", "genre", "id", "scenario", "title", "worldState" FROM "Story";
DROP TABLE "Story";
ALTER TABLE "new_Story" RENAME TO "Story";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
