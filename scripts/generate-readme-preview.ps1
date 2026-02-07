param(
  [string]$OutputPath = "docs/images/simplestats-preview.png"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $diameter = [Math]::Max(1, $Radius * 2)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-Tile {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [string]$Label,
    [string]$Value,
    [string]$AccentHex,
    [int[]]$Graph
  )

  $tileBg = [System.Drawing.ColorTranslator]::FromHtml("#0E131A")
  $labelColor = [System.Drawing.ColorTranslator]::FromHtml("#98A6B7")
  $valueColor = [System.Drawing.Color]::White
  $accent = [System.Drawing.ColorTranslator]::FromHtml($AccentHex)

  $path = New-RoundedRectanglePath -X $X -Y $Y -Width $Width -Height $Height -Radius 20
  $Graphics.FillPath((New-Object System.Drawing.SolidBrush($tileBg)), $path)
  $Graphics.DrawPath((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(50, $accent), 2)), $path)

  $labelFont = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
  $valueFont = New-Object System.Drawing.Font("Segoe UI", 32, [System.Drawing.FontStyle]::Bold)
  $Graphics.DrawString($Label, $labelFont, (New-Object System.Drawing.SolidBrush($labelColor)), ($X + 18), ($Y + 18))
  $Graphics.DrawString($Value, $valueFont, (New-Object System.Drawing.SolidBrush($valueColor)), ($X + 18), ($Y + 62))

  $graphLeft = $X + 18
  $graphTop = $Y + $Height - 60
  $graphWidth = $Width - 36
  $graphHeight = 36
  $count = [Math]::Max(2, $Graph.Count)
  $step = $graphWidth / ($count - 1)
  $maxVal = [double]([Math]::Max(1, ($Graph | Measure-Object -Maximum).Maximum))

  $points = New-Object System.Collections.Generic.List[System.Drawing.PointF]
  for ($i = 0; $i -lt $count; $i++) {
    $value = [double]$Graph[$i]
    $px = $graphLeft + ($step * $i)
    $py = $graphTop + $graphHeight - (($value / $maxVal) * $graphHeight)
    $points.Add((New-Object System.Drawing.PointF([float]$px, [float]$py)))
  }

  $gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(35, 255, 255, 255), 1)
  $Graphics.DrawLine($gridPen, $graphLeft, ($graphTop + $graphHeight), ($graphLeft + $graphWidth), ($graphTop + $graphHeight))
  $linePen = New-Object System.Drawing.Pen($accent, 2.2)
  if ($points.Count -ge 2) {
    $Graphics.DrawLines($linePen, $points.ToArray())
  }

  $path.Dispose()
  $labelFont.Dispose()
  $valueFont.Dispose()
  $gridPen.Dispose()
  $linePen.Dispose()
}

$width = 1600
$height = 900
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$bgRect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
$bgTop = [System.Drawing.ColorTranslator]::FromHtml("#0A1018")
$bgBottom = [System.Drawing.ColorTranslator]::FromHtml("#06080D")
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, $bgTop, $bgBottom, 90)
$graphics.FillRectangle($bgBrush, $bgRect)

$titleFont = New-Object System.Drawing.Font("Segoe UI", 52, [System.Drawing.FontStyle]::Bold)
$subtitleFont = New-Object System.Drawing.Font("Segoe UI", 20, [System.Drawing.FontStyle]::Regular)
$mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#9FB0C5"))
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$graphics.DrawString("SimpleStats", $titleFont, $whiteBrush, 120, 56)
$graphics.DrawString("Live Stream Deck system-monitor tiles for Windows", $subtitleFont, $mutedBrush, 124, 128)

$panelPath = New-RoundedRectanglePath -X 100 -Y 190 -Width 1400 -Height 640 -Radius 28
$panelFill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 11, 16, 24))
$panelStroke = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 160, 180, 220), 2)
$graphics.FillPath($panelFill, $panelPath)
$graphics.DrawPath($panelStroke, $panelPath)

