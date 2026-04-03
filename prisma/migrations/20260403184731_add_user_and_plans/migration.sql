-- AlterTable
ALTER TABLE "Scene" ADD COLUMN "finalPrompt" TEXT;
ALTER TABLE "Scene" ADD COLUMN "negativePrompt" TEXT;
ALTER TABLE "Scene" ADD COLUMN "providerModel" TEXT;
ALTER TABLE "Scene" ADD COLUMN "referenceImageUrl" TEXT;
ALTER TABLE "Scene" ADD COLUMN "seed" INTEGER;
ALTER TABLE "Scene" ADD COLUMN "styleProfile" TEXT;

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Character" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "goals" TEXT NOT NULL,
    "limits" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "canonicalDescription" TEXT,
    "visualTraits" TEXT,
    "styleProfile" TEXT,
    "negativePrompt" TEXT,
    "seed" INTEGER,
    "referenceImageUrl" TEXT,
    "userId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Character" ("avatarUrl", "canonicalDescription", "createdAt", "description", "goals", "id", "limits", "name", "negativePrompt", "persona", "seed", "styleProfile", "visualTraits") SELECT "avatarUrl", "canonicalDescription", "createdAt", "description", "goals", "id", "limits", "name", "negativePrompt", "persona", "seed", "styleProfile", "visualTraits" FROM "Character";
DROP TABLE "Character";
ALTER TABLE "new_Character" RENAME TO "Character";
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
    "userId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishStatus" TEXT NOT NULL DEFAULT 'draft',
    "coverImageUrl" TEXT,
    "comicStripUrl" TEXT,
    CONSTRAINT "Story_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Story" ("characterIds", "coverImageUrl", "createdAt", "genre", "id", "lastActivityAt", "messageCount", "publishStatus", "scenario", "status", "synopsis", "title", "worldState") SELECT "characterIds", "coverImageUrl", "createdAt", "genre", "id", "lastActivityAt", "messageCount", "publishStatus", "scenario", "status", "synopsis", "title", "worldState" FROM "Story";
DROP TABLE "Story";
ALTER TABLE "new_Story" RENAME TO "Story";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
