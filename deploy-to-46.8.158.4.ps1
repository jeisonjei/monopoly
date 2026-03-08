Param(
  [string]$RemoteHostIp = '46.8.158.4',
  [string]$SshUser = 'root',
  [string]$RemoteDir = '/root/tomat-sapr',
  [string]$ComposeProjectDir = 'ng-tomat-sapr',
  [int]$DockerPort = 8083,
  [string]$SshKeyPath = "$env:USERPROFILE/.ssh/id_ed25519",
  [switch]$PasswordOnly
)

$ErrorActionPreference = 'Stop'

function Exec([string]$cmd) {
  Write-Host "`n> $cmd" -ForegroundColor Cyan
  & powershell -NoProfile -Command $cmd
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE"
  }
}

function TryExec([string]$cmd) {
  try {
    Write-Host "`n> $cmd" -ForegroundColor DarkCyan
    & powershell -NoProfile -Command $cmd
    return $LASTEXITCODE
  } catch {
    return 1
  }
}

function ExecRetry([string]$cmd, [int]$retries = 5, [int]$delaySeconds = 6) {
  for ($i = 1; $i -le $retries; $i++) {
    try {
      Exec $cmd
      return
    } catch {
      if ($i -ge $retries) {
        throw
      }
      Write-Host "Retry $i/$retries failed. Waiting ${delaySeconds}s..." -ForegroundColor Yellow
      Start-Sleep -Seconds $delaySeconds
    }
  }
}

function ExecRetryAction([scriptblock]$action, [int]$retries = 5, [int]$delaySeconds = 6) {
  for ($i = 1; $i -le $retries; $i++) {
    try {
      & $action
      return
    } catch {
      Write-Host "Attempt failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
      if ($i -ge $retries) {
        throw
      }
      Write-Host "Retry $i/$retries failed. Waiting ${delaySeconds}s..." -ForegroundColor Yellow
      Start-Sleep -Seconds $delaySeconds
    }
  }
}

function InvokeSshCapture([string]$sshOptions, [string]$remote, [string]$remoteCommand) {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'ssh'
  $escaped = $remoteCommand.Replace('"', '\"')
  $psi.Arguments = "$sshOptions $remote `"$escaped`""
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true

  $p = [System.Diagnostics.Process]::new()
  $p.StartInfo = $psi
  [void]$p.Start()

  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()

  if ($p.ExitCode -ne 0) {
    $msg = "ssh failed with exit code $($p.ExitCode)."
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
      $msg = "$msg $stderr"
    }
    throw $msg
  }

  return $stdout.Trim()
}

function UploadFileOverSsh([string]$sshOptions, [string]$remote, [string]$remoteCommand, [string]$localFilePath) {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'ssh'
  $escaped = $remoteCommand.Replace('"', '\"')
  $psi.Arguments = "$sshOptions $remote `"$escaped`""
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true

  $p = [System.Diagnostics.Process]::new()
  $p.StartInfo = $psi
  [void]$p.Start()

  $stderrTask = $p.StandardError.ReadToEndAsync()

  try {
    $fileStream = [System.IO.File]::OpenRead($localFilePath)
    try {
      $buffer = [byte[]]::new(1024 * 1024)
      while (($read = $fileStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
        if ($p.HasExited) {
          $stderr = $stderrTask.GetAwaiter().GetResult()
          $msg = "ssh upload process exited early with exit code $($p.ExitCode)."
          if (-not [string]::IsNullOrWhiteSpace($stderr)) {
            $msg = "$msg $stderr"
          }
          throw $msg
        }

        $p.StandardInput.BaseStream.Write($buffer, 0, $read)
      }
    } finally {
      $fileStream.Dispose()
    }

    $p.StandardInput.Close()
  } catch {
    try { $p.Kill() } catch { }
    $stderr = $null
    try { $stderr = $stderrTask.GetAwaiter().GetResult() } catch { }
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
      throw "Upload interrupted. $($_.Exception.Message) $stderr"
    }
    throw
  }

  $stderr = $stderrTask.GetAwaiter().GetResult()
  $p.WaitForExit()

  if ($p.ExitCode -ne 0) {
    $msg = "ssh upload failed with exit code $($p.ExitCode)."
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
      $msg = "$msg $stderr"
    }
    throw $msg
  }
}

function VerifyTcp([string]$targetHost, [int]$targetPort) {
  Write-Host "`nVerifying TCP connectivity to ${targetHost}:${targetPort} ..." -ForegroundColor Cyan
  $result = Test-NetConnection -ComputerName $targetHost -Port $targetPort -WarningAction SilentlyContinue
  if (-not $result.TcpTestSucceeded) {
    throw "Cannot reach ${targetHost}:${targetPort} (TCP test failed)."
  }

  Write-Host "TCP OK. RemoteAddress=$($result.RemoteAddress) InterfaceAlias=$($result.InterfaceAlias)" -ForegroundColor Green
}

