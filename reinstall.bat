@echo off
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File "%~dp0reinstall.ps1"
if errorlevel 1 pause
