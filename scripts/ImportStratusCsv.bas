' ══════════════════════════════════════════════════════════════════════════════
' STRATUS Packages Dashboard CSV → MS Project Import Macro
' ══════════════════════════════════════════════════════════════════════════════
'
' HOW TO USE:
'   1. Open Microsoft Project (new blank project or existing)
'   2. Press Alt+F11 to open the VBA editor
'   3. Insert → Module
'   4. Paste this entire file into the module
'   5. Press F5 or Run → Run Sub/UserForm
'   6. Select "ImportStratusCsv" and click Run
'   7. A file dialog will appear — pick your STRATUS CSV file
'   8. The macro creates the hierarchy and populates all fields
'   9. Ctrl+Z undoes the entire import in one step
'
' FIELDS POPULATED:
'   - Task Name         (from "Name" column)
'   - Start             (from "Prefab Build Start Date")
'   - Finish            (from "Prefab Build Finish Date")
'   - Duration          (from "Work Days (Reference)" × 8 hours)
'   - Deadline          (from "Required")
'   - % Complete        (from "Status" mapped to percentage)
'   - Text30            (composite key: "ProjectNumber-PackageNumber")
'   - Notes             (from "Description" + "Notes" + category info)
'
' HIERARCHY:
'   Level 1: Project Number   (e.g. "320001TUR")
'   Level 2: Location         (e.g. "LEVEL 37")
'   Level 3: Work task        (e.g. "FAB-0228-L37-SUP-PKG-EAST")
' ══════════════════════════════════════════════════════════════════════════════

Option Explicit

' ── Status → % Complete mapping ──────────────────────────────────────────────
Private Function GetPercentFromStatus(status As String) As Long
    Select Case LCase(Trim(status))
        Case "new item": GetPercentFromStatus = 0
        Case "design stage": GetPercentFromStatus = 5
        Case "design stage-prefab early planning": GetPercentFromStatus = 10
        Case "clash": GetPercentFromStatus = 5
        Case "bim/vdc released to prefab": GetPercentFromStatus = 20
        Case "prefab confirmed received from bim/vdc": GetPercentFromStatus = 25
        Case "spool qa/qc complete-ready for assembly": GetPercentFromStatus = 30
        Case "assembly (spool) confirmed": GetPercentFromStatus = 35
        Case "packages (fab) confirmed": GetPercentFromStatus = 40
        Case "package-bom generated": GetPercentFromStatus = 45
        Case "package-bom released for purchasing": GetPercentFromStatus = 50
        Case "package-bom purchased": GetPercentFromStatus = 55
        Case "package-bom received w/ back orders": GetPercentFromStatus = 60
        Case "assembly-bom received": GetPercentFromStatus = 65
        Case "package-bom received no backorders": GetPercentFromStatus = 70
        Case "ready for fab release to shop": GetPercentFromStatus = 75
        Case "issued for fabrication": GetPercentFromStatus = 80
        Case "fabrication in progress": GetPercentFromStatus = 85
        Case "fabrication complete": GetPercentFromStatus = 90
        Case "qa qc inspection": GetPercentFromStatus = 95
        Case "packaged for shipment": GetPercentFromStatus = 96
        Case "waiting to ship": GetPercentFromStatus = 99
        Case "shipped to jobsite", "received on jobsite", "issued for installation", _
             "installed", "wire pulled", "trim and terminations complete", _
             "hold", "point list ready", "fab cancelled", "no prefab (field install)"
            GetPercentFromStatus = 100
        Case Else: GetPercentFromStatus = -1  ' Unknown status
    End Select
End Function

' ── Simple CSV line parser (handles quoted fields) ───────────────────────────
Private Function ParseCsvLine(line As String) As Collection
    Dim fields As New Collection
    Dim inQuotes As Boolean
    Dim current As String
    Dim i As Long
    Dim c As String
    
    inQuotes = False
    current = ""
    
    For i = 1 To Len(line)
        c = Mid(line, i, 1)
        If inQuotes Then
            If c = """" Then
                If i < Len(line) And Mid(line, i + 1, 1) = """" Then
                    current = current & """"
                    i = i + 1
                Else
                    inQuotes = False
                End If
            Else
                current = current & c
            End If
        Else
            If c = """" Then
                inQuotes = True
            ElseIf c = "," Then
                fields.Add Trim(current)
                current = ""
            Else
                current = current & c
            End If
        End If
    Next i
    
    fields.Add Trim(current)
    Set ParseCsvLine = fields
