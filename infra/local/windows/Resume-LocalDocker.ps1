[CmdletBinding()]
param([switch]$Install, [switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$taskName = 'GauchaGestaoDockerResume'
$directory = Join-Path $env:LOCALAPPDATA 'GauchaGestao'
$startup = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup 'Gaucha Gestao - Docker Resume.lnk'
$sessionId = (Get-Process -Id $PID).SessionId
$services = @('db', 'auth', 'rest', 'storage', 'imgproxy', 'kong', 'pg-meta', 'studio')

function Stop-InstalledWatcher {
    if (Test-Path -LiteralPath $shortcutPath) {
        Remove-Item -LiteralPath $shortcutPath
    }
    $installed = Join-Path $directory 'Resume-LocalDocker.ps1'
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' AND SessionId = $sessionId" |
        Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match ('(?i) -File "' + [regex]::Escape($installed) + '"$') } |
        ForEach-Object {
            $process = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
            if ($process) {
                Stop-Process -InputObject $process
                $process.WaitForExit()
            }
        }
}

function Install-ResumeWatcher {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $installed = Join-Path $directory 'Resume-LocalDocker.ps1'
    $launcher = Join-Path $directory 'Resume-LocalDocker.vbs'
    Copy-Item -LiteralPath $PSCommandPath -Destination $installed -Force
    @'
On Error Resume Next
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
script = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), "Resume-LocalDocker.ps1")
powershell = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
shell.Run """" & powershell & """ -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & script & """", 0, False
'@ | Set-Content -LiteralPath $launcher -Encoding ASCII

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
    $shortcut.Arguments = '//B //NoLogo "' + $launcher + '"'
    $shortcut.WorkingDirectory = $directory
    $shortcut.Save()
    $shell.Run('"' + $shortcut.TargetPath + '" ' + $shortcut.Arguments, 0, $false) | Out-Null
}

function Invoke-DesktopDocker {
    # A named pipe fixa o Engine Linux local mesmo com outro contexto ativo.
    $command = @('--host', 'npipe:////./pipe/dockerDesktopLinuxEngine') + $args
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $docker
    $start.Arguments = ($command | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
    $start.WorkingDirectory = $env:LOCALAPPDATA
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($start)
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit(10000)) {
            $process.Kill()
            throw 'CLI do Docker Desktop excedeu o tempo de resposta.'
        }
        $script:dockerExit = $process.ExitCode
        if ($dockerExit -ne 0) {
            Write-Verbose ($stderr.Result.Trim())
            return
        }
        $stdout.Result.Trim() -split '\r?\n' | Where-Object { $_ }
    } finally {
        $process.Dispose()
    }
}

function Write-ResumeLog([string]$Message) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    Add-Content -LiteralPath (Join-Path $directory 'Resume-LocalDocker.log') `
        -Encoding UTF8 -Value ('{0:o} {1}' -f [DateTimeOffset]::Now, $Message)
}

function Test-MountError($Container, [string]$Destination) {
    return ($Container.State.Status -eq 'exited' -and $Container.State.ExitCode -eq 127 -and
        $Container.State.Error -match 'error mounting "[^"]*/wsl/docker-desktop-bind-mounts/[^"]+"' -and
        $Container.State.Error -match [regex]::Escape($Destination) -and
        $Container.State.Error -match 'not a directory')
}

function Start-ExistingContainer($Container) {
    # Usa o ID inspecionado para evitar atingir outro container que reutilize o nome.
    Invoke-DesktopDocker start $Container.Id | Out-Null
    Write-ResumeLog ("docker start {0}: codigo {1}" -f $Container.Service, $dockerExit)
}

if ($Install -or $Uninstall) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    Stop-InstalledWatcher
    if ($Install) { Install-ResumeWatcher }
    return
}

$docker = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
    (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (!$docker) { throw 'CLI do Docker Desktop nao encontrada.' }

function Invoke-RecoveryCheck {
    $project = 'gaucha-gestao-local'
    $names = $services | ForEach-Object { "$project-$_-1" }
    # Projeta somente estado e labels operacionais. Config.Env pode conter segredos.
    $format = '{"Id":{{json .Id}},"State":{"Status":{{json .State.Status}},"ExitCode":{{.State.ExitCode}},"Error":{{json .State.Error}},"Health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}},"Project":{{json (index .Config.Labels "com.docker.compose.project")}},"Service":{{json (index .Config.Labels "com.docker.compose.service")}}}'
    $lines = Invoke-DesktopDocker inspect --type container --format $format @names
    if ($dockerExit -ne 0 -or @($lines).Count -ne $services.Count) { return $false }

    $containers = @{}
    foreach ($line in $lines) {
        $container = ConvertFrom-Json $line
        $service = $container.Service
        if ($container.Project -ne $project -or $service -notin $services -or $containers.ContainsKey($service)) {
            return $false
        }
        $containers[$service] = $container
    }

    if (Test-MountError $containers.db '/docker-entrypoint-initdb.d/init-scripts/99-gg-roles.sql') {
        Start-ExistingContainer $containers.db
        return $false
    }
    if (Test-MountError $containers.kong '/gg/kong') {
        $unready = @('db', 'auth', 'rest', 'storage') | Where-Object {
            $state = $containers[$_].State
            $state.Status -ne 'running' -or $state.Health -ne 'healthy'
        }
        if (!$unready) { Start-ExistingContainer $containers.kong }
        return $false
    }

    # Uma parada normal encerra a verificacao sem iniciar o container.
    $pending = $containers.Values | Where-Object {
        $_.State.Status -eq 'restarting' -or ($_.State.Status -eq 'running' -and $_.State.Health -ne 'healthy')
    }
    return !$pending
}

function Get-BackendInstance {
    Get-Process -Name 'com.docker.backend' -ErrorAction SilentlyContinue |
        Where-Object SessionId -EQ $sessionId |
        Sort-Object StartTime | Select-Object -First 1
}

$logDirectory = Join-Path $env:LOCALAPPDATA 'Docker\log\host'
if (!(Test-Path -LiteralPath $logDirectory -PathType Container)) { return }

# A atividade do log acorda o processo. Somente uma nova instancia do backend
# abre uma janela de recuperacao; alteracoes normais do log nao acionam Docker.
$mutex = New-Object Threading.Mutex($false, 'Local\GauchaGestaoDockerResumeWatcher')
$watcher = New-Object IO.FileSystemWatcher($logDirectory, 'com.docker.backend.exe.log*')
$watcher.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite'
$acquired = $false
try {
    try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (!$acquired) { return }
    foreach ($name in @('Changed', 'Created', 'Renamed', 'Error')) {
        Register-ObjectEvent $watcher $name -SourceIdentifier "DockerResume-$name" | Out-Null
    }
    $watcher.EnableRaisingEvents = $true
    $lastBackend = ''
    Write-ResumeLog 'Monitor ativo.'
    while ($true) {
        $backend = Get-BackendInstance
        if ($backend) {
            $instance = '{0}:{1}' -f $backend.Id, $backend.StartTime.Ticks
            if ($instance -ne $lastBackend) {
                $lastBackend = $instance
                Write-ResumeLog 'Backend detectado. Verificando o DEV local.'
                $deadline = [DateTime]::UtcNow.AddMinutes(4)
                while (!$backend.HasExited -and [DateTime]::UtcNow -lt $deadline) {
                    try {
                        if (Invoke-RecoveryCheck) {
                            Write-ResumeLog 'Verificacao concluida.'
                            break
                        }
                    } catch {
                        Write-ResumeLog 'CLI indisponivel durante a verificacao.'
                    }
                    Start-Sleep -Seconds 5
                }
                if ([DateTime]::UtcNow -ge $deadline) { Write-ResumeLog 'Prazo de recuperacao encerrado.' }
            }
        }
        Wait-Event | Out-Null
        Get-Event | Where-Object SourceIdentifier -Like 'DockerResume-*' | Remove-Event
    }
} finally {
    Get-EventSubscriber | Where-Object SourceIdentifier -Like 'DockerResume-*' | Unregister-Event
    $watcher.Dispose()
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
