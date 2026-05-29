Attribute VB_Name = "JedidahCadExport"
Option Explicit

' Jedidah Ops CAD export manifest starter macro.
'
' Usage:
' 1. Open the top-level Product assembly in SolidWorks.
' 2. Ensure files have these custom properties where applicable:
'    JED_PRODUCT_MODEL_CODE on the top-level .SLDASM
'    JED_ASSEMBLY_CODE on sub-assembly .SLDASM files
'    JED_PART_CODE on .SLDPRT files
' 3. Run Main.
' 4. Choose an output folder.
'
' Output:
' cad-export-YYYYMMDD-HHMMSS/
'   manifest.json
'   files/
'     copied department files found next to source models
'
' Notes:
' - This is a reviewable starter macro, not a packaged .swp binary.
' - It gathers the current required department files:
'   .sldasm, .sldprt, .slddrw, .dxf
' - It attempts to generate a CNC DXF for each part using SolidWorks sheet
'   metal flat-pattern export. Non-sheet-metal parts may not produce a DXF.
' - It gathers existing .SLDDRW drawing files, but does not create drawings.

Private Const DOC_PART As Long = 1
Private Const DOC_ASSEMBLY As Long = 2
Private Const OPEN_SILENT As Long = 1
Private Const EXPORT_SHEET_METAL As Long = 1
Private Const EXPORT_SHEET_METAL_GEOMETRY_ONLY As Long = 1

Private Const PROP_PRODUCT_MODEL_CODE As String = "JED_PRODUCT_MODEL_CODE"
Private Const PROP_ASSEMBLY_CODE As String = "JED_ASSEMBLY_CODE"
Private Const PROP_PART_CODE As String = "JED_PART_CODE"

Private swApp As Object
Private fso As Object
Private filesFolder As String

Private assemblyOrder As Collection
Private assemblyNames As Object
Private assemblyFiles As Object
Private assemblyHashes As Object
Private assemblyExports As Object
Private partOrder As Collection
Private partQuantities As Object
Private partAssemblyByKey As Object
Private partCodesByKey As Object
Private partNamesByKey As Object
Private partFilesByKey As Object
Private partHashesByKey As Object
Private partConfigsByKey As Object
Private partExportsByKey As Object

Public Sub Main()
    Set swApp = Application.SldWorks
    Set fso = CreateObject("Scripting.FileSystemObject")

    Dim model As Object
    Set model = swApp.ActiveDoc

    If model Is Nothing Then
        MsgBox "Open the top-level Product assembly before running this macro.", vbExclamation
        Exit Sub
    End If

    If model.GetType <> DOC_ASSEMBLY Then
        MsgBox "The active document must be a SolidWorks assembly (.SLDASM).", vbExclamation
        Exit Sub
    End If

    Dim outputParent As String
    outputParent = BrowseForFolder("Choose where to create the Jedidah CAD export bundle")
    If outputParent = "" Then Exit Sub

    Dim exportFolder As String
    exportFolder = fso.BuildPath(outputParent, "cad-export-" & Format(Now, "yyyymmdd-hhnnss"))
    filesFolder = fso.BuildPath(exportFolder, "files")
    fso.CreateFolder exportFolder
    fso.CreateFolder filesFolder

    InitCollections

    Dim productModelCode As String
    productModelCode = GetCustomProperty(model, "", PROP_PRODUCT_MODEL_CODE)

    Dim productExports As String
    productExports = BuildExportsJson(model.GetPathName)

    TraverseTopLevelAssembly model

    Dim manifest As String
    manifest = BuildManifestJson(model, productModelCode, productExports)

    Dim manifestPath As String
    manifestPath = fso.BuildPath(exportFolder, "manifest.json")
    WriteTextFile manifestPath, manifest

    MsgBox "Jedidah CAD export bundle created:" & vbCrLf & exportFolder, vbInformation
End Sub

