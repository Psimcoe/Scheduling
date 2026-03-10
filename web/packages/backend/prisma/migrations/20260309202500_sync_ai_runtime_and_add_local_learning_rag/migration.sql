-- AlterTable
ALTER TABLE "Project" ADD COLUMN "projectType" TEXT;
ALTER TABLE "Project" ADD COLUMN "region" TEXT;
ALTER TABLE "Project" ADD COLUMN "sector" TEXT;

-- CreateTable
CREATE TABLE "InterimPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "planIndex" INTEGER NOT NULL,
    "start" DATETIME NOT NULL,
    "finish" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterimPlan_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimephasedData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "assignmentId" TEXT,
    "type" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "value" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'minutes',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimephasedData_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimephasedData_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskSplit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "start" DATETIME NOT NULL,
    "finish" DATETIME NOT NULL,
    "durationMinutes" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskSplit_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "importance" REAL NOT NULL DEFAULT 0.5,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiLearningEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "fieldName" TEXT,
    "source" TEXT NOT NULL,
    "projectType" TEXT,
    "sector" TEXT,
    "region" TEXT,
    "taskSignature" TEXT,
    "relatedTaskSignature" TEXT,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiLearnedPrior" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "priorType" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "relatedSignature" TEXT,
    "projectType" TEXT,
    "sector" TEXT,
    "region" TEXT,
    "value" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiScheduleChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "chunkType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "taskRefs" TEXT,
    "dependencyRefs" TEXT,
    "signatures" TEXT,
    "projectType" TEXT,
    "sector" TEXT,
    "region" TEXT,
    "scoreContext" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiScheduleChunk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "wbsCode" TEXT NOT NULL DEFAULT '',
    "outlineLevel" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'task',
    "durationMinutes" REAL NOT NULL DEFAULT 480,
    "start" DATETIME NOT NULL,
    "finish" DATETIME NOT NULL,
    "constraintType" INTEGER NOT NULL DEFAULT 0,
    "constraintDate" DATETIME,
    "calendarId" TEXT,
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "isManuallyScheduled" BOOLEAN NOT NULL DEFAULT false,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "totalSlackMinutes" REAL NOT NULL DEFAULT 0,
    "freeSlackMinutes" REAL NOT NULL DEFAULT 0,
    "earlyStart" DATETIME,
    "earlyFinish" DATETIME,
    "lateStart" DATETIME,
    "lateFinish" DATETIME,
    "deadline" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "externalKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "actualStart" DATETIME,
    "actualFinish" DATETIME,
    "actualDurationMinutes" REAL NOT NULL DEFAULT 0,
    "actualWork" REAL NOT NULL DEFAULT 0,
    "actualCost" REAL NOT NULL DEFAULT 0,
    "remainingDuration" REAL NOT NULL DEFAULT 0,
    "remainingWork" REAL NOT NULL DEFAULT 0,
    "remainingCost" REAL NOT NULL DEFAULT 0,
    "fixedCost" REAL NOT NULL DEFAULT 0,
    "fixedCostAccrual" TEXT NOT NULL DEFAULT 'prorated',
    "cost" REAL NOT NULL DEFAULT 0,
    "work" REAL NOT NULL DEFAULT 0,
    "taskMode" TEXT NOT NULL DEFAULT 'fixedUnits',
    "isEffortDriven" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bcws" REAL NOT NULL DEFAULT 0,
    "bcwp" REAL NOT NULL DEFAULT 0,
    "acwp" REAL NOT NULL DEFAULT 0,
    "physicalPercentComplete" INTEGER NOT NULL DEFAULT 0,
    "sv" REAL NOT NULL DEFAULT 0,
    "cv" REAL NOT NULL DEFAULT 0,
    "spi" REAL NOT NULL DEFAULT 0,
    "cpi" REAL NOT NULL DEFAULT 0,
    "eac" REAL NOT NULL DEFAULT 0,
    "vac" REAL NOT NULL DEFAULT 0,
    "isSplit" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringPattern" TEXT,
    "hyperlink" TEXT NOT NULL DEFAULT '',
    "hyperlinkAddress" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("actualCost", "actualDurationMinutes", "actualFinish", "actualStart", "actualWork", "acwp", "bcwp", "bcws", "calendarId", "constraintDate", "constraintType", "cost", "createdAt", "deadline", "durationMinutes", "earlyFinish", "earlyStart", "externalKey", "finish", "fixedCost", "fixedCostAccrual", "freeSlackMinutes", "hyperlink", "hyperlinkAddress", "id", "isActive", "isCritical", "isEffortDriven", "isManuallyScheduled", "lateFinish", "lateStart", "name", "notes", "outlineLevel", "parentId", "percentComplete", "physicalPercentComplete", "projectId", "remainingCost", "remainingDuration", "remainingWork", "sortOrder", "start", "taskMode", "totalSlackMinutes", "type", "updatedAt", "wbsCode", "work") SELECT "actualCost", "actualDurationMinutes", "actualFinish", "actualStart", "actualWork", "acwp", "bcwp", "bcws", "calendarId", "constraintDate", "constraintType", "cost", "createdAt", "deadline", "durationMinutes", "earlyFinish", "earlyStart", "externalKey", "finish", "fixedCost", "fixedCostAccrual", "freeSlackMinutes", "hyperlink", "hyperlinkAddress", "id", "isActive", "isCritical", "isEffortDriven", "isManuallyScheduled", "lateFinish", "lateStart", "name", "notes", "outlineLevel", "parentId", "percentComplete", "physicalPercentComplete", "projectId", "remainingCost", "remainingDuration", "remainingWork", "sortOrder", "start", "taskMode", "totalSlackMinutes", "type", "updatedAt", "wbsCode", "work" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");
