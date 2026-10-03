$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if (-not [Environment]::Is64BitOperatingSystem) {
  throw 'PDFmaster for Windows currently requires 64-bit Windows.'
}

$repository = 'AfzalAshraf/PDFmaster'
$headers = @{
  'Accept' = 'application/vnd.github+json'
  'User-Agent' = 'PDFmaster-Windows-Installer'
}
$releaseUrl = "https://api.github.com/repos/$repository/releases/latest"
$release = Invoke-RestMethod -Uri $releaseUrl -Headers $headers
$installer = $release.assets | Where-Object { $_.name -eq 'PDFmaster-Setup.exe' } | Select-Object -First 1
$checksum = $release.assets | Where-Object { $_.name -eq 'PDFmaster-Setup.exe.sha256' } | Select-Object -First 1

if (-not $installer -or -not $checksum) {
  throw 'The latest GitHub release does not contain a Windows installer and SHA-256 checksum yet.'
}

$downloadDirectory = Join-Path ([IO.Path]::GetTempPath()) 'PDFmaster-Installer'
New-Item -Path $downloadDirectory -ItemType Directory -Force | Out-Null
$installerPath = Join-Path $downloadDirectory 'PDFmaster-Setup.exe'
$checksumPath = Join-Path $downloadDirectory 'PDFmaster-Setup.exe.sha256'

Write-Host "Downloading PDFmaster $($release.tag_name)..."
Invoke-WebRequest -Uri $installer.browser_download_url -Headers $headers -OutFile $installerPath -UseBasicParsing
Invoke-WebRequest -Uri $checksum.browser_download_url -Headers $headers -OutFile $checksumPath -UseBasicParsing

$checksumLine = Get-Content -Path $checksumPath -Raw
$expectedHash = ($checksumLine.Trim() -split '\s+')[0]
$actualHash = (Get-FileHash -Path $installerPath -Algorithm SHA256).Hash
if ($expectedHash -notmatch '^[0-9a-fA-F]{64}$' -or $actualHash -ine $expectedHash) {
  Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
  throw 'The installer SHA-256 check failed. The downloaded file was not run.'
}

Write-Host 'Checksum verified. Starting the PDFmaster setup wizard...'
$process = Start-Process -FilePath $installerPath -Wait -PassThru
if ($process.ExitCode -ne 0) {
  throw "PDFmaster setup exited with code $($process.ExitCode)."
}
Write-Host 'PDFmaster installation finished.'
