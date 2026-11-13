#requires -Version 5.1
# Exercita o script do checkout sem registrar tarefas nem acessar Docker/WSL.
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '../../infra/local/windows/Resume-LocalDocker.ps1'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors) { throw ($parseErrors -join "`n") }
$functions = $ast.EndBlock.Statements | Where-Object {
    $_ -is [Management.Automation.Language.FunctionDefinitionAst]
}
. ([scriptblock]::Create(($functions.Extent.Text -join "`n")))

$services = @('db', 'auth', 'rest', 'storage', 'imgproxy', 'kong', 'pg-meta', 'studio')
$dbMount = '/docker-entrypoint-initdb.d/init-scripts/99-gg-roles.sql'
$kongMount = '/gg/kong-entrypoint.sh'
$script:calls = [Collections.Generic.List[string]]::new()

function Write-ResumeLog([string]$Message) {}
function Invoke-LocalProcess($Executable, $CommandLine, $TimeoutMs) {
    if ([IO.Path]::GetFileName($Executable) -ne 'wsl.exe' -or
        $CommandLine -cne '--distribution Ubuntu --cd / --exec /bin/true') {
        throw 'Comando WSL inesperado.'
    }
    $script:calls.Add('wsl Ubuntu')
    @{ ExitCode = $script:wslExit; Output = '' }
}
function Invoke-DesktopDocker {
    $script:dockerExit = 0
    switch ($args[0]) {
        'inspect' {
            $script:dockerExit = $script:inspectExit
            $expected = $services | ForEach-Object { "gaucha-gestao-local-$_-1" }
            if (($args[5..12] -join ',') -cne ($expected -join ',')) { throw 'Inventario inesperado.' }
            $script:containers.Values | ForEach-Object { ConvertTo-Json -InputObject $_ -Compress }
        }
        'start' { $script:calls.Add("start $($args[1])") }
        default { throw "Comando Docker inesperado: $($args[0])" }
    }
}
function Reset-Fixture {
    $script:calls.Clear()
    $script:wslExit = 0
    $script:inspectExit = 0
    $script:containers = @{}
    foreach ($service in $services) {
        $script:containers[$service] = @{
            Id = "id-$service"
            Project = 'gaucha-gestao-local'
            Service = $service
            State = @{ Status = 'running'; ExitCode = 0; Error = ''; Health = 'healthy' }
        }
    }
}
function Set-MountFailure([string]$Service, [string]$Destination, [string]$Distribution = 'Ubuntu') {
    $script:containers[$Service].State = @{
        Status = 'exited'; ExitCode = 127; Health = 'unhealthy'
        Error = 'OCI runtime create failed: error mounting "/run/desktop/mnt/host/wsl/docker-desktop-bind-mounts/{0}/fixture" to rootfs at "{1}": not a directory' -f $Distribution, $Destination
    }
}
function Assert-Recovery([string]$Scenario, [bool]$Complete, [string[]]$Calls = @()) {
    $result = Invoke-RecoveryCheck
    if ($result -ne $Complete -or ($script:calls -join ',') -cne ($Calls -join ',')) {
        throw ('{0}: resultado={1}, chamadas={2}' -f $Scenario, $result, ($script:calls -join ','))
    }
    Write-Output "PASS $Scenario"
}

Reset-Fixture
Assert-Recovery 'oito saudaveis' $true
$script:containers.db.State.Status = 'exited'
Assert-Recovery 'parada intencional' $true

Reset-Fixture
Set-MountFailure db $dbMount
Set-MountFailure kong $kongMount
Assert-Recovery 'Ubuntu antes do db pelo ID inspecionado' $false @('wsl Ubuntu', 'start id-db')
$script:calls.Clear()
$script:wslExit = 1
Assert-Recovery 'WSL indisponivel impede partida nesta tentativa' $false @('wsl Ubuntu')

Reset-Fixture
Set-MountFailure kong $kongMount
$script:containers.auth.State.Health = 'starting'
Assert-Recovery 'Kong espera as dependencias' $false
$script:containers.auth.State.Health = 'healthy'
Assert-Recovery 'Kong apos as dependencias' $false @('wsl Ubuntu', 'start id-kong')

Reset-Fixture
Set-MountFailure kong '/gg/kong.yml'
Assert-Recovery 'bind mount da configuracao do Kong' $false @('wsl Ubuntu', 'start id-kong')

Reset-Fixture
Set-MountFailure db $dbMount 'OutraDistro'
Set-MountFailure kong '/gg/kong-entrypoint.sh.bak'
Assert-Recovery 'distro e destino divergentes' $true

Reset-Fixture
Set-MountFailure db $dbMount
$script:containers.studio.Project = 'outro-projeto'
Assert-Recovery 'label divergente' $false
$script:containers.studio.Project = 'gaucha-gestao-local'
$script:inspectExit = 1
Assert-Recovery 'Engine indisponivel' $false
$script:inspectExit = 0
$script:containers.Remove('studio')
Assert-Recovery 'inventario incompleto' $false

# Exercita o loop com Docker aberto depois do monitor e reaberto na mesma sessao.
$script:poll = 0
$script:checks = 0
function Get-BackendInstance {
    if ($script:poll -eq 0) { return }
    $backendId = if ($script:poll -lt 3) { 41 } else { 42 }
    @{ Id = $backendId; StartTime = [DateTime]'2026-11-13'; HasExited = $false }
}
function Invoke-RecoveryCheck {
    $script:checks++
    return $true
}
function Start-Sleep {
    if (++$script:poll -eq 5) { throw 'fim do ensaio' }
}
try {
    Watch-DesktopBackend
} catch {
    if ($_.Exception.Message -cne 'fim do ensaio') { throw }
}
if ($script:checks -ne 2) { throw "Checagens esperadas: 2. Obtidas: $script:checks." }
Write-Output 'PASS duas instancias sem depender do log do backend'