$tiles = @(
  @{ Label = "CPU TOTAL"; Value = "34%"; Accent = "#27D4FF"; Graph = @(22, 25, 31, 45, 39, 34, 30, 34) },
  @{ Label = "GPU"; Value = "58%"; Accent = "#A06CFF"; Graph = @(20, 24, 30, 43, 56, 61, 55, 58) },
  @{ Label = "MEM"; Value = "67%"; Accent = "#2A6DFF"; Graph = @(63, 64, 65, 66, 66, 67, 67, 67) },
  @{ Label = "C: ACTIVE %"; Value = "12%"; Accent = "#4CFF8A"; Graph = @(5, 8, 12, 19, 15, 9, 11, 12) },
  @{ Label = "NET DOWN"; Value = "96Mbps"; Accent = "#FF6FB1"; Graph = @(22, 35, 56, 81, 77, 92, 88, 96) },
  @{ Label = "CPU PEAK"; Value = "71%"; Accent = "#27D4FF"; Graph = @(41, 47, 53, 66, 69, 72, 67, 71) },
  @{ Label = "VRAM"; Value = "5.8GB"; Accent = "#A06CFF"; Graph = @(38, 42, 45, 48, 51, 55, 57, 58) },
  @{ Label = "TOP CPU"; Value = "37%"; Accent = "#27D4FF"; Graph = @(18, 21, 25, 30, 33, 37, 34, 37) },
  @{ Label = "C: % USED"; Value = "62%"; Accent = "#4CFF8A"; Graph = @(61, 61, 62, 62, 62, 62, 62, 62) },
  @{ Label = "NET 1H"; Value = "11.2G"; Accent = "#FF6FB1"; Graph = @(12, 17, 23, 30, 38, 45, 52, 58) },
  @{ Label = "GPU TEMP"; Value = "64C"; Accent = "#A06CFF"; Graph = @(53, 54, 56, 59, 62, 63, 64, 64) },
  @{ Label = "TOP MEM"; Value = "1.6G"; Accent = "#2A6DFF"; Graph = @(9, 11, 13, 15, 16, 17, 16, 16) },
  @{ Label = "D: READ"; Value = "178MB/s"; Accent = "#4CFF8A"; Graph = @(66, 45, 91, 37, 122, 84, 160, 130) },
  @{ Label = "NET UP"; Value = "28Mbps"; Accent = "#FF6FB1"; Graph = @(6, 11, 13, 19, 17, 24, 21, 28) },
  @{ Label = "TIME"; Value = "14:32:09"; Accent = "#FFD166"; Graph = @(50, 50, 50, 50, 50, 50, 50, 50) }
)

$cols = 5
$tileWidth = 250
$tileHeight = 182
$gap = 20
$startX = 122
$startY = 212

for ($i = 0; $i -lt $tiles.Count; $i++) {
  $col = $i % $cols
  $row = [Math]::Floor($i / $cols)
  $x = $startX + (($tileWidth + $gap) * $col)
  $y = $startY + (($tileHeight + $gap) * $row)
  $tile = $tiles[$i]
  Draw-Tile -Graphics $graphics -X $x -Y $y -Width $tileWidth -Height $tileHeight -Label $tile.Label -Value $tile.Value -AccentHex $tile.Accent -Graph $tile.Graph
}

$footerFont = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Regular)
$graphics.DrawString("Sample multi-key layout preview", $footerFont, $mutedBrush, 122, 848)

$outDir = Split-Path -Parent $OutputPath
if ($outDir) {
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}
$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$footerFont.Dispose()
$titleFont.Dispose()
$subtitleFont.Dispose()
$mutedBrush.Dispose()
$whiteBrush.Dispose()
$panelPath.Dispose()
$panelFill.Dispose()
$panelStroke.Dispose()
$bgBrush.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
