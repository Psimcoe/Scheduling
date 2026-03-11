ALTER TABLE "Project" ADD COLUMN "stratusProjectId" TEXT;
ALTER TABLE "Project" ADD COLUMN "stratusModelId" TEXT;
ALTER TABLE "Project" ADD COLUMN "stratusPackageWhere" TEXT;
ALTER TABLE "Project" ADD COLUMN "stratusLastPullAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "stratusLastPushAt" DATETIME;

CREATE TABLE "StratusTaskSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "localProjectId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "projectId" TEXT,
    "modelId" TEXT,
    "externalKey" TEXT,
    "packageNumber" TEXT,
    "packageName" TEXT,
    "trackingStatusId" TEXT,
    "trackingStatusName" TEXT,
    "rawPackageJson" TEXT NOT NULL,
    "lastPulledAt" DATETIME NOT NULL,
    "lastPushedAt" DATETIME,
    "syncedStartSignature" TEXT,
    "syncedFinishSignature" TEXT,
    "syncedDeadlineSignature" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StratusTaskSync_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StratusTaskSync_localProjectId_fkey" FOREIGN KEY ("localProjectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StratusTaskSync_taskId_key" ON "StratusTaskSync"("taskId");
CREATE UNIQUE INDEX "StratusTaskSync_localProjectId_packageId_key" ON "StratusTaskSync"("localProjectId", "packageId");
CREATE INDEX "StratusTaskSync_localProjectId_idx" ON "StratusTaskSync"("localProjectId");
CREATE INDEX "StratusTaskSync_packageId_idx" ON "StratusTaskSync"("packageId");
CREATE INDEX "StratusTaskSync_projectId_idx" ON "StratusTaskSync"("projectId");
CREATE INDEX "StratusTaskSync_modelId_idx" ON "StratusTaskSync"("modelId");
CREATE INDEX "StratusTaskSync_externalKey_idx" ON "StratusTaskSync"("externalKey");
