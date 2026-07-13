[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root

function Invoke-Pnpm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    & pnpm @Arguments
  } elseif (Get-Command corepack -ErrorAction SilentlyContinue) {
    & corepack pnpm @Arguments
  } else {
    throw 'pnpm/Corepack is unavailable. Install Node.js 20.19 or newer, then run this launcher again.'
  }
  if ($LASTEXITCODE -ne 0) { throw "pnpm failed with exit code $LASTEXITCODE" }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js 20.19 or newer is required: https://nodejs.org/'
}

$NodeVersionOk = node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=19)?0:1)"
if ($LASTEXITCODE -ne 0) { throw 'Node.js 20.19 or newer is required.' }

if (-not (Test-Path -LiteralPath '.env')) {
  Copy-Item -LiteralPath '.env.example' -Destination '.env'
  $SecureKey = Read-Host 'Optional OpenAI API key (press Enter for deterministic no-key mode)' -AsSecureString
  $Key = [System.Net.NetworkCredential]::new('', $SecureKey).Password
  if ($Key) {
    $Lines = Get-Content -LiteralPath '.env'
    $Lines = $Lines | ForEach-Object {
      if ($_ -match '^AI_PROVIDER=') { 'AI_PROVIDER=openai' }
      elseif ($_ -match '^#?OPENAI_API_KEY=') { "OPENAI_API_KEY=$Key" }
      else { $_ }
    }
    if (-not ($Lines -match '^OPENAI_API_KEY=')) { $Lines += "OPENAI_API_KEY=$Key" }
    Set-Content -LiteralPath '.env' -Value $Lines -Encoding utf8
    $Key = $null
  }
}

Write-Host 'Installing verified dependencies...'
Invoke-Pnpm install --frozen-lockfile
Write-Host 'Installing the local Chromium runtime...'
Invoke-Pnpm exec playwright install chromium
Write-Host 'Starting PREMORTEM...'
Invoke-Pnpm start:local
