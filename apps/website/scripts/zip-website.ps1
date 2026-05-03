$ErrorActionPreference = 'Stop'

# Build a clean cross-platform zip of apps/website with forward-slash entries.
# Compress-Archive on PS5 emits backslash entries, which break some POSIX
# unzip tools. ZipFile::CreateFromDirectory writes the standard zip format.

Add-Type -AssemblyName System.IO.Compression.FileSystem

$source = Resolve-Path "$PSScriptRoot\.."
$dest = "C:\Users\james\Downloads\operon-website.zip"

if (Test-Path $dest) { Remove-Item $dest -Force }

# Stage to a temp dir so we can exclude scripts/ subfolder if desired. Here we
# include everything under apps/website except node_modules / dist artifacts.
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $source.Path,
    $dest,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false  # don't include the source dir name as a top-level entry
)

$item = Get-Item $dest
Write-Host ("zip: {0}" -f $item.FullName)
Write-Host ("size: {0} bytes" -f $item.Length)

# Post-process: rewrite entry names to use forward-slash separators (PS5's
# .NET ZipFile emits backslashes, which break some POSIX unzip tools).
& node "$PSScriptRoot\fix-zip-slashes.mjs" $dest
