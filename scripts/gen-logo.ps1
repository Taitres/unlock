Add-Type -AssemblyName System.Drawing

$bmp = New-Object System.Drawing.Bitmap(256, 256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

# Background: rounded square, light gray
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 245, 245))
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 48
$rect = New-Object System.Drawing.Rectangle(4, 4, 248, 248)
$path.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
$path.AddArc($rect.Right - $r, $rect.Y, $r, $r, 270, 90)
$path.AddArc($rect.Right - $r, $rect.Bottom - $r, $r, $r, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $r, $r, $r, 90, 90)
$path.CloseFigure()
$g.FillPath($bgBrush, $path)

# Lock shackle (arc) - green
$shacklePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(66, 184, 131), 14)
$g.DrawArc($shacklePen, 92, 66, 72, 66, 180, 180)

# Lock body - rounded rectangle, green
$lockBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(66, 184, 131))
$lockPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$lr = 16
$lockRect = New-Object System.Drawing.Rectangle(78, 120, 100, 84)
$lockPath.AddArc($lockRect.X, $lockRect.Y, $lr, $lr, 180, 90)
$lockPath.AddArc($lockRect.Right - $lr, $lockRect.Y, $lr, $lr, 270, 90)
$lockPath.AddArc($lockRect.Right - $lr, $lockRect.Bottom - $lr, $lr, $lr, 0, 90)
$lockPath.AddArc($lockRect.X, $lockRect.Bottom - $lr, $lr, $lr, 90, 90)
$lockPath.CloseFigure()
$g.FillPath($lockBrush, $lockPath)

# Keyhole - dark gray circle + slot
$holeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(50, 50, 50))
$g.FillEllipse($holeBrush, 112, 142, 32, 32)
$g.FillRectangle($holeBrush, 122, 164, 12, 22)

# Lightning bolt shooting up from shackle - yellow
$boltBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 215, 0))
$boltPoints = @(
    (New-Object System.Drawing.Point(138, 10)),
    (New-Object System.Drawing.Point(158, 10)),
    (New-Object System.Drawing.Point(128, 55)),
    (New-Object System.Drawing.Point(150, 55)),
    (New-Object System.Drawing.Point(118, 100)),
    (New-Object System.Drawing.Point(130, 58)),
    (New-Object System.Drawing.Point(110, 58))
)
$g.FillPolygon($boltBrush, $boltPoints)

$g.Dispose()
$bmp.Save('c:\home\unlock-file\public\logo.png', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output 'logo generated successfully'