Private Sub InitCollections()
    Set assemblyOrder = New Collection
    Set assemblyNames = CreateObject("Scripting.Dictionary")
    Set assemblyFiles = CreateObject("Scripting.Dictionary")
    Set assemblyHashes = CreateObject("Scripting.Dictionary")
    Set assemblyExports = CreateObject("Scripting.Dictionary")

    Set partOrder = New Collection
    Set partQuantities = CreateObject("Scripting.Dictionary")
    Set partAssemblyByKey = CreateObject("Scripting.Dictionary")
    Set partCodesByKey = CreateObject("Scripting.Dictionary")
    Set partNamesByKey = CreateObject("Scripting.Dictionary")
    Set partFilesByKey = CreateObject("Scripting.Dictionary")
    Set partHashesByKey = CreateObject("Scripting.Dictionary")
    Set partConfigsByKey = CreateObject("Scripting.Dictionary")
    Set partExportsByKey = CreateObject("Scripting.Dictionary")
End Sub

Private Sub TraverseTopLevelAssembly(ByVal assemblyModel As Object)
    EnsureAssembly "UNASSIGNED", "Unassigned", assemblyModel.GetPathName, Sha256File(assemblyModel.GetPathName), "[]"

    Dim asm As Object
    Set asm = assemblyModel

    Dim components As Variant
    components = asm.GetComponents(True)

    If IsEmpty(components) Then Exit Sub

    Dim i As Long
    For i = LBound(components) To UBound(components)
        TraverseComponent components(i), "UNASSIGNED"
    Next i
End Sub

Private Sub TraverseComponent(ByVal component As Object, ByVal currentAssemblyCode As String)
    If component Is Nothing Then Exit Sub
    If component.GetPathName = "" Then Exit Sub
    If component.IsSuppressed Then Exit Sub

    Dim componentModel As Object
    Set componentModel = component.GetModelDoc2

    If componentModel Is Nothing Then
        Set componentModel = OpenModelSilent(component.GetPathName)
    End If

    If componentModel Is Nothing Then Exit Sub

    Dim docType As Long
    docType = componentModel.GetType

    If docType = DOC_ASSEMBLY Then
        Dim assemblyCode As String
        assemblyCode = GetCustomProperty(componentModel, "", PROP_ASSEMBLY_CODE)

        If assemblyCode <> "" Then
            currentAssemblyCode = assemblyCode
            EnsureAssembly assemblyCode, BaseNameWithoutExtension(component.GetPathName), component.GetPathName, Sha256File(component.GetPathName), BuildExportsJson(component.GetPathName)
        End If

        Dim children As Variant
        children = component.GetChildren

        If Not IsEmpty(children) Then
            Dim i As Long
            For i = LBound(children) To UBound(children)
                TraverseComponent children(i), currentAssemblyCode
            Next i
        End If
    ElseIf docType = DOC_PART Then
        AddPartOccurrence componentModel, component, currentAssemblyCode
    End If
End Sub

Private Sub EnsureAssembly(ByVal code As String, ByVal name As String, ByVal sourcePath As String, ByVal sourceHash As String, ByVal exportsJson As String)
    If Not assemblyNames.Exists(code) Then
        assemblyOrder.Add code
        assemblyNames.Add code, name
        assemblyFiles.Add code, FileNameOnly(sourcePath)
        assemblyHashes.Add code, sourceHash
        assemblyExports.Add code, exportsJson
    End If
End Sub

Private Sub AddPartOccurrence(ByVal partModel As Object, ByVal component As Object, ByVal assemblyCode As String)
    Dim configName As String
    configName = component.ReferencedConfiguration

    Dim partCode As String
    partCode = GetCustomProperty(partModel, configName, PROP_PART_CODE)

    If partCode = "" Then
        partCode = "MISSING_PART_CODE:" & FileNameOnly(component.GetPathName)
    End If

    Dim key As String
    key = assemblyCode & "|" & partCode & "|" & configName

    If Not partQuantities.Exists(key) Then
        partOrder.Add key
        partQuantities.Add key, 0
        partAssemblyByKey.Add key, assemblyCode
        partCodesByKey.Add key, partCode
        partNamesByKey.Add key, BaseNameWithoutExtension(component.GetPathName)
        partFilesByKey.Add key, FileNameOnly(component.GetPathName)
        partHashesByKey.Add key, Sha256File(component.GetPathName)
        partConfigsByKey.Add key, configName
        partExportsByKey.Add key, BuildPartExportsJson(partModel, component.GetPathName, configName)
    End If

    partQuantities(key) = CLng(partQuantities(key)) + 1
End Sub

