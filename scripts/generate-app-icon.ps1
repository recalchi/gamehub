param(
  [string]$OutDir = "build"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param(
    [double]$X,
    [double]$Y,
    [double]$W,
    [double]$H,
    [double]$R
  )
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $R * 2
  $path.AddArc($X, $Y, $d, $d, 180, 90)
  $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
  $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
  $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Save-IcoFromPngs {
  param(
    [string[]]$PngPaths,
    [string]$IcoPath
  )

  $pngBlobs = @()
  foreach ($path in $PngPaths) {
    $pngBlobs += ,([System.IO.File]::ReadAllBytes($path))
  }

  $count = $pngBlobs.Count
  $headerSize = 6 + (16 * $count)
  $offset = $headerSize

  $dir = [System.IO.Path]::GetDirectoryName($IcoPath)
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
  }

  $fs = [System.IO.File]::Open($IcoPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  try {
    $bw = New-Object System.IO.BinaryWriter($fs)
    $bw.Write([UInt16]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]$count)

    for ($i = 0; $i -lt $count; $i++) {
      $img = [System.Drawing.Image]::FromFile($PngPaths[$i])
      try {
        $w = $img.Width
        $h = $img.Height
      } finally {
        $img.Dispose()
      }

      $blob = $pngBlobs[$i]
      $widthByte = if ($w -ge 256) { 0 } else { [byte]$w }
      $heightByte = if ($h -ge 256) { 0 } else { [byte]$h }
      $bw.Write([byte]$widthByte)
      $bw.Write([byte]$heightByte)
      $bw.Write([byte]0)
      $bw.Write([byte]0)
      $bw.Write([UInt16]1)
      $bw.Write([UInt16]32)
      $bw.Write([UInt32]$blob.Length)
      $bw.Write([UInt32]$offset)
      $offset += $blob.Length
    }

    foreach ($blob in $pngBlobs) { $bw.Write($blob) }
    $bw.Flush()
  } finally {
    $fs.Dispose()
  }
}

$root = Resolve-Path -LiteralPath "." | ForEach-Object { $_.Path }
$buildDir = Join-Path $root $OutDir
$iconDir = Join-Path $buildDir "icons"
if (-not (Test-Path -LiteralPath $iconDir)) {
  New-Item -ItemType Directory -Path $iconDir -Force | Out-Null
}

$masterSize = 1024
$masterPath = Join-Path $iconDir "icon-master-1024.png"

$bmp = New-Object System.Drawing.Bitmap($masterSize, $masterSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
try {
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  # Premium dark base
  $card = New-RoundedRectPath -X 72 -Y 72 -W 880 -H 880 -R 196
  try {
    $base = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.PointF(72, 72)),
      (New-Object System.Drawing.PointF(952, 952)),
      ([System.Drawing.Color]::FromArgb(255, 7, 10, 18)),
      ([System.Drawing.Color]::FromArgb(255, 12, 20, 33))
    )
    try { $g.FillPath($base, $card) } finally { $base.Dispose() }
  } finally { $card.Dispose() }

  # Subtle border
  $frame = New-RoundedRectPath -X 78 -Y 78 -W 868 -H 868 -R 188
  $framePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(64, 255, 255, 255), 2)
  try { $g.DrawPath($framePen, $frame) } finally { $framePen.Dispose(); $frame.Dispose() }

  # New symbol concept: ultra-minimal "H" monolith + energy slash
  # Left pillar
  $leftPillarBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 245, 249, 255))
  try {
    $leftPillar = New-RoundedRectPath -X 300 -Y 250 -W 126 -H 524 -R 62
    try { $g.FillPath($leftPillarBrush, $leftPillar) } finally { $leftPillar.Dispose() }
  } finally { $leftPillarBrush.Dispose() }

  # Right pillar
  $rightPillarBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 245, 249, 255))
  try {
    $rightPillar = New-RoundedRectPath -X 598 -Y 250 -W 126 -H 524 -R 62
    try { $g.FillPath($rightPillarBrush, $rightPillar) } finally { $rightPillar.Dispose() }
  } finally { $rightPillarBrush.Dispose() }

  # Center bridge
  $bridge = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF(426, 456)),
    (New-Object System.Drawing.PointF(598, 568)),
    ([System.Drawing.Color]::FromArgb(255, 48, 236, 255)),
    ([System.Drawing.Color]::FromArgb(255, 149, 104, 255))
  )
  try {
    $bridgePath = New-RoundedRectPath -X 414 -Y 452 -W 196 -H 122 -R 58
    try { $g.FillPath($bridge, $bridgePath) } finally { $bridgePath.Dispose() }
  } finally { $bridge.Dispose() }

  # Energy slash (revolutionary accent)
  $slashPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  try {
    $pts = @(
      (New-Object System.Drawing.PointF(468, 276)),
      (New-Object System.Drawing.PointF(560, 276)),
      (New-Object System.Drawing.PointF(454, 748)),
      (New-Object System.Drawing.PointF(362, 748))
    )
    $slashPath.AddPolygon($pts)
    $slashBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.PointF(360, 748)),
      (New-Object System.Drawing.PointF(560, 276)),
      ([System.Drawing.Color]::FromArgb(255, 20, 230, 255)),
      ([System.Drawing.Color]::FromArgb(255, 102, 150, 255))
    )
    try {
      $g.FillPath($slashBrush, $slashPath)
    } finally { $slashBrush.Dispose() }
  } finally { $slashPath.Dispose() }

  # Ambient glow
  $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  try {
    $glowPath.AddEllipse((New-Object System.Drawing.RectangleF(196, 190, 632, 644)))
    $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    try {
      $pg.CenterColor = [System.Drawing.Color]::FromArgb(72, 44, 214, 255)
      $pg.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 42, 220, 255))
      $g.FillEllipse($pg, 196, 190, 632, 644)
    } finally { $pg.Dispose() }
  } finally { $glowPath.Dispose() }

  $bmp.Save($masterPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $g.Dispose()
  $bmp.Dispose()
}

$sizes = @(16, 24, 32, 48, 64, 128, 256, 512)
$pngsForIco = @()

foreach ($size in $sizes) {
  $src = [System.Drawing.Image]::FromFile($masterPath)
  $dst = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gg = [System.Drawing.Graphics]::FromImage($dst)
  try {
    $gg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $gg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gg.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $gg.Clear([System.Drawing.Color]::Transparent)
    $gg.DrawImage($src, 0, 0, $size, $size)
  } finally {
    $gg.Dispose()
    $src.Dispose()
  }

  $pngPath = Join-Path $iconDir ("icon-{0}.png" -f $size)
  $dst.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose()
  if ($size -le 256) { $pngsForIco += $pngPath }
}

$icoPath = Join-Path $buildDir "icon.ico"
Save-IcoFromPngs -PngPaths $pngsForIco -IcoPath $icoPath

Write-Host "Icon pack generated:"
Write-Host " - $icoPath"
Write-Host " - $iconDir"