End Function

' ── Find column index by header name (case-insensitive) ─────────────────────
Private Function FindColumn(headers As Collection, colName As String) As Long
    Dim i As Long
    For i = 1 To headers.Count
        If LCase(Trim(headers(i))) = LCase(colName) Then
            FindColumn = i
            Exit Function
        End If
    Next i
    FindColumn = 0  ' Not found
End Function

' ── Safe date parse ──────────────────────────────────────────────────────────
Private Function SafeParseDate(dateStr As String) As Variant
    If Trim(dateStr) = "" Then
        SafeParseDate = Empty
        Exit Function
    End If
    On Error GoTo ParseFailed
    SafeParseDate = CDate(Trim(dateStr))
    Exit Function
ParseFailed:
    SafeParseDate = Empty
End Function

' ══════════════════════════════════════════════════════════════════════════════
' MAIN ENTRY POINT
' ══════════════════════════════════════════════════════════════════════════════
Public Sub ImportStratusCsv()
    ' ── File dialog ──────────────────────────────────────────────────────────
    Dim filePath As String
    filePath = Application.GetOpenFileName( _
        "CSV Files (*.csv),*.csv", _
        "Select STRATUS Packages Dashboard CSV")
    
    If filePath = "False" Or filePath = "" Then
        MsgBox "Import cancelled.", vbInformation
        Exit Sub
    End If
    
    ' ── Read all lines ───────────────────────────────────────────────────────
    Dim fso As Object, ts As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set ts = fso.OpenTextFile(filePath, 1)  ' 1 = ForReading
    
    Dim allLines As New Collection
    Do While Not ts.AtEndOfStream
        Dim rawLine As String
        rawLine = ts.ReadLine
        If Trim(rawLine) <> "" Then allLines.Add rawLine
    Loop
    ts.Close
    
    If allLines.Count < 2 Then
        MsgBox "CSV must have a header row and at least one data row.", vbExclamation
        Exit Sub
    End If
    
    ' ── Parse headers ────────────────────────────────────────────────────────
    Dim headers As Collection
    Set headers = ParseCsvLine(allLines(1))
    
    ' Find column indices
    Dim colNumber As Long:        colNumber = FindColumn(headers, "Number")
    Dim colName As Long:          colName = FindColumn(headers, "Name")
    Dim colProjNumOvr As Long:    colProjNumOvr = FindColumn(headers, "Project Number Override")
    Dim colProjNum As Long:       colProjNum = FindColumn(headers, "Project Number")
    Dim colLocation As Long:      colLocation = FindColumn(headers, "Location")
    Dim colStartDate As Long:     colStartDate = FindColumn(headers, "Prefab Build Start Date")
    Dim colFinishDate As Long:    colFinishDate = FindColumn(headers, "Prefab Build Finish Date")
    Dim colWorkDays As Long:      colWorkDays = FindColumn(headers, "Work Days (Reference)")
    Dim colRequired As Long:      colRequired = FindColumn(headers, "Required")
    Dim colStatus As Long:        colStatus = FindColumn(headers, "Status")
    Dim colNotes As Long:         colNotes = FindColumn(headers, "Notes")
    Dim colDescription As Long:   colDescription = FindColumn(headers, "Description")
    Dim colCostCodeCat As Long:   colCostCodeCat = FindColumn(headers, "Cost Code Category")
    Dim colCategoryType As Long:  colCategoryType = FindColumn(headers, "Category Type")
    
    If colNumber = 0 Then
        MsgBox "Required column 'Number' not found in CSV headers.", vbExclamation
        Exit Sub
    End If
    
    ' ── Parse all data rows into arrays for grouping ─────────────────────────
    Dim dataRows() As Collection
    Dim dataCount As Long
    dataCount = allLines.Count - 1
    ReDim dataRows(1 To dataCount)
    
    Dim r As Long
    For r = 2 To allLines.Count
        Set dataRows(r - 1) = ParseCsvLine(allLines(r))
    Next r
    
    ' ── Build unique Project → Location structure ────────────────────────────
    ' Use dictionaries for grouping
    Dim projDict As Object
    Set projDict = CreateObject("Scripting.Dictionary")
    projDict.CompareMode = 1  ' Case-insensitive
    
    For r = 1 To dataCount
        Dim fields As Collection
        Set fields = dataRows(r)
        
        ' Get project number
        Dim projNum As String
        projNum = ""
        If colProjNumOvr > 0 And colProjNumOvr <= fields.Count Then projNum = fields(colProjNumOvr)
        If projNum = "" And colProjNum > 0 And colProjNum <= fields.Count Then projNum = fields(colProjNum)
        If projNum = "" Then projNum = "(No Project)"
        
        ' Get location
        Dim loc As String
        loc = ""
        If colLocation > 0 And colLocation <= fields.Count Then loc = fields(colLocation)
        If loc = "" Then loc = "(No Location)"
        
        ' Track project → location → row indices
        If Not projDict.Exists(projNum) Then
            Set projDict(projNum) = CreateObject("Scripting.Dictionary")
            projDict(projNum).CompareMode = 1
        End If
        
        If Not projDict(projNum).Exists(loc) Then
            Set projDict(projNum)(loc) = CreateObject("Scripting.Dictionary")
        End If
        
        ' Store row index
        Dim locDict As Object
        Set locDict = projDict(projNum)(loc)
        locDict.Add CStr(locDict.Count + 1), r
    Next r
    
    ' ── Create tasks in MS Project ───────────────────────────────────────────
    Dim proj As Project
    Set proj = Application.ActiveProject
    
    Application.OpenUndoTransaction "STRATUS CSV Import"
    
    Dim createdCount As Long, errorCount As Long
    createdCount = 0
    errorCount = 0
    
    Dim projKey As Variant
    For Each projKey In projDict.Keys
        ' ── Level 1: Project summary ─────────────────────────────────────────
        Dim projSummary As Task
        Set projSummary = proj.Tasks.Add(CStr(projKey))
        projSummary.Manual = False
        projSummary.OutlineLevel = 1
        
        Dim locKey As Variant
        For Each locKey In projDict(projKey).Keys
            ' ── Level 2: Location summary ────────────────────────────────────
            Dim locSummary As Task
            Set locSummary = proj.Tasks.Add(CStr(locKey))
            locSummary.Manual = False
            locSummary.OutlineLevel = 2
            
            ' ── Level 3: Work tasks ──────────────────────────────────────────
            Dim rowKey As Variant
            For Each rowKey In projDict(projKey)(locKey).Keys
                Dim rowIdx As Long
                rowIdx = projDict(projKey)(locKey)(rowKey)
                Dim rowFields As Collection
                Set rowFields = dataRows(rowIdx)
                
                On Error GoTo TaskError
                
                ' Task name
                Dim taskName As String
                taskName = ""
                If colName > 0 And colName <= rowFields.Count Then taskName = rowFields(colName)
                If taskName = "" And colNumber <= rowFields.Count Then taskName = "PKG-" & rowFields(colNumber)
                
                Dim t As Task
                Set t = proj.Tasks.Add(taskName)
                t.Manual = False
                t.OutlineLevel = 3
                
                ' External key: ProjectNumber-PackageNumber → Text30
                Dim pkgNum As String
                pkgNum = ""
                If colNumber <= rowFields.Count Then pkgNum = rowFields(colNumber)
                
                Dim extKey As String
                If CStr(projKey) <> "(No Project)" And pkgNum <> "" Then
                    extKey = CStr(projKey) & "-" & pkgNum
                Else
                    extKey = pkgNum
                End If
                t.SetField pjTaskText30, extKey
                
                ' FIELD ORDER: Duration → Start → Finish
                ' Project auto-calculates Finish from Start+Duration.
                ' Setting Duration first avoids it overriding an explicit Finish.
                
                ' Duration from Work Days (set BEFORE Start/Finish)
                If colWorkDays > 0 And colWorkDays <= rowFields.Count Then
                    Dim wdStr As String
                    wdStr = Trim(rowFields(colWorkDays))
                    If wdStr <> "" Then
                        On Error Resume Next
                        Dim wd As Double
                        wd = CDbl(wdStr)
                        If Err.Number = 0 And wd > 0 Then
                            t.Duration = CLng(wd * 480)  ' 8hr day in minutes
                        End If
                        On Error GoTo TaskError
                    End If
                End If
                
                ' Start date
                If colStartDate > 0 And colStartDate <= rowFields.Count Then
                    Dim startVal As Variant
                    startVal = SafeParseDate(rowFields(colStartDate))
                    If Not IsEmpty(startVal) Then t.Start = startVal
                End If
                
                ' Finish date (overrides auto-calculated value if present)
                If colFinishDate > 0 And colFinishDate <= rowFields.Count Then
                    Dim finishVal As Variant
                    finishVal = SafeParseDate(rowFields(colFinishDate))
                    If Not IsEmpty(finishVal) Then t.Finish = finishVal
                End If
                
                ' Deadline (Required date)
                If colRequired > 0 And colRequired <= rowFields.Count Then
                    Dim deadlineVal As Variant
                    deadlineVal = SafeParseDate(rowFields(colRequired))
                    If Not IsEmpty(deadlineVal) Then t.Deadline = deadlineVal
                End If
                
                ' % Complete from Status
                If colStatus > 0 And colStatus <= rowFields.Count Then
                    Dim statusStr As String
                    statusStr = rowFields(colStatus)
                    Dim pct As Long
                    pct = GetPercentFromStatus(statusStr)
                    If pct >= 0 Then t.PercentComplete = pct
                End If
                
                ' Notes
                Dim noteParts As String
                noteParts = ""
                If colDescription > 0 And colDescription <= rowFields.Count Then
                    If Trim(rowFields(colDescription)) <> "" Then _
                        noteParts = "Description: " & rowFields(colDescription)
                End If
                If colNotes > 0 And colNotes <= rowFields.Count Then
                    If Trim(rowFields(colNotes)) <> "" Then
                        If noteParts <> "" Then noteParts = noteParts & vbCrLf
                        noteParts = noteParts & rowFields(colNotes)
                    End If
                End If
                If colCostCodeCat > 0 And colCostCodeCat <= rowFields.Count Then
                    If Trim(rowFields(colCostCodeCat)) <> "" Then
                        If noteParts <> "" Then noteParts = noteParts & vbCrLf
                        noteParts = noteParts & "Category: " & rowFields(colCostCodeCat)
                    End If
                End If
                If colCategoryType > 0 And colCategoryType <= rowFields.Count Then
                    If Trim(rowFields(colCategoryType)) <> "" Then
                        If noteParts <> "" Then noteParts = noteParts & vbCrLf
                        noteParts = noteParts & "Type: " & rowFields(colCategoryType)
                    End If
                End If
                If noteParts <> "" Then t.Notes = noteParts
                
                createdCount = createdCount + 1
                GoTo NextRow
                
TaskError:
                errorCount = errorCount + 1
                Debug.Print "Error on row " & rowIdx & ": " & Err.Description
                Err.Clear
                On Error GoTo 0

NextRow:
                On Error GoTo 0
            Next rowKey
        Next locKey
    Next projKey
    
    Application.CloseUndoTransaction
    
    ' ── Summary ──────────────────────────────────────────────────────────────
    MsgBox "Import Complete!" & vbCrLf & vbCrLf & _
           "Tasks created: " & createdCount & vbCrLf & _
           "Errors: " & errorCount & vbCrLf & vbCrLf & _
           "Tip: Press Ctrl+Z to undo the entire import.", _
           vbInformation, "STRATUS CSV Import"
End Sub
