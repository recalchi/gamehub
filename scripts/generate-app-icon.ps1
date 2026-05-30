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
    $bw.Write([UInt16]0) # reserved
    $bw.Write([UInt16]1) # icon type
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
      $bw.Write([byte]0)       # color count
      $bw.Write([byte]0)       # reserved
      $bw.Write([UInt16]1)     # planes
      $bw.Write([UInt16]32)    # bit depth
      $bw.Write([UInt32]$blob.Length)
      $bw.Write([UInt32]$offset)

      $offset += $blob.Length
    }

    foreach ($blob in $pngBlobs) {
      $bw.Write($blob)
    }
    $bw.Flush()
  } finally {
    $fs.Dispose()
  }
}

$out = Resolve-Path -LiteralPath "." | ForEach-Object { $_.Path }
$buildDir = Join-Path $out $OutDir
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

  # Background card
  $cardPath = New-RoundedRectPath -X 70 -Y 70 -W 884 -H 884 -R 210
  try {
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.PointF(70, 70)),
      (New-Object System.Drawing.PointF(954, 954)),
      ([System.Drawing.Color]::FromArgb(255, 10, 16, 30)),
      ([System.Drawing.Color]::FromArgb(255, 18, 35, 60))
    )
    try {
      $g.FillPath($bg, $cardPath)
    } finally {
      $bg.Dispose()
    }
  } finally {
    $cardPath.Dispose()
  }

  # Soft inner glow
  $glowRect = New-Object System.Drawing.RectangleF(130, 120, 760, 760)
  $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  try {
    $glowPath.AddEllipse($glowRect)
    $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    try {
      $pg.CenterColor = [System.Drawing.Color]::FromArgb(120, 44, 201, 255)
      $pg.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 44, 201, 255))
      $g.FillEllipse($pg, $glowRect)
    } finally {
      $pg.Dispose()
    }
  } finally {
    $glowPath.Dispose()
  }

  # Main "G" neon ring
  $ringRect = New-Object System.Drawing.RectangleF(210, 210, 604, 604)
  $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 0, 230, 255), 88)
  try {
    $ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($ringPen, $ringRect, 25, 300)
  } finally {
    $ringPen.Dispose()
  }

  # Cross-bar to complete "G"
  $barBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF(530, 500)),
    (New-Object System.Drawing.PointF(800, 600)),
    ([System.Drawing.Color]::FromArgb(255, 0, 240, 255)),
    ([System.Drawing.Color]::FromArgb(255, 148, 92, 255))
  )
  try {
    $barPath = New-RoundedRectPath -X 510 -Y 498 -W 250 -H 120 -R 56
    try {
      $g.FillPath($barBrush, $barPath)
    } finally {
      $barPath.Dispose()
    }
  } finally {
    $barBrush.Dispose()
  }

  # Minimal "button" accent
  $btnBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 95, 198))
  try {
    $g.FillEllipse($btnBrush, 688, 430, 76, 76)
  } finally {
    $btnBrush.Dispose()
  }

  # Gloss edge
  $edgePath = New-RoundedRectPath -X 76 -Y 76 -W 872 -H 872 -R 205
  $edgePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 255, 255, 255), 2)
  try {
    $g.DrawPath($edgePen, $edgePath)
  } finally {
    $edgePen.Dispose()
    $edgePath.Dispose()
  }

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
