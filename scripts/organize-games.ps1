# organize-games.ps1
# Move every loose game folder/file in $Root into a per-platform subfolder.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/organize-games.ps1 -Root "E:\Jogos"
#   powershell -ExecutionPolicy Bypass -File scripts/organize-games.ps1 -Root "E:\Jogos" -DryRun
#
# Default is dry-run — preview moves without touching files. Pass `-Apply`
# to actually move them.
#
# Detection heuristics (cheap, no SHA needed):
#   - folder contains PS3_GAME or PS3_DISC.SFB  → PS3
#   - folder contains .pkg + .rap               → PS3
#   - folder contains EBOOT.BIN/USRDIR          → PS3
#   - filename suffix matches extension table   → respective platform
#   - .iso > 7GB                                → Xbox 360 (DVD9)
#   - .iso 3-7GB with PS2 path hint             → PS2
#   - .iso 3-7GB no hint                        → PS3 (largest population)
#
# Preserves these folders untouched (they're already organized):
#   PS1, PS2, PS3, PS4, PSP, NDS, GBA, SNES, NES, GameCube, Wii, Xbox, XBOX,
#   Xbox360, Switch, PC, Riot Games, Epic Games, EpicGames, Steam, Emuladores

param(
  [Parameter(Mandatory = $true)][string]$Root,
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Root)) {
  throw "Root '$Root' não existe."
}

$DryRun = -not $Apply

# Folders we never touch (already platform-organized or non-game)
$PreservedFolders = @(
  'PS1', 'PS2', 'PS3', 'PS4', 'PSP',
  'NDS', 'GBA', 'GB', 'GBC',
  'SNES', 'NES', 'N64',
  'GameCube', 'Wii',
  'Xbox', 'XBOX', 'Xbox360', 'X360',
  'Switch', 'N3DS', '3DS',
  'PC', 'Steam',
  'Riot Games', 'Epic Games', 'EpicGames',
  'Emuladores', '__organize_log'
)

function Test-IsPreserved([string]$Name) {
  foreach ($p in $PreservedFolders) {
    if ($Name -ieq $p) { return $true }
  }
  return $false
}

# Extension → platform mapping (single-extension obvious cases)
$ExtensionMap = @{
  '.nes' = 'NES'
  '.fds' = 'NES'
  '.sfc' = 'SNES'
  '.smc' = 'SNES'
  '.n64' = 'N64'
  '.z64' = 'N64'
  '.v64' = 'N64'
  '.gba' = 'GBA'
  '.gbc' = 'GBC'
  '.gb'  = 'GB'
  '.nds' = 'NDS'
  '.3ds' = '3DS'
  '.nsp' = 'Switch'
  '.xci' = 'Switch'
  '.xex' = 'Xbox360'
  '.cue' = 'PS1'
  '.pbp' = 'PSP'
  '.cso' = 'PSP'
  '.gcm' = 'GameCube'
  '.gcz' = 'GameCube'
  '.rvz' = 'GameCube'
  '.wbfs' = 'Wii'
}