Private Function BuildManifestJson(ByVal productModel As Object, ByVal productModelCode As String, ByVal productExports As String) As String
    Dim json As String
    json = "{"
    json = json & vbCrLf & "  ""schemaVersion"": 1,"
    json = json & vbCrLf & "  ""exportedAt"": " & JsonString(IsoTimestamp(Now)) & ","
    json = json & vbCrLf & "  ""sourceSystem"": ""solidworks"","
    json = json & vbCrLf & "  ""product"": {"
    json = json & vbCrLf & "    ""modelCode"": " & JsonString(productModelCode) & ","
    json = json & vbCrLf & "    ""name"": " & JsonString(BaseNameWithoutExtension(productModel.GetPathName)) & ","
    json = json & vbCrLf & "    ""exports"": " & productExports
    json = json & vbCrLf & "  },"
    json = json & vbCrLf & "  ""cadSource"": {"
    json = json & vbCrLf & "    ""topLevelFileName"": " & JsonString(FileNameOnly(productModel.GetPathName)) & ","
    json = json & vbCrLf & "    ""topLevelFilePath"": " & JsonString(productModel.GetPathName) & ","
    json = json & vbCrLf & "    ""configuration"": " & JsonString(ActiveConfigName(productModel)) & ","
    json = json & vbCrLf & "    ""contentHash"": " & JsonString(Sha256File(productModel.GetPathName))
    json = json & vbCrLf & "  },"
    json = json & vbCrLf & "  ""assemblies"": ["

    Dim i As Long
    For i = 1 To assemblyOrder.Count
        If i > 1 Then json = json & ","
        json = json & vbCrLf & BuildAssemblyJson(CStr(assemblyOrder(i)))
    Next i

    json = json & vbCrLf & "  ]"
    json = json & vbCrLf & "}"

    BuildManifestJson = json
End Function

Private Function BuildAssemblyJson(ByVal assemblyCode As String) As String
    Dim json As String
    json = "    {"
    json = json & vbCrLf & "      ""code"": " & JsonString(assemblyCode) & ","
    json = json & vbCrLf & "      ""name"": " & JsonString(CStr(assemblyNames(assemblyCode))) & ","
    json = json & vbCrLf & "      ""sourceFileName"": " & JsonString(CStr(assemblyFiles(assemblyCode))) & ","
    json = json & vbCrLf & "      ""contentHash"": " & JsonString(CStr(assemblyHashes(assemblyCode))) & ","
    json = json & vbCrLf & "      ""exports"": " & CStr(assemblyExports(assemblyCode)) & ","
    json = json & vbCrLf & "      ""parts"": ["

    Dim firstPart As Boolean
    firstPart = True

    Dim i As Long
    For i = 1 To partOrder.Count
        Dim key As String
        key = CStr(partOrder(i))

        If CStr(partAssemblyByKey(key)) = assemblyCode Then
            If Not firstPart Then json = json & ","
            json = json & vbCrLf & BuildPartJson(key)
            firstPart = False
        End If
    Next i

    json = json & vbCrLf & "      ]"
    json = json & vbCrLf & "    }"
    BuildAssemblyJson = json
End Function

Private Function BuildPartJson(ByVal key As String) As String
    Dim json As String
    json = "        {"
    json = json & vbCrLf & "          ""partCode"": " & JsonString(CStr(partCodesByKey(key))) & ","
    json = json & vbCrLf & "          ""name"": " & JsonString(CStr(partNamesByKey(key))) & ","
    json = json & vbCrLf & "          ""quantity"": " & CStr(partQuantities(key)) & ","
    json = json & vbCrLf & "          ""sourceFileName"": " & JsonString(CStr(partFilesByKey(key))) & ","
    json = json & vbCrLf & "          ""sourceHash"": " & JsonString(CStr(partHashesByKey(key))) & ","
    json = json & vbCrLf & "          ""configuration"": " & JsonString(CStr(partConfigsByKey(key))) & ","
    json = json & vbCrLf & "          ""exports"": " & CStr(partExportsByKey(key))
    json = json & vbCrLf & "        }"
    BuildPartJson = json
End Function

