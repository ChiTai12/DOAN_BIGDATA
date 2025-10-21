<#
Simple PowerShell wrapper to run the backend report-delete test script from the repo root.
Usage: run this script from anywhere in PowerShell. It will change into the backend folder,
run the test script, pipe output to console and to a log file, then return the node exit code.
#>

param(
    [string]$BackendDir = "neo4j-social-backend",
    [string]$TestScript = ".\tools\test-delete-report.js",
    [string]$LogFile = ".\neo4j-social-backend\tools\test-delete-report.log"
)

# Resolve script root and backend path
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$backendPath = Join-Path $scriptRoot $BackendDir

if (-not (Test-Path $backendPath)) {
    Write-Host "Backend folder not found: $backendPath" -ForegroundColor Red
    exit 2
}

Push-Location $backendPath
Write-Host "Running test script in: $backendPath"
Write-Host "Logging output to: $LogFile"

# Ensure .env is present (informative)
if (-not (Test-Path (Join-Path $backendPath '.env'))) {
    Write-Host ".env not found in backend folder. Make sure NEO4J env vars are set." -ForegroundColor Yellow
    exit 1
}

# Run node test script and tee output to log
$nodeCmd = "node $TestScript"
Write-Host "$nodeCmd"
try {
    & node $TestScript 2>&1 | Tee-Object -FilePath $LogFile
    $exitCode = $LASTEXITCODE
} catch {
    Write-Host "Failed to run node: $_" -ForegroundColor Red
    $exitCode = 1
}

Pop-Location
if ($exitCode -eq 0) {
    Write-Host "Test script finished successfully." -ForegroundColor Green
} else {
    Write-Host "Test script exited with code $exitCode" -ForegroundColor Red
}
exit $exitCode