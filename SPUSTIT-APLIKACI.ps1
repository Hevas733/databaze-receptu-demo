$ErrorActionPreference='Stop'
$python=Get-Command python -ErrorAction SilentlyContinue
if($python){$runtime=$python.Source}else{$runtime=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'}
if(-not(Test-Path -LiteralPath $runtime)){throw 'Nainstalujte Python 3.10 nebo novější.'}
Start-Process -FilePath $runtime -ArgumentList @('"'+(Join-Path $PSScriptRoot 'disk-storage-server.py')+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
Start-Process 'http://127.0.0.1:8000/index.html?v=59'