Private Function BuildExportsJson(ByVal sourcePath As String, Optional ByVal configName As String = "") As String
    If sourcePath = "" Then
        BuildExportsJson = "[]"
        Exit Function
    End If

    Dim folderPath As String
    folderPath = fso.GetParentFolderName(sourcePath)

    Dim baseName As String
    baseName = BaseNameWithoutExtension(sourcePath)

    Dim exportBaseName As String
    exportBaseName = ConfiguredBaseName(sourcePath, configName)

    Dim extensions As Variant
    extensions = RelatedExtensionsForSource(sourcePath)

    Dim json As String
    json = "["

    Dim count As Long
    count = 0

    Dim i As Long
    For i = LBound(extensions) To UBound(extensions)
        Dim ext As String
        ext = CStr(extensions(i))

        Dim candidate As String
        If LCase$(fso.GetExtensionName(sourcePath)) = LCase$(ext) Then
            candidate = sourcePath
        ElseIf configName <> "" And LCase$(ext) = "dxf" Then
            candidate = fso.BuildPath(folderPath, exportBaseName & "." & ext)
        Else
            candidate = fso.BuildPath(folderPath, baseName & "." & ext)
        End If

        If fso.FileExists(candidate) Then
            Dim destName As String
            destName = UniqueExportFileName(exportBaseName & "." & ext)

            Dim destPath As String
            destPath = fso.BuildPath(filesFolder, destName)
            fso.CopyFile candidate, destPath, True

            If count > 0 Then json = json & ","
            json = json & vbCrLf & "            {"
            json = json & vbCrLf & "              ""fileName"": " & JsonString(destName) & ","
            json = json & vbCrLf & "              ""format"": " & JsonString(LCase$(ext)) & ","
            json = json & vbCrLf & "              ""purpose"": " & JsonString(ExportPurposeForFormat(ext)) & ","
            json = json & vbCrLf & "              ""hash"": " & JsonString(Sha256File(destPath))
            json = json & vbCrLf & "            }"
            count = count + 1
        End If
    Next i

    If count > 0 Then json = json & vbCrLf & "          "
    json = json & "]"

    BuildExportsJson = json
End Function

Private Function BuildPartExportsJson(ByVal partModel As Object, ByVal sourcePath As String, ByVal configName As String) As String
    If sourcePath <> "" Then
        TryGeneratePartDxf partModel, sourcePath, configName
    End If

    BuildPartExportsJson = BuildExportsJson(sourcePath, configName)
End Function

Private Function TryGeneratePartDxf(ByVal partModel As Object, ByVal sourcePath As String, ByVal configName As String) As Boolean
    On Error GoTo Failed

    If partModel Is Nothing Then
        TryGeneratePartDxf = False
        Exit Function
    End If

    If sourcePath = "" Then
        TryGeneratePartDxf = False
        Exit Function
    End If

    Dim folderPath As String
    folderPath = fso.GetParentFolderName(sourcePath)

    Dim dxfPath As String
    dxfPath = fso.BuildPath(folderPath, ConfiguredBaseName(sourcePath, configName) & ".dxf")

    If fso.FileExists(dxfPath) Then
        TryGeneratePartDxf = True
        Exit Function
    End If

    Dim previousConfig As String
    previousConfig = ActiveConfigName(partModel)

    If configName <> "" And previousConfig <> configName Then
        If Not partModel.ShowConfiguration2(configName) Then
            TryGeneratePartDxf = False
            Exit Function
        End If
        partModel.EditRebuild3
    End If

    Dim partDoc As Object
    Set partDoc = partModel

    Dim alignment(11) As Double
    Dim views As Variant
    views = Empty

    TryGeneratePartDxf = partDoc.ExportToDWG2( _
        dxfPath, _
        sourcePath, _
        EXPORT_SHEET_METAL, _
        True, _
        alignment, _
        False, _
        False, _
        EXPORT_SHEET_METAL_GEOMETRY_ONLY, _
        views _
    )

    If configName <> "" And previousConfig <> "" And previousConfig <> configName Then
        partModel.ShowConfiguration2 previousConfig
        partModel.EditRebuild3
    End If

    Exit Function

Failed:
    If Not partModel Is Nothing Then
        If configName <> "" And previousConfig <> "" And previousConfig <> configName Then
            partModel.ShowConfiguration2 previousConfig
            partModel.EditRebuild3
        End If
    End If
    TryGeneratePartDxf = False
