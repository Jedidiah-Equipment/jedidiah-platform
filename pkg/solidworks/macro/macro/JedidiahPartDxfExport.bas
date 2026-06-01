Attribute VB_Name = "JedidiahPartDxfExport"
Option Explicit

' Jedidiah SolidWorks CAD export macro.
'
' V1 exports DXF files only, but the manifest is shaped around the durable
' Product -> Assembly -> Part hierarchy so later Product and Assembly files can
' be added by filling existing exports arrays.

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
Private warnings As Collection
Private assemblyOrder As Collection
Private assemblyNames As Object
Private assemblyFiles As Object
Private assemblyPaths As Object
Private assemblyConfigs As Object
Private partOrder As Collection
Private partAssemblyByKey As Object
Private partCodesByKey As Object
Private partNamesByKey As Object
Private partFilesByKey As Object
Private partPathsByKey As Object
Private partConfigsByKey As Object
Private partQuantitiesByKey As Object
Private partDxfFilesByKey As Object
Private partDxfPathsByKey As Object
Private dxfFileBySourceConfig As Object
Private dxfPathBySourceConfig As Object

Public Sub Main()
    Set swApp = Application.SldWorks
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set warnings = New Collection
    InitCollections

    Dim model As Object
    Set model = swApp.ActiveDoc

    If model Is Nothing Then
        MsgBox "Open the top-level Product assembly before running this macro.", vbExclamation
        Exit Sub
    End If

    If model.GetType <> DOC_ASSEMBLY Then
        MsgBox "The active document must be the top-level Product assembly (.SLDASM).", vbExclamation
        Exit Sub
    End If

    If model.GetPathName = "" Then
        MsgBox "Save the top-level Product assembly before exporting Part DXFs.", vbExclamation
        Exit Sub
    End If

    Dim productModelCode As String
    productModelCode = GetCustomProperty(model, ActiveConfigName(model), PROP_PRODUCT_MODEL_CODE)
    If productModelCode = "" Then
        MsgBox "Set " & PROP_PRODUCT_MODEL_CODE & " on the top-level Product assembly before exporting.", vbExclamation
        Exit Sub
    End If

    Dim outputParent As String
    outputParent = BrowseForFolder("Choose where to create the Jedidiah CAD export")
    If outputParent = "" Then Exit Sub

    Dim exportFolder As String
    exportFolder = fso.BuildPath(outputParent, "cad-export-" & Format(Now, "yyyymmdd-hhnnss"))
    filesFolder = fso.BuildPath(exportFolder, "files")
    fso.CreateFolder exportFolder
    fso.CreateFolder filesFolder

    TraverseTopLevelAssembly model

    WriteTextFile fso.BuildPath(exportFolder, "manifest.json"), BuildManifestJson(model, productModelCode)

    MsgBox "Jedidiah CAD export complete." & vbCrLf _
        & "Exported Part DXFs: " & CStr(dxfFileBySourceConfig.Count) & vbCrLf _
        & "Warnings: " & CStr(warnings.Count) & vbCrLf _
        & exportFolder, vbInformation
End Sub

Private Sub InitCollections()
    Set assemblyOrder = New Collection
    Set assemblyNames = CreateObject("Scripting.Dictionary")
    Set assemblyFiles = CreateObject("Scripting.Dictionary")
    Set assemblyPaths = CreateObject("Scripting.Dictionary")
    Set assemblyConfigs = CreateObject("Scripting.Dictionary")

    Set partOrder = New Collection
    Set partAssemblyByKey = CreateObject("Scripting.Dictionary")
    Set partCodesByKey = CreateObject("Scripting.Dictionary")
    Set partNamesByKey = CreateObject("Scripting.Dictionary")
    Set partFilesByKey = CreateObject("Scripting.Dictionary")
    Set partPathsByKey = CreateObject("Scripting.Dictionary")
    Set partConfigsByKey = CreateObject("Scripting.Dictionary")
    Set partQuantitiesByKey = CreateObject("Scripting.Dictionary")
    Set partDxfFilesByKey = CreateObject("Scripting.Dictionary")
    Set partDxfPathsByKey = CreateObject("Scripting.Dictionary")

    Set dxfFileBySourceConfig = CreateObject("Scripting.Dictionary")
    Set dxfPathBySourceConfig = CreateObject("Scripting.Dictionary")
End Sub

