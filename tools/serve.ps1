# Local preview server for the site. No Python or Node needed — just
# PowerShell, which every Windows machine has.
#
#   powershell -ExecutionPolicy Bypass -File tools/serve.ps1
#
# then open http://localhost:8765/. Serves the repo root as-is, so the
# absolute /assets/... paths resolve the same way they do in production,
# and "/side-quests/couch-quest" finds couch-quest.html like the live host.

param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [int]$Port = 8765
)

$types = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"; ".json" = "application/json"
  ".svg"  = "image/svg+xml"; ".png" = "image/png"; ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"; ".gif" = "image/gif"; ".webp" = "image/webp"
  ".ico"  = "image/x-icon"; ".woff2" = "font/woff2"
}

$rootFull = [IO.Path]::GetFullPath($Root)
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $rootFull on http://localhost:$Port/"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $rel  = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    $file = [IO.Path]::GetFullPath((Join-Path $rootFull $rel))

    # never serve anything outside the repo
    if (-not $file.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
      $ctx.Response.StatusCode = 403
    } else {
      if (Test-Path $file -PathType Container) { $file = Join-Path $file "index.html" }
      if (-not (Test-Path $file -PathType Leaf) -and (Test-Path "$file.html" -PathType Leaf)) { $file = "$file.html" }

      if (Test-Path $file -PathType Leaf) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $type  = $types[[IO.Path]::GetExtension($file).ToLower()]
        if ($type) { $ctx.Response.ContentType = $type }
        $ctx.Response.Headers.Add("Cache-Control", "no-store")
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $ctx.Response.StatusCode = 404
      }
    }
    Write-Host "$($ctx.Response.StatusCode) $($ctx.Request.Url.AbsolutePath)"
  } catch {
    Write-Host "error: $_"
  } finally {
    $ctx.Response.Close()
  }
}
