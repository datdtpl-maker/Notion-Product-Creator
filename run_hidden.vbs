Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = """" & currentDir & "\notion-product-creator.exe"""
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run exePath, 0, False