Private Sub TraverseTopLevelAssembly(ByVal assemblyModel As Object)
    Dim components As Variant
    components = assemblyModel.GetComponents(True)

    If IsEmpty(components) Then
        AddWarning "No components were found in the top-level Product assembly."
        Exit Sub
    End If

    Dim i As Long
    For i = LBound(components) To UBound(components)
        TraverseComponent components(i), ""
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

    If componentModel Is Nothing Then
        AddWarning "Could not open component: " & component.GetPathName
        Exit Sub
    End If

    Dim docType As Long
    docType = componentModel.GetType

    If docType = DOC_ASSEMBLY Then
        Dim configName As String
        configName = component.ReferencedConfiguration

        Dim assemblyCode As String
        assemblyCode = GetCustomProperty(componentModel, configName, PROP_ASSEMBLY_CODE)

        If assemblyCode <> "" Then
            currentAssemblyCode = assemblyCode
            EnsureAssembly assemblyCode, BaseNameWithoutExtension(component.GetPathName), component.GetPathName, configName
        ElseIf currentAssemblyCode = "" Then
            AddWarning "Assembly " & FileNameOnly(component.GetPathName) & " is missing " & PROP_ASSEMBLY_CODE & "; Parts below it will be skipped unless a child assembly has a code."
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
        ExportPartOccurrence componentModel, component.GetPathName, component.ReferencedConfiguration, currentAssemblyCode
    End If
End Sub

Private Sub EnsureAssembly(ByVal assemblyCode As String, ByVal name As String, ByVal sourcePath As String, ByVal configName As String)
    If assemblyNames.Exists(assemblyCode) Then Exit Sub

    assemblyOrder.Add assemblyCode
    assemblyNames.Add assemblyCode, name
    assemblyFiles.Add assemblyCode, FileNameOnly(sourcePath)
    assemblyPaths.Add assemblyCode, sourcePath
    assemblyConfigs.Add assemblyCode, configName
End Sub

Private Sub ExportPartOccurrence(ByVal partModel As Object, ByVal sourcePath As String, ByVal configName As String, ByVal assemblyCode As String)
    If sourcePath = "" Then Exit Sub

    If assemblyCode = "" Then
        AddWarning "Skipped " & FileNameOnly(sourcePath) & ": no parent assembly with " & PROP_ASSEMBLY_CODE & " was found."
        Exit Sub
    End If

    If configName = "" Then
        configName = ActiveConfigName(partModel)
    End If

    Dim partCode As String
    partCode = GetCustomProperty(partModel, configName, PROP_PART_CODE)
    If partCode = "" Then
        AddWarning "Skipped " & FileNameOnly(sourcePath) & " [" & configName & "]: missing " & PROP_PART_CODE & "."
        Exit Sub
    End If

    Dim rowKey As String
    rowKey = assemblyCode & "|" & partCode & "|" & LCase$(sourcePath) & "|" & configName

    If partQuantitiesByKey.Exists(rowKey) Then
        partQuantitiesByKey(rowKey) = CLng(partQuantitiesByKey(rowKey)) + 1
        Exit Sub
    End If

    Dim sourceConfigKey As String
    sourceConfigKey = LCase$(sourcePath) & "|" & LCase$(configName)

    If Not dxfFileBySourceConfig.Exists(sourceConfigKey) Then
        If Not ExportPartDxf(partModel, sourcePath, configName, partCode, sourceConfigKey) Then
            Exit Sub
        End If
    End If

    partOrder.Add rowKey
    partAssemblyByKey.Add rowKey, assemblyCode
    partCodesByKey.Add rowKey, partCode
    partNamesByKey.Add rowKey, BaseNameWithoutExtension(sourcePath)
    partFilesByKey.Add rowKey, FileNameOnly(sourcePath)
    partPathsByKey.Add rowKey, sourcePath
    partConfigsByKey.Add rowKey, configName
    partQuantitiesByKey.Add rowKey, 1
    partDxfFilesByKey.Add rowKey, CStr(dxfFileBySourceConfig(sourceConfigKey))
    partDxfPathsByKey.Add rowKey, CStr(dxfPathBySourceConfig(sourceConfigKey))
End Sub