End Function

Private Function ConfiguredBaseName(ByVal sourcePath As String, ByVal configName As String) As String
    Dim baseName As String
    baseName = BaseNameWithoutExtension(sourcePath)

    If configName = "" Then
        ConfiguredBaseName = baseName
    Else
        ConfiguredBaseName = baseName & "__" & SafeFileName(configName)
    End If
End Function

Private Function SafeFileName(ByVal value As String) As String
    Dim safe As String
    safe = value
    safe = Replace(safe, "\", "_")
    safe = Replace(safe, "/", "_")
    safe = Replace(safe, ":", "_")
    safe = Replace(safe, "*", "_")
    safe = Replace(safe, "?", "_")
    safe = Replace(safe, """", "_")
    safe = Replace(safe, "<", "_")
    safe = Replace(safe, ">", "_")
    safe = Replace(safe, "|", "_")
    safe = Replace(safe, " ", "_")
    SafeFileName = safe
End Function

Private Function UniqueExportFileName(ByVal fileName As String) As String
    Dim candidate As String
    candidate = fileName

    Dim index As Long
    index = 1

    Do While fso.FileExists(fso.BuildPath(filesFolder, candidate))
        candidate = fso.GetBaseName(fileName) & "-" & CStr(index) & "." & fso.GetExtensionName(fileName)
        index = index + 1
    Loop

    UniqueExportFileName = candidate
End Function

Private Function ExportPurposeForFormat(ByVal ext As String) As String
    Select Case LCase$(ext)
        Case "sldasm"
            ExportPurposeForFormat = "solidworks-assembly"
        Case "sldprt"
            ExportPurposeForFormat = "solidworks-part"
        Case "slddrw"
            ExportPurposeForFormat = "solidworks-drawing"
        Case "dxf"
            ExportPurposeForFormat = "cnc-part"
        Case Else
            ExportPurposeForFormat = "manufacturing-export"
    End Select
End Function

Private Function RelatedExtensionsForSource(ByVal sourcePath As String) As Variant
    Select Case LCase$(fso.GetExtensionName(sourcePath))
        Case "sldasm"
            RelatedExtensionsForSource = Array("sldasm", "slddrw")
        Case "sldprt"
            RelatedExtensionsForSource = Array("sldprt", "slddrw", "dxf")
        Case Else
            RelatedExtensionsForSource = Array("slddrw", "dxf")
    End Select
End Function

Private Function OpenModelSilent(ByVal path As String) As Object
    Dim errors As Long
    Dim warnings As Long
    Dim docType As Long

    If LCase$(Right$(path, 7)) = ".sldprt" Then
        docType = DOC_PART
    ElseIf LCase$(Right$(path, 7)) = ".sldasm" Then
        docType = DOC_ASSEMBLY
    Else
        Set OpenModelSilent = Nothing
        Exit Function
    End If

    Set OpenModelSilent = swApp.OpenDoc6(path, docType, OPEN_SILENT, "", errors, warnings)
End Function

Private Function GetCustomProperty(ByVal model As Object, ByVal configName As String, ByVal propertyName As String) As String
    Dim valueOut As String
    Dim resolvedOut As String
    Dim wasResolved As Boolean
    Dim linked As Boolean
    Dim result As Long

    If configName <> "" Then
        result = model.Extension.CustomPropertyManager(configName).Get6(propertyName, False, valueOut, resolvedOut, wasResolved, linked)
        If Trim$(resolvedOut) <> "" Then
            GetCustomProperty = Trim$(resolvedOut)
            Exit Function
        End If
    End If

    result = model.Extension.CustomPropertyManager("").Get6(propertyName, False, valueOut, resolvedOut, wasResolved, linked)
    If Trim$(resolvedOut) <> "" Then
        GetCustomProperty = Trim$(resolvedOut)
    Else
        GetCustomProperty = Trim$(valueOut)
    End If
End Function

Private Function ActiveConfigName(ByVal model As Object) As String
    On Error GoTo Fallback
    ActiveConfigName = model.ConfigurationManager.ActiveConfiguration.Name
    Exit Function
Fallback:
    ActiveConfigName = "Default"
End Function

Private Function BrowseForFolder(ByVal title As String) As String
    Dim shellApp As Object
    Set shellApp = CreateObject("Shell.Application")

    Dim folder As Object
    Set folder = shellApp.BrowseForFolder(0, title, 0)

    If folder Is Nothing Then
        BrowseForFolder = ""
    Else
        BrowseForFolder = folder.Self.Path
    End If
End Function

Private Function Sha256File(ByVal path As String) As String
    On Error GoTo Failed

    If path = "" Or Not fso.FileExists(path) Then
        Sha256File = ""
        Exit Function
    End If

    Dim tmpPath As String
    tmpPath = fso.BuildPath(Environ$("TEMP"), "jedidah-cad-hash-" & Replace(CStr(Timer), ".", "") & ".txt")

    Dim shell As Object
    Set shell = CreateObject("WScript.Shell")
    shell.Run "cmd /c certutil -hashfile " & Quote(path) & " SHA256 > " & Quote(tmpPath), 0, True

    Dim text As String
    text = ReadTextFile(tmpPath)
    fso.DeleteFile tmpPath, True

    Dim lines As Variant
    lines = Split(text, vbCrLf)

    Dim i As Long
    For i = LBound(lines) To UBound(lines)
        Dim line As String
        line = Trim$(CStr(lines(i)))

        If Len(line) = 64 And IsHexString(line) Then
            Sha256File = "sha256:" & LCase$(line)
            Exit Function
        End If
    Next i

Failed:
    Sha256File = ""
End Function

Private Function IsHexString(ByVal value As String) As Boolean
    Dim i As Long
    For i = 1 To Len(value)
        Dim ch As String
        ch = Mid$(value, i, 1)
        If InStr(1, "0123456789abcdefABCDEF", ch, vbBinaryCompare) = 0 Then
            IsHexString = False
            Exit Function
        End If
    Next i

    IsHexString = True
End Function

Private Sub WriteTextFile(ByVal path As String, ByVal text As String)
    Dim stream As Object
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2
    stream.Charset = "utf-8"
    stream.Open
    stream.WriteText text
    stream.SaveToFile path, 2
    stream.Close
End Sub

Private Function ReadTextFile(ByVal path As String) As String
    Dim stream As Object
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2
    stream.Charset = "utf-8"
    stream.Open
    stream.LoadFromFile path
    ReadTextFile = stream.ReadText
    stream.Close
End Function

Private Function JsonString(ByVal value As String) As String
    JsonString = """" & JsonEscape(value) & """"
End Function

Private Function JsonEscape(ByVal value As String) As String
    Dim escaped As String
    escaped = value
    escaped = Replace(escaped, Chr$(92), Chr$(92) & Chr$(92))
    escaped = Replace(escaped, Chr$(34), Chr$(92) & Chr$(34))
    escaped = Replace(escaped, vbCrLf, "\n")
    escaped = Replace(escaped, vbCr, "\n")
    escaped = Replace(escaped, vbLf, "\n")
    escaped = Replace(escaped, Chr$(9), "\t")
    escaped = Replace(escaped, Chr$(8), "\b")
    escaped = Replace(escaped, Chr$(12), "\f")

    Dim c As Long
    For c = 0 To 31
        If c <> 8 And c <> 9 And c <> 10 And c <> 12 And c <> 13 Then
            escaped = Replace(escaped, Chr$(c), "\u" & Right$("0000" & Hex$(c), 4))
        End If
    Next c

    JsonEscape = escaped
End Function

Private Function IsoTimestamp(ByVal value As Date) As String
    IsoTimestamp = Format$(value, "yyyy-mm-dd") & "T" & Format$(value, "hh:nn:ss") & ".000"
End Function

Private Function FileNameOnly(ByVal path As String) As String
    If path = "" Then
        FileNameOnly = ""
    Else
        FileNameOnly = fso.GetFileName(path)
    End If
End Function

Private Function BaseNameWithoutExtension(ByVal path As String) As String
    If path = "" Then
        BaseNameWithoutExtension = ""
    Else
        BaseNameWithoutExtension = fso.GetBaseName(path)
    End If
End Function

Private Function Quote(ByVal value As String) As String
    Dim escaped As String
    escaped = Replace(value, Chr$(34), "")
    escaped = Replace(escaped, "%", "%%")
    Quote = Chr$(34) & escaped & Chr$(34)
End Function