CREATE INDEX "Task_externalKey_idx" ON "Task"("externalKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "InterimPlan_taskId_idx" ON "InterimPlan"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "InterimPlan_taskId_planIndex_key" ON "InterimPlan"("taskId", "planIndex");

-- CreateIndex
CREATE INDEX "TimephasedData_taskId_idx" ON "TimephasedData"("taskId");

-- CreateIndex
CREATE INDEX "TimephasedData_assignmentId_idx" ON "TimephasedData"("assignmentId");

-- CreateIndex
CREATE INDEX "TaskSplit_taskId_idx" ON "TaskSplit"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSplit_taskId_segmentIndex_key" ON "TaskSplit"("taskId", "segmentIndex");

-- CreateIndex
CREATE INDEX "AiMemory_projectId_idx" ON "AiMemory"("projectId");

-- CreateIndex
CREATE INDEX "AiMemory_category_idx" ON "AiMemory"("category");

-- CreateIndex
CREATE INDEX "AiMemory_importance_idx" ON "AiMemory"("importance");

-- CreateIndex
CREATE UNIQUE INDEX "AiMemory_category_key_projectId_key" ON "AiMemory"("category", "key", "projectId");

-- CreateIndex
CREATE INDEX "AiLearningEvent_projectId_idx" ON "AiLearningEvent"("projectId");

-- CreateIndex
CREATE INDEX "AiLearningEvent_eventType_idx" ON "AiLearningEvent"("eventType");

-- CreateIndex
CREATE INDEX "AiLearningEvent_entityType_idx" ON "AiLearningEvent"("entityType");

-- CreateIndex
CREATE INDEX "AiLearningEvent_fieldName_idx" ON "AiLearningEvent"("fieldName");

-- CreateIndex
CREATE INDEX "AiLearningEvent_taskSignature_idx" ON "AiLearningEvent"("taskSignature");

-- CreateIndex
CREATE INDEX "AiLearningEvent_projectType_sector_region_idx" ON "AiLearningEvent"("projectType", "sector", "region");

-- CreateIndex
CREATE INDEX "AiLearningEvent_createdAt_idx" ON "AiLearningEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AiLearnedPrior_priorType_signature_idx" ON "AiLearnedPrior"("priorType", "signature");

-- CreateIndex
CREATE INDEX "AiLearnedPrior_priorType_relatedSignature_idx" ON "AiLearnedPrior"("priorType", "relatedSignature");

-- CreateIndex
CREATE INDEX "AiLearnedPrior_projectType_sector_region_idx" ON "AiLearnedPrior"("projectType", "sector", "region");

-- CreateIndex
CREATE UNIQUE INDEX "AiLearnedPrior_priorType_signature_relatedSignature_projectType_sector_region_key" ON "AiLearnedPrior"("priorType", "signature", "relatedSignature", "projectType", "sector", "region");

-- CreateIndex
CREATE INDEX "AiScheduleChunk_projectId_idx" ON "AiScheduleChunk"("projectId");

-- CreateIndex
CREATE INDEX "AiScheduleChunk_chunkType_idx" ON "AiScheduleChunk"("chunkType");

-- CreateIndex
CREATE INDEX "AiScheduleChunk_projectType_sector_region_idx" ON "AiScheduleChunk"("projectType", "sector", "region");
