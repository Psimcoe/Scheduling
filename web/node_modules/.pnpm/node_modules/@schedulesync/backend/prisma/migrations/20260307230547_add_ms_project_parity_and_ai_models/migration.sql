-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "finishDate" DATETIME,
    "defaultCalendarId" TEXT NOT NULL DEFAULT '__default__',
    "scheduleFrom" TEXT NOT NULL DEFAULT 'start',
    "statusDate" DATETIME,
    "undoPointer" INTEGER,
    "currencySymbol" TEXT NOT NULL DEFAULT '$',
    "minutesPerDay" INTEGER NOT NULL DEFAULT 480,
    "minutesPerWeek" INTEGER NOT NULL DEFAULT 2400,
    "daysPerMonth" INTEGER NOT NULL DEFAULT 20,
    "defaultTaskType" TEXT NOT NULL DEFAULT 'fixedUnits',
    "defaultFixedCostAccrual" TEXT NOT NULL DEFAULT 'prorated',
    "honorConstraints" BOOLEAN NOT NULL DEFAULT true,
    "newTasksEffortDriven" BOOLEAN NOT NULL DEFAULT false,
    "autolink" BOOLEAN NOT NULL DEFAULT false,
    "criticalSlackLimit" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Task" (
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
    "hyperlink" TEXT NOT NULL DEFAULT '',
    "hyperlinkAddress" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dependency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "fromTaskId" TEXT NOT NULL,
    "toTaskId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FS',
    "lagMinutes" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Dependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Dependency_fromTaskId_fkey" FOREIGN KEY ("fromTaskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Dependency_toTaskId_fkey" FOREIGN KEY ("toTaskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "workingDaysOfWeek" TEXT NOT NULL DEFAULT '[false,true,true,true,true,true,false]',
    "defaultWorkingHours" TEXT NOT NULL DEFAULT '[{"startTime":"08:00","endTime":"12:00"},{"startTime":"13:00","endTime":"17:00"}]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Calendar_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "calendarId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "isWorking" BOOLEAN NOT NULL DEFAULT false,
    "workingHours" TEXT,
    CONSTRAINT "CalendarException_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'work',
    "initials" TEXT NOT NULL DEFAULT '',
    "group" TEXT NOT NULL DEFAULT '',
    "emailAddress" TEXT NOT NULL DEFAULT '',
    "maxUnits" REAL NOT NULL DEFAULT 1.0,
    "calendarId" TEXT,
    "standardRate" REAL NOT NULL DEFAULT 0,
    "overtimeRate" REAL NOT NULL DEFAULT 0,
    "costPerUse" REAL NOT NULL DEFAULT 0,
    "costRateTable" TEXT NOT NULL DEFAULT '[]',
    "accrueAt" TEXT NOT NULL DEFAULT 'prorated',
    "budgetCost" REAL NOT NULL DEFAULT 0,
    "budgetWork" REAL NOT NULL DEFAULT 0,
    "isBudget" BOOLEAN NOT NULL DEFAULT false,
    "isGeneric" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Resource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "units" REAL NOT NULL DEFAULT 1.0,
    "workMinutes" REAL NOT NULL DEFAULT 0,
    "actualWork" REAL NOT NULL DEFAULT 0,
    "actualCost" REAL NOT NULL DEFAULT 0,
    "remainingWork" REAL NOT NULL DEFAULT 0,
    "remainingCost" REAL NOT NULL DEFAULT 0,
    "start" DATETIME,
    "finish" DATETIME,
    "delay" REAL NOT NULL DEFAULT 0,
    "costRateTableIndex" INTEGER NOT NULL DEFAULT 0,
    "contour" TEXT NOT NULL DEFAULT 'flat',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Baseline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "baselineIndex" INTEGER NOT NULL DEFAULT 0,
    "baselineStart" DATETIME NOT NULL,
    "baselineFinish" DATETIME NOT NULL,
    "baselineDurationMinutes" REAL NOT NULL,
    "baselineWork" REAL NOT NULL DEFAULT 0,
    "baselineCost" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Baseline_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UndoEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "snapshotJson" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "fieldType" TEXT NOT NULL,
    "formula" TEXT,
    "lookupTableJson" TEXT,
    "indicatorRules" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "textValue" TEXT,
    "numberValue" REAL,
    "dateValue" DATETIME,
    "flagValue" BOOLEAN,
    CONSTRAINT "CustomFieldValue_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomFieldDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "patternType" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "messages" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "suggestionType" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "correctedValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Project_updatedAt_idx" ON "Project"("updatedAt");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- CreateIndex
CREATE INDEX "Task_externalKey_idx" ON "Task"("externalKey");

-- CreateIndex
CREATE INDEX "Dependency_projectId_idx" ON "Dependency"("projectId");

-- CreateIndex
CREATE INDEX "Dependency_fromTaskId_idx" ON "Dependency"("fromTaskId");

-- CreateIndex
CREATE INDEX "Dependency_toTaskId_idx" ON "Dependency"("toTaskId");

-- CreateIndex
CREATE INDEX "Calendar_projectId_idx" ON "Calendar"("projectId");

-- CreateIndex
CREATE INDEX "CalendarException_calendarId_idx" ON "CalendarException"("calendarId");

-- CreateIndex
CREATE INDEX "Resource_projectId_idx" ON "Resource"("projectId");

-- CreateIndex
CREATE INDEX "Assignment_taskId_idx" ON "Assignment"("taskId");

-- CreateIndex
CREATE INDEX "Assignment_resourceId_idx" ON "Assignment"("resourceId");

-- CreateIndex
CREATE INDEX "Baseline_taskId_idx" ON "Baseline"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Baseline_taskId_baselineIndex_key" ON "Baseline"("taskId", "baselineIndex");

-- CreateIndex
CREATE INDEX "UndoEntry_projectId_position_idx" ON "UndoEntry"("projectId", "position");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_projectId_idx" ON "CustomFieldDefinition"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_projectId_fieldName_key" ON "CustomFieldDefinition"("projectId", "fieldName");

-- CreateIndex
CREATE INDEX "CustomFieldValue_taskId_idx" ON "CustomFieldValue"("taskId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_fieldId_idx" ON "CustomFieldValue"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_taskId_fieldId_key" ON "CustomFieldValue"("taskId", "fieldId");

-- CreateIndex
CREATE INDEX "AiPattern_patternType_idx" ON "AiPattern"("patternType");

-- CreateIndex
CREATE INDEX "AiPattern_projectId_idx" ON "AiPattern"("projectId");

-- CreateIndex
CREATE INDEX "AiConversation_projectId_idx" ON "AiConversation"("projectId");

-- CreateIndex
CREATE INDEX "AiFeedback_projectId_idx" ON "AiFeedback"("projectId");

-- CreateIndex
CREATE INDEX "AiFeedback_suggestionType_idx" ON "AiFeedback"("suggestionType");
