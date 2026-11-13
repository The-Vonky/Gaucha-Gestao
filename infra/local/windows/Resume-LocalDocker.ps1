[CmdletBinding()]
param([switch]$Install, [switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$taskName = 'GauchaGestaoDockerResume'
$directory = Join-Path $env:LOCALAPPDATA 'GauchaGestao'
$startup = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup 'Gaucha Gestao - Docker Resume.lnk'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
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

function Install-ResumeTask {
    # O Agendador guarda o script para dispensar leitura do checkout WSL e dos arquivos EFS no logon.
    $source = Get-Content -LiteralPath $PSCommandPath -Raw
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($source))
    $arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand $encoded"
    if ($arguments.Length -gt 32000) { throw 'Script excede o limite de argumentos da tarefa.' }

    $action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') `
        -WorkingDirectory $PSHOME -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.User.Value
    $principal = New-ScheduledTaskPrincipal -UserId $identity.User.Value -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    if ((Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue).State -eq 'Running') {
        Stop-ScheduledTask -TaskName $taskName
    }
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force | Out-Null
    Stop-InstalledWatcher
    Start-ScheduledTask -TaskName $taskName
    Write-Output ("Tarefa {0} iniciada para {1}. Log: {2}" -f $taskName, $identity.Name,
        (Join-Path $directory 'Resume-LocalDocker.log'))
}

function Invoke-LocalProcess([string]$Executable, [string]$CommandLine, [int]$TimeoutMs) {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $Executable
    $start.Arguments = $CommandLine
    $start.WorkingDirectory = $env:LOCALAPPDATA
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($start)
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit($TimeoutMs)) {
            if (!$process.HasExited) { $process.Kill() }
            throw ("{0} excedeu o tempo de resposta." -f [IO.Path]::GetFileName($Executable))
        }
        $null = $stderr.Result
        return @{ ExitCode = $process.ExitCode; Output = $stdout.Result }
    } finally {
        $process.Dispose()
    }
}

function Invoke-DesktopDocker {
    # A named pipe fixa o Engine Linux local mesmo com outro contexto ativo.
    $arguments = @('--host', 'npipe:////./pipe/dockerDesktopLinuxEngine') + $args
    $commandLine = ($arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
    $result = Invoke-LocalProcess $docker $commandLine 10000
    $script:dockerExit = $result.ExitCode
    if ($dockerExit -eq 0) {
        $result.Output.Trim() -split '\r?\n' | Where-Object { $_ }
    }
}

function Start-MountDistribution {
    # Inicia o Ubuntu usado pelos bind mounts, sem abrir um terminal ou depender do distro padrao.
    $wsl = Join-Path $env:WINDIR 'System32\wsl.exe'
    $result = Invoke-LocalProcess $wsl '--distribution Ubuntu --cd / --exec /bin/true' 30000
    Write-ResumeLog ("WSL Ubuntu: codigo {0}" -f $result.ExitCode)
    return ($result.ExitCode -eq 0)
}

function Write-ResumeLog([string]$Message) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    Add-Content -LiteralPath (Join-Path $directory 'Resume-LocalDocker.log') `
        -Encoding UTF8 -Value ('{0:o} {1}' -f [DateTimeOffset]::Now, $Message)
}

function Test-MountError($Container, [string]$Destination) {
    return ($Container.State.Status -eq 'exited' -and $Container.State.ExitCode -eq 127 -and
        $Container.State.Error -match 'error mounting "[^"]*/wsl/docker-desktop-bind-mounts/Ubuntu/[^"]+"' -and
        $Container.State.Error -match ('to rootfs at "' + [regex]::Escape($Destination) + '"') -and
        $Container.State.Error -match 'not a directory')
}

function Start-ExistingContainer($Container) {
    # Usa o ID inspecionado para evitar atingir outro container que reutilize o nome.
    Invoke-DesktopDocker start $Container.Id | Out-Null
    Write-ResumeLog ("docker start {0}: codigo {1}" -f $Container.Service, $dockerExit)
}

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
        if (Start-MountDistribution) { Start-ExistingContainer $containers.db }
        return $false
    }
    if ((Test-MountError $containers.kong '/gg/kong-entrypoint.sh') -or
        (Test-MountError $containers.kong '/gg/kong.yml')) {
        $unready = @('db', 'auth', 'rest', 'storage') | Where-Object {
            $state = $containers[$_].State
            $state.Status -ne 'running' -or $state.Health -ne 'healthy'
        }
        if (!$unready -and (Start-MountDistribution)) { Start-ExistingContainer $containers.kong }
        return $false
    }

    # Uma parada normal encerra a verificacao sem iniciar o container.
    $pending = $containers.Values | Where-Object {
        $_.State.Status -eq 'restarting' -or ($_.State.Status -eq 'running' -and $_.State.Health -ne 'healthy')
    }
    if ($pending) { return $false }
    if ($containers.Values | Where-Object { $_.State.Status -ne 'running' }) {
        Write-ResumeLog 'Verificacao concluida com containers parados sem a assinatura de recuperacao.'
    } else {
        Write-ResumeLog 'Verificacao concluida: oito containers healthy.'
    }
    return $true
}

function Get-BackendInstance {
    Get-Process -Name 'com.docker.backend' -ErrorAction SilentlyContinue |
        Where-Object SessionId -EQ $sessionId |
        Sort-Object StartTime | Select-Object -First 1
}

function Watch-DesktopBackend {
    $lastBackend = ''
    while ($true) {
        $backend = Get-BackendInstance
        if ($backend) {
            $instance = '{0}:{1}' -f $backend.Id, $backend.StartTime.Ticks
            if ($instance -ne $lastBackend) {
                $lastBackend = $instance
                Write-ResumeLog ("Backend PID {0} detectado. Verificando o DEV local." -f $backend.Id)
                $deadline = [DateTime]::UtcNow.AddMinutes(4)
                while (!$backend.HasExited -and [DateTime]::UtcNow -lt $deadline) {
                    try {
                        if (Invoke-RecoveryCheck) { break }
                    } catch {
                        Write-ResumeLog ("Falha durante a verificacao ({0})." -f $_.Exception.GetType().Name)
                    }
                    Start-Sleep -Seconds 5
                }
                if ([DateTime]::UtcNow -ge $deadline) { Write-ResumeLog 'Prazo de recuperacao encerrado.' }
            }
        }
        # Entre janelas, consulta somente o processo do Windows, independentemente dos logs do Desktop.
        Start-Sleep -Seconds 5
    }
}

if ($Install) {
    Install-ResumeTask
    return
}
if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $taskName
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    Stop-InstalledWatcher
    return
}

Write-ResumeLog ("Monitor ativo. Perfil Windows: {0}. Sessao: {1}. PID: {2}." -f $identity.Name, $sessionId, $PID)
try {
    $docker = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if (!$docker) { throw 'CLI do Docker Desktop nao encontrada.' }

    Watch-DesktopBackend
} catch {
    Write-ResumeLog ("Monitor encerrado: {0}" -f $_.Exception.Message)
    throw
}
