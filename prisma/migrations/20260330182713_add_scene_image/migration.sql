-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Scene" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "storyId" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "playerInput" TEXT,
    "imageStatus" TEXT NOT NULL DEFAULT 'none',
    "imageUrl" TEXT,
    "imagePrompt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Scene_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Scene" ("chapter", "createdAt", "id", "playerInput", "storyId", "text") SELECT "chapter", "createdAt", "id", "playerInput", "storyId", "text" FROM "Scene";
DROP TABLE "Scene";
ALTER TABLE "new_Scene" RENAME TO "Scene";
CREATE INDEX "Scene_storyId_idx" ON "Scene"("storyId");
CREATE TABLE "new_Story" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "genre" TEXT NOT NULL DEFAULT 'fantasia urbana',
    "scenario" TEXT NOT NULL DEFAULT '',
    "synopsis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "worldState" JSONB NOT NULL,
    "characterIds" JSONB NOT NULL DEFAULT [],
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Story" ("characterIds", "createdAt", "genre", "id", "lastActivityAt", "messageCount", "scenario", "status", "synopsis", "title", "worldState") SELECT "characterIds", "createdAt", "genre", "id", "lastActivityAt", "messageCount", "scenario", "status", "synopsis", "title", "worldState" FROM "Story";
DROP TABLE "Story";
ALTER TABLE "new_Story" RENAME TO "Story";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