function CanSsh([string]$sshOptions, [string]$remote) {
  try {
    [void](InvokeSshCapture -sshOptions $sshOptions -remote $remote -remoteCommand "echo ok")
    return $true
  } catch {
    return $false
  }
}

function BuildSshOptions([switch]$PasswordOnly) {
  $common = "-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o ConnectionAttempts=3 -o ServerAliveInterval=15 -o ServerAliveCountMax=4"

  if ($PasswordOnly) {
    return "-o PreferredAuthentications=password -o PubkeyAuthentication=no $common"
  }

  if (-not (Test-Path $SshKeyPath)) {
    throw "SSH key not found at '$SshKeyPath'. Either place the key there or run with -PasswordOnly."
  }

  return "-i `"$SshKeyPath`" -o IdentitiesOnly=yes $common"
}

$localProjectPath = Split-Path -Parent $PSScriptRoot
$remoteProjectPath = "$RemoteDir/$ComposeProjectDir"
$remote = "$SshUser@$RemoteHostIp"
$sshOptions = BuildSshOptions -PasswordOnly:$PasswordOnly

Write-Host "Local project:  $localProjectPath"
Write-Host "Remote project: $remoteProjectPath"

VerifyTcp -targetHost $RemoteHostIp -targetPort 22

# Verify we can complete an SSH handshake + auth BEFORE building/uploading
# Note: password auth cannot be made fully non-interactive; we just verify handshake by running a cheap command.
Write-Host "`nVerifying SSH connectivity..." -ForegroundColor Cyan
ExecRetryAction { 
  $out = InvokeSshCapture -sshOptions $sshOptions -remote $remote -remoteCommand "echo ok"
  Write-Host "SSH OK. Response: $out" -ForegroundColor Green
} 5 6

Exec "yarn --cwd `"$localProjectPath`" install"
Exec "yarn --cwd `"$localProjectPath`" build:prod"

$archiveName = "tomat-sapr-deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss').tar.gz"
$archivePath = Join-Path $env:TEMP $archiveName

if (Test-Path $archivePath) {
  Remove-Item -Force $archivePath
}

Exec "tar -czf `"$archivePath`" --exclude=server/__pycache__ --exclude=server/.venv --exclude=server/venv --exclude=server/.pytest_cache -C `"$localProjectPath`" docker-compose.yml nginx dist server observability"


if ($PasswordOnly) {
  throw "PasswordOnly mode is not supported for upload because SSH needs stdin for the file stream. Use key auth (default) or use scp manually."
}

# Upload archive over SSH (no scp/sftp). Retries are safe because it overwrites the remote file.
ExecRetryAction {
  $remoteTmpName = "$archiveName.part-$PID"
  try {
    UploadFileOverSsh -sshOptions $sshOptions -remote $remote -remoteCommand "set -e; mkdir -p $remoteProjectPath; cat > $remoteProjectPath/$remoteTmpName" -localFilePath $archivePath
    Exec "ssh $sshOptions $remote 'set -e; mv -f $remoteProjectPath/$remoteTmpName $remoteProjectPath/$archiveName'"
  } catch {
    # Best-effort cleanup. If SSH is down, don't mask the original error.
    if (CanSsh -sshOptions $sshOptions -remote $remote) {
      [void](TryExec "ssh $sshOptions $remote 'rm -f $remoteProjectPath/$remoteTmpName'")
    } else {
      Write-Host "Skipping remote cleanup because SSH is not reachable right now (handshake/auth failed)." -ForegroundColor DarkYellow
    }
    throw
  }
  Write-Host "Upload OK: $archiveName" -ForegroundColor Green
} 5 6

# Extract + start/update containers
# Pre-clean: if any bind-mounted config file paths accidentally became directories on the remote host,
# tar extraction and/or docker bind mounts will fail. Remove only when the path is a directory.
$remoteDeployCmd = (
  "set -e",
  "cd $remoteProjectPath",
  "if [ -d observability/promtail/config.yml ]; then rm -rf observability/promtail/config.yml; fi",
  "if [ -d observability/loki/config.yml ]; then rm -rf observability/loki/config.yml; fi",
  "tar -xzf $archiveName",
  "rm -f $archiveName",
  "test -f observability/promtail/config.yml || (echo `"Missing file: $remoteProjectPath/observability/promtail/config.yml`" >&2; exit 12)",
  "test -f observability/loki/config.yml || (echo `"Missing file: $remoteProjectPath/observability/loki/config.yml`" >&2; exit 12)",
  "docker compose down",
  "docker compose up -d --build"
) -join '; '
ExecRetry "ssh $sshOptions $remote '$remoteDeployCmd'" 5 6

Remove-Item -Force $archivePath

Write-Host "`nDeployed. If host nginx proxies to http://127.0.0.1:$DockerPort, the site should be available." -ForegroundColor Green