Private Function ExportPartDxf(ByVal partModel As Object, ByVal sourcePath As String, ByVal configName As String, ByVal partCode As String, ByVal sourceConfigKey As String) As Boolean
    Dim previousConfig As String
    previousConfig = ActiveConfigName(partModel)

    If configName <> "" And previousConfig <> configName Then
        If Not partModel.ShowConfiguration2(configName) Then
            AddWarning "Skipped " & FileNameOnly(sourcePath) & " [" & configName & "]: configuration could not be activated."
            ExportPartDxf = False
            Exit Function
        End If
        partModel.EditRebuild3
    End If

    Dim dxfFileName As String
    dxfFileName = UniqueExportFileName(ExportDxfFileName(partCode, configName))

    Dim dxfPath As String
    dxfPath = fso.BuildPath(filesFolder, dxfFileName)

    If ExportActivePartDxf(partModel, sourcePath, dxfPath) Then
        dxfFileBySourceConfig.Add sourceConfigKey, dxfFileName
        dxfPathBySourceConfig.Add sourceConfigKey, dxfPath
        ExportPartDxf = True
    Else
        AddWarning "Skipped " & FileNameOnly(sourcePath) & " [" & configName & "]: SolidWorks did not export a DXF. Confirm this is a sheet-metal Part with a valid flat pattern."
        ExportPartDxf = False
    End If

    If configName <> "" And previousConfig <> "" And previousConfig <> configName Then
        partModel.ShowConfiguration2 previousConfig
        partModel.EditRebuild3
    End If
End Function

