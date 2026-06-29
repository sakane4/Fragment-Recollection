$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$gallery = Join-Path $root 'resource\gallery'
$manifest = Join-Path $gallery 'manifest.json'
$extensions = @('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.mp4', '.webm', '.mov', '.m4v', '.ogg')

if (-not (Test-Path -LiteralPath $gallery)) {
  New-Item -ItemType Directory -Path $gallery | Out-Null
}

$items = Get-ChildItem -LiteralPath $gallery -File -Recurse |
  Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() } |
  Sort-Object FullName |
  ForEach-Object {
    $relative = $_.FullName.Substring($gallery.Length).TrimStart('\').Replace('\', '/')
    [ordered]@{
      src = $relative
      title = $_.BaseName
    }
  }

$json = ConvertTo-Json -InputObject @($items) -Depth 3
[System.IO.File]::WriteAllText($manifest, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Gallery manifest updated: $($items.Count) item(s)"
