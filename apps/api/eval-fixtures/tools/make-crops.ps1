# eval-fixtures — 全卓画像から各方向の河 crops を再生成するスクリプト（切り出し座標の記録）。
# crops/*.png はコミット済みなので通常は実行不要。source.png を差し替えたときだけ使う。
# 回転は「牌の文字が正立する向き」= bottom:なし / top:180° / left:反時計90° / right:時計90°。
# ※ river-layout.ts の [未確定]（left/right の回転方向）とは逆だった点に注意（README 参照）。
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$cases = Split-Path $PSScriptRoot -Parent | Join-Path -ChildPath 'cases'

function Crop($srcCase, $dst, $x, $y, $w, $h, $rot) {
  $img = [System.Drawing.Bitmap]::FromFile((Join-Path $cases "$srcCase\source.png"))
  try {
    $c = $img.Clone((New-Object System.Drawing.Rectangle($x, $y, $w, $h)), $img.PixelFormat)
    if ($rot -ne 'none') { $c.RotateFlip([System.Drawing.RotateFlipType]::$rot) }
    $out = Join-Path $cases "$srcCase\crops\$dst.png"
    New-Item -ItemType Directory -Force (Split-Path $out -Parent) | Out-Null
    $c.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $c.Dispose()
    "saved $srcCase/crops/$dst.png"
  } finally { $img.Dispose() }
}

# 01: オンライン麻雀スクショ（506x453）
Crop '01-table-marujan' 'bottom' 213 300 195 153 'none'
Crop '01-table-marujan' 'top' 163 0 227 150 'Rotate180FlipNone'
Crop '01-table-marujan' 'left' 108 138 104 232 'Rotate270FlipNone'
Crop '01-table-marujan' 'right' 362 60 140 242 'Rotate90FlipNone'

# 02: ABEMA 中継スクショ（1015x953）
Crop '02-table-abema' 'bottom' 430 580 195 155 'none'
Crop '02-table-abema' 'top' 395 232 265 188 'Rotate180FlipNone'
Crop '02-table-abema' 'left' 288 398 138 200 'Rotate270FlipNone'
Crop '02-table-abema' 'right' 620 388 152 205 'Rotate90FlipNone'
