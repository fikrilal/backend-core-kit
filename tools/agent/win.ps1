<#
Agent-only: invoked by `tools/agent/win` (bash) to run Windows commands from a WSL agent context.

Contract:
- Sets working directory to repo root (Windows path)
- Executes the provided command with arguments
- Exits with the child process exit code
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($args.Count -lt 1) {
  Write-Error 'Usage: win.ps1 <command> [args...]'
  exit 2
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

$command = $args[0]
$commandArgs = @()
if ($args.Count -gt 1) {
  $commandArgs = $args[1..($args.Count - 1)]
}

& $command @commandArgs
exit $LASTEXITCODE