function Classify-FolderContents([string]$Path) {
  # Returns a platform short name, or $null if undetermined.
  $children = Get-ChildItem -Path $Path -ErrorAction SilentlyContinue
  if (-not $children) { return $null }

  $hasPs3Game = $false
  $hasPkg = $false
  $hasRap = $false
  $hasEbootBin = $false
  $largestIso = $null
  $largestIsoSize = 0
  $cdMatched = $null

  foreach ($c in $children) {
    if ($c.PSIsContainer) {
      switch -wildcard ($c.Name.ToUpper()) {
        'PS3_GAME' { $hasPs3Game = $true }
        'PS3_DISC' { $hasPs3Game = $true }
        'USRDIR'   { $hasEbootBin = $true }
      }
      # One more level — eboot.bin is often in PS3_GAME/USRDIR
      if ($c.Name -ieq 'PS3_GAME') {
        $eboot = Join-Path $c.FullName 'USRDIR\EBOOT.BIN'
        if (Test-Path $eboot) { $hasEbootBin = $true }
      }
      continue
    }
    $ext = $c.Extension.ToLower()
    if ($ExtensionMap.ContainsKey($ext)) {
      $cdMatched = $ExtensionMap[$ext]
    }
    switch ($ext) {
      '.pkg' { $hasPkg = $true }
      '.rap' { $hasRap = $true }
      '.iso' {
        if ($c.Length -gt $largestIsoSize) {
          $largestIso = $c
          $largestIsoSize = $c.Length
        }
      }
      '.bin' { }
    }
    if ($c.Name -ieq 'PS3_DISC.SFB') { $hasPs3Game = $true }
    if ($c.Name -ieq 'EBOOT.BIN')    { $hasEbootBin = $true }
  }

  # Strongest signals first
  if ($hasPs3Game -or $hasEbootBin) { return 'PS3' }
  if ($hasPkg -and $hasRap) { return 'PS3' }
  if ($hasPkg) {
    # .pkg without .rap is more likely PS4 these days, but Riot/Epic etc.
    # use uppercase CUSA in name — that's PS4 specific.
    foreach ($c in $children) {
      if ($c.Name -match 'CUSA\d+|PSVR') { return 'PS4' }
    }
    return 'PS3'
  }
  if ($cdMatched) { return $cdMatched }

  if ($largestIso) {
    if ($largestIsoSize -gt 7GB) { return 'Xbox360' }
    if ($largestIsoSize -gt 1GB) {
      # Path hint
      if ($Path -match 'XBOX')      { return 'Xbox360' }
      if ($Path -match 'PS2|PCSX2') { return 'PS2' }
      if ($Path -match 'GameCube|GCN') { return 'GameCube' }
      return 'PS3' # Largest catalog target — user can move if wrong.
    }
    return 'PS1' # Small ISOs likely PS1
  }
  return $null
}

function Classify-LooseFile([System.IO.FileInfo]$File) {
  $ext = $File.Extension.ToLower()
  if ($ExtensionMap.ContainsKey($ext)) { return $ExtensionMap[$ext] }
  if ($ext -eq '.iso') {
    if ($File.Length -gt 7GB) { return 'Xbox360' }
    if ($File.Length -gt 1GB) { return 'PS3' }
    return 'PS1'
  }
  if ($ext -eq '.pkg') {
    if ($File.Name -match 'CUSA\d+|PSVR') { return 'PS4' }
    return 'PS3'
  }
  return $null
}

# Build the move plan first, then execute (or just print on dry-run).
$plan = @()
$skipped = @()

Get-ChildItem -Path $Root -Force | ForEach-Object {
  if (Test-IsPreserved $_.Name) {
    $skipped += "  [skip] $($_.Name) (já organizado)"
    return
  }

  $target = $null
  if ($_.PSIsContainer) {
    $target = Classify-FolderContents $_.FullName
  } else {
    $target = Classify-LooseFile $_
  }

  if (-not $target) {
    $skipped += "  [???]  $($_.Name) (sem classificação confiável)"
    return
  }

  $dest = Join-Path $Root $target
  $plan += [PSCustomObject]@{
    Source = $_.FullName
    Name   = $_.Name
    Dest   = $dest
    Target = $target
  }
}

Write-Host ""
Write-Host "=== Plano de organização para '$Root' ==="
$grouped = $plan | Group-Object Target
foreach ($g in $grouped | Sort-Object Name) {
  Write-Host ""
  Write-Host "→ $($g.Name) ($($g.Count) item(s)):"
  foreach ($item in $g.Group) {
    Write-Host "    $($item.Name)"
  }
}

if ($skipped.Count -gt 0) {
  Write-Host ""
  Write-Host "=== Ignorados ==="
  $skipped | ForEach-Object { Write-Host $_ }
}

Write-Host ""
if ($DryRun) {
  Write-Host "(dry-run — nada movido. Rode com -Apply para executar.)" -ForegroundColor Yellow
  return
}

Write-Host "Aplicando movimentações..." -ForegroundColor Cyan
foreach ($item in $plan) {
  if (-not (Test-Path $item.Dest)) {
    New-Item -ItemType Directory -Path $item.Dest -Force | Out-Null
  }
  $finalPath = Join-Path $item.Dest $item.Name
  if (Test-Path $finalPath) {
    Write-Warning "  destino já existe: $finalPath — pulado"
    continue
  }
  try {
    Move-Item -Path $item.Source -Destination $item.Dest -Force
    Write-Host "  movido: $($item.Name) → $($item.Target)" -ForegroundColor Green
  } catch {
    Write-Warning "  falha: $($item.Name): $($_.Exception.Message)"
  }
}
Write-Host ""
Write-Host "Pronto." -ForegroundColor Green
