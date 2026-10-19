# Regenerates the raster favicon assets in public/ from the brand mark:
# a rounded square in the app's primary blue with bold "PA" text.
# Usage: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/generate-icons.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'public'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$blue = [System.Drawing.Color]::FromArgb(0x00, 0x3d, 0x5b)
$offWhite = [System.Drawing.Color]::FromArgb(0xf7, 0xf9, 0xfa)

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-Icon([int]$size, [string]$file, [double]$radiusRatio, [double]$fontRatio, [double]$yShiftRatio) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $bg = New-Object System.Drawing.SolidBrush($blue)
  if ($radiusRatio -gt 0) {
    $path = New-RoundedRectPath 0 0 $size $size ([float]($size * $radiusRatio))
    $g.FillPath($bg, $path)
    $path.Dispose()
  } else {
    $g.FillRectangle($bg, 0, 0, $size, $size)
  }
  $bg.Dispose()

  $fg = New-Object System.Drawing.SolidBrush($offWhite)
  $em = [float]($size * $fontRatio)
  $font = New-Object System.Drawing.Font(
    'Segoe UI', $em, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(0, ([float]($size * $yShiftRatio)), $size, $size)
  $g.DrawString('PA', $font, $fg, $rect, $fmt)

  $bmp.Save((Join-Path $outDir $file), [System.Drawing.Imaging.ImageFormat]::Png)

  $font.Dispose()
  $fg.Dispose()
  $fmt.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

# Tab/bookmark fallback icon: rounded square with transparency, like the sidebar brand mark.
New-Icon 32 'favicon-32.png' 0.22 0.44 0.02
# iOS home-screen icon: full-bleed square; iOS applies its own corner mask.
New-Icon 180 'apple-touch-icon.png' 0.0 0.4 0.02
# Installed-app icons from the web manifest, drawn as-is on desktops and app launchers.
New-Icon 192 'icon-192.png' 0.22 0.4 0.02
New-Icon 512 'icon-512.png' 0.22 0.4 0.02
# Android masks this one to its own shape, so the text stays inside the central safe zone.
New-Icon 512 'icon-maskable-512.png' 0.0 0.28 0.015

Write-Output "Icons written to $outDir"