Private Function ExportActivePartDxf(ByVal partModel As Object, ByVal sourcePath As String, ByVal dxfPath As String) As Boolean
    On Error GoTo Failed

    Dim alignment(11) As Double
    Dim views As Variant
    views = Empty

    ExportActivePartDxf = partModel.ExportToDWG2( _
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

    If ExportActivePartDxf And Not fso.FileExists(dxfPath) Then
        ExportActivePartDxf = False
    End If

    Exit Function

Failed:
    ExportActivePartDxf = False
End Function

Private Function BuildManifestJson(ByVal productModel As Object, ByVal productModelCode As String) As String
    Dim json As String
    json = "{"
    json = json & vbCrLf & "  ""schemaVersion"": 1,"
    json = json & vbCrLf & "  ""sourceSystem"": ""solidworks"","
    json = json & vbCrLf & "  ""exportKind"": ""cad-export"","
    json = json & vbCrLf & "  ""exportedAt"": " & JsonString(IsoTimestamp(Now)) & ","
    json = json & vbCrLf & "  ""solidWorksVersion"": " & JsonString(SolidWorksVersion()) & ","
    json = json & vbCrLf & "  ""product"": {"
    json = json & vbCrLf & "    ""modelCode"": " & JsonString(productModelCode) & ","
    json = json & vbCrLf & "    ""name"": " & JsonString(BaseNameWithoutExtension(productModel.GetPathName)) & ","
    json = json & vbCrLf & "    ""source"": " & BuildSourceJson(productModel.GetPathName, ActiveConfigName(productModel)) & ","
    json = json & vbCrLf & "    ""exports"": [],"
    json = json & vbCrLf & "    ""assemblies"": " & BuildAssembliesJson()
    json = json & vbCrLf & "  },"
    json = json & vbCrLf & "  ""warnings"": " & BuildWarningsJson()
    json = json & vbCrLf & "}"

    BuildManifestJson = json
End Function

Private Function BuildAssembliesJson() As String
    Dim json As String
    json = "["

    Dim i As Long
    For i = 1 To assemblyOrder.Count
        If i > 1 Then json = json & ","
        json = json & vbCrLf & BuildAssemblyJson(CStr(assemblyOrder(i)))
    Next i

    If assemblyOrder.Count > 0 Then json = json & vbCrLf & "    "
    json = json & "]"

    BuildAssembliesJson = json
End Function

Private Function BuildAssemblyJson(ByVal assemblyCode As String) As String
    Dim json As String
    json = "      {"
    json = json & vbCrLf & "        ""code"": " & JsonString(assemblyCode) & ","
    json = json & vbCrLf & "        ""name"": " & JsonString(CStr(assemblyNames(assemblyCode))) & ","
    json = json & vbCrLf & "        ""source"": " & BuildSourceJson(CStr(assemblyPaths(assemblyCode)), CStr(assemblyConfigs(assemblyCode))) & ","
    json = json & vbCrLf & "        ""exports"": [],"
    json = json & vbCrLf & "        ""parts"": " & BuildAssemblyPartsJson(assemblyCode)
    json = json & vbCrLf & "      }"

    BuildAssemblyJson = json
End Function

Private Function BuildAssemblyPartsJson(ByVal assemblyCode As String) As String
    Dim json As String
    json = "["

    Dim count As Long
    count = 0

    Dim i As Long
    For i = 1 To partOrder.Count
        Dim rowKey As String
        rowKey = CStr(partOrder(i))

        If CStr(partAssemblyByKey(rowKey)) = assemblyCode Then
            If count > 0 Then json = json & ","
            json = json & vbCrLf & BuildPartJson(rowKey)
            count = count + 1
        End If
    Next i

    If count > 0 Then json = json & vbCrLf & "        "
    json = json & "]"

    BuildAssemblyPartsJson = json
End Function

Private Function BuildPartJson(ByVal rowKey As String) As String
    Dim dxfPath As String
    dxfPath = CStr(partDxfPathsByKey(rowKey))

    Dim dxfFileName As String
    dxfFileName = CStr(partDxfFilesByKey(rowKey))

    Dim json As String
    json = "          {"
    json = json & vbCrLf & "            ""partCode"": " & JsonString(CStr(partCodesByKey(rowKey))) & ","
    json = json & vbCrLf & "            ""name"": " & JsonString(CStr(partNamesByKey(rowKey))) & ","
    json = json & vbCrLf & "            ""quantity"": " & CStr(partQuantitiesByKey(rowKey)) & ","
    json = json & vbCrLf & "            ""source"": " & BuildSourceJson(CStr(partPathsByKey(rowKey)), CStr(partConfigsByKey(rowKey))) & ","
    json = json & vbCrLf & "            ""exports"": ["
    json = json & vbCrLf & "              {"
    json = json & vbCrLf & "                ""fileName"": " & JsonString(dxfFileName) & ","
    json = json & vbCrLf & "                ""relativePath"": " & JsonString("files/" & dxfFileName) & ","
    json = json & vbCrLf & "                ""format"": ""dxf"","
    json = json & vbCrLf & "                ""purpose"": ""cnc-part"","
    json = json & vbCrLf & "                ""hash"": " & JsonString(Sha256File(dxfPath))
    json = json & vbCrLf & "              }"
    json = json & vbCrLf & "            ]"
    json = json & vbCrLf & "          }"

    BuildPartJson = json
End Function

Private Function BuildSourceJson(ByVal sourcePath As String, ByVal configName As String) As String
    BuildSourceJson = "{" _
        & """fileName"": " & JsonString(FileNameOnly(sourcePath)) & ", " _
        & """filePath"": " & JsonString(sourcePath) & ", " _
        & """configuration"": " & JsonString(configName) _
        & "}"
End Function

Private Function ExportDxfFileName(ByVal partCode As String, ByVal configName As String) As String
    Dim baseName As String
    baseName = SafeFileName(partCode)

    If configName <> "" And LCase$(configName) <> "default" Then
        baseName = baseName & "__" & SafeFileName(configName)
    End If

    ExportDxfFileName = baseName & ".dxf"
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

Private Function OpenModelSilent(ByVal path As String) As Object
    Dim errors As Long
    Dim warningsOut As Long
    Dim docType As Long

    If LCase$(Right$(path, 7)) = ".sldprt" Then
        docType = DOC_PART
    ElseIf LCase$(Right$(path, 7)) = ".sldasm" Then
        docType = DOC_ASSEMBLY
    Else
        Set OpenModelSilent = Nothing
        Exit Function
    End If

    Set OpenModelSilent = swApp.OpenDoc6(path, docType, OPEN_SILENT, "", errors, warningsOut)
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
        If Trim$(valueOut) <> "" Then
            GetCustomProperty = Trim$(valueOut)
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

Private Function BuildWarningsJson() As String
    Dim json As String
    json = "["

    Dim i As Long
    For i = 1 To warnings.Count
        If i > 1 Then json = json & ","
        json = json & vbCrLf & "    " & JsonString(CStr(warnings(i)))
    Next i

    If warnings.Count > 0 Then json = json & vbCrLf & "  "
    json = json & "]"

    BuildWarningsJson = json
End Function

Private Sub AddWarning(ByVal message As String)
    warnings.Add message
End Sub

Private Function ActiveConfigName(ByVal model As Object) As String
    On Error GoTo Fallback
    ActiveConfigName = model.ConfigurationManager.ActiveConfiguration.Name
    Exit Function
Fallback:
    ActiveConfigName = "Default"
End Function

Private Function SolidWorksVersion() As String
    On Error GoTo Fallback
    SolidWorksVersion = swApp.RevisionNumber
    Exit Function
Fallback:
    SolidWorksVersion = ""
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
    tmpPath = fso.BuildPath(Environ$("TEMP"), "jedidiah-cad-hash-" & Replace(CStr(Timer), ".", "") & ".txt")

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
