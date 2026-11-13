[CmdletBinding()]
param([switch]$Install)

$ErrorActionPreference = 'Stop'
$taskName = 'GauchaGestaoDockerResume'
$directory = Join-Path $env:LOCALAPPDATA 'GauchaGestao'
$services = @('db', 'auth', 'rest', 'storage', 'imgproxy', 'kong', 'pg-meta', 'studio')

function Install-ResumeTask {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $installed = Join-Path $directory 'Resume-LocalDocker.ps1'
    if ($PSCommandPath -ne $installed) {
        Copy-Item -LiteralPath $PSCommandPath -Destination $installed -Force
    }
    $action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') `
        -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $installed + '"')
    $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes 1)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $logon = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
    $principal = New-ScheduledTaskPrincipal -UserId $identity.User.Value -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($repeat, $logon) `
        -Principal $principal -Settings $settings -Force | Out-Null
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
    Add-Content -LiteralPath (Join-Path $directory 'Resume-LocalDocker.log') `
        -Encoding UTF8 -Value ('{0:o} {1}' -f [DateTimeOffset]::Now, $Message)
}

function Start-AfterMountError($Container, [string]$Destination, [string]$Service) {
    if ($Container.State.Status -ne 'exited' -or $Container.State.ExitCode -ne 127 -or
        $Container.State.Error -notmatch 'error mounting "[^"]*/wsl/docker-desktop-bind-mounts/[^"]+"' -or
        $Container.State.Error -notmatch [regex]::Escape($Destination) -or
        $Container.State.Error -notmatch 'not a directory') {
        return
    }

    # Usa o ID inspecionado para evitar atingir outro container que reutilize o nome.
    Invoke-DesktopDocker start $Container.Id | Out-Null
    Write-ResumeLog ("docker start {0}: codigo {1}" -f $Service, $dockerExit)
    if ($dockerExit -ne 0) { throw "Falha ao iniciar $Service. O Agendador tentara novamente." }
}

if ($Install) {
    Install-ResumeTask
    return
}

if (!(Get-Process -Name 'com.docker.backend' -ErrorAction SilentlyContinue)) {
    Write-Verbose 'Backend do Docker Desktop ausente.'
    return
}
$docker = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
    (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (!$docker) { throw 'CLI do Docker Desktop nao encontrada.' }

$project = 'gaucha-gestao-local'
$names = $services | ForEach-Object { "$project-$_-1" }
# Projeta somente estado e labels operacionais. Config.Env pode conter segredos.
$format = '{"Id":{{json .Id}},"State":{"Status":{{json .State.Status}},"ExitCode":{{.State.ExitCode}},"Error":{{json .State.Error}},"Health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}},"Project":{{json (index .Config.Labels "com.docker.compose.project")}},"Service":{{json (index .Config.Labels "com.docker.compose.service")}}}'
$lines = Invoke-DesktopDocker inspect --type container --format $format @names
if ($dockerExit -ne 0 -or @($lines).Count -ne $services.Count) {
    Write-Verbose "Inventario indisponivel (docker exit: $dockerExit, linhas: $(@($lines).Count))."
    return
}

$containers = @{}
foreach ($line in $lines) {
    $container = ConvertFrom-Json $line
    $service = $container.Service
    if ($container.Project -ne $project -or $service -notin $services -or $containers.ContainsKey($service)) { return }
    $containers[$service] = $container
}
Write-Verbose "Inventario validado de $($containers.Count) containers em $project."

Start-AfterMountError $containers.db '/docker-entrypoint-initdb.d/init-scripts/99-gg-roles.sql' 'db'

foreach ($service in @('db', 'auth', 'rest', 'storage')) {
    $state = $containers[$service].State
    if ($state.Status -ne 'running' -or $state.Health -ne 'healthy') { return }
}
Start-AfterMountError $containers.kong '/gg/kong' 'kong'
