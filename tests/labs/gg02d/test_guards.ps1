#requires -Version 5.1
# Exercises the same guards with synthetic inputs and no tool download or network.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Utf8 = [Text.UTF8Encoding]::new($false)
$tokens = $null
$errorsFound = $null
$scriptFile = Join-Path $PSScriptRoot 'gg02d.ps1'
$ast = [Management.Automation.Language.Parser]::ParseFile($scriptFile, [ref]$tokens, [ref]$errorsFound)
if ($errorsFound.Count) { throw 'GG02D parse failed' }
$functions = @(
    'Assert-Lab', 'New-File', 'New-Text', 'Assert-Entry', 'Assert-DirectoryChain',
    'Assert-PrivateRoot', 'New-PrivateRoot', 'Get-Sha', 'Get-StreamSha',
    'Get-Manifest', 'Get-TreeEntries', 'Confirm-Fixture', 'Assert-PrivateOAuthFile',
    'Assert-OwnClient', 'Initialize-DriveConfig', 'Read-DriveToken', 'Confirm-DriveAccount',
    'Get-Quota', 'Get-LabFolders', 'Get-OAuthFailureReason', 'Wait-OAuthProcess',
    'Stop-OAuthProcess', 'Assert-FreshPreflight', 'Assert-PreparedRevision'
)
$definitions = $ast.EndBlock.Statements | Where-Object {
    $_ -is [Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -cin $functions
}
if (@($definitions).Count -ne $functions.Count) { throw 'Guard definitions missing' }
. ([scriptblock]::Create(($definitions.Extent.Text -join "`n")))

function Expect-Blocked([string]$Code, [scriptblock]$Action) {
    $script:Reason = ''
    try { $null = & $Action } catch {
        if ($script:Reason -cne $Code) { throw "Unexpected guard outcome for $Code" }
        Write-Output "PASS $Code"
        return
    }
    throw "Guard unexpectedly accepted $Code"
}

# These replacements return only test data. No remote exists.
function Add-Evidence($Record) {}
function Invoke-Drive([string]$Operation, [string[]]$Arguments) { $script:FakeJson }

$Sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$Lab = 'GG02D-SYNTHETIC-' + [Guid]::NewGuid().ToString('N')
$Root = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) $Lab
New-PrivateRoot
$source = Join-Path $Root 'source'
$null = New-Item -ItemType Directory -Path $source
$expected = Get-Manifest ([ordered]@{ 'test.txt' = $Utf8.GetBytes('synthetic') })
New-Text (Join-Path $source 'test.txt') 'synthetic'
$null = Confirm-Fixture $source $expected
Write-Output 'PASS exact-synthetic-fixture'
$null = New-Item -ItemType Directory -Path (Join-Path $source 'unexpected')
Expect-Blocked 'unexpected-fixture-directory' { Confirm-Fixture $source $expected }

$wrong = Join-Path $Root 'wrong'
$null = New-Item -ItemType Directory -Path $wrong
New-Text (Join-Path $wrong 'test.txt') 'synthetiX'
Expect-Blocked 'fixture-sha256-mismatch' { Confirm-Fixture $wrong $expected }

$junction = Join-Path $Root 'junction'
$null = New-Item -ItemType Junction -Path $junction -Target $source
Expect-Blocked 'link-or-wrong-file-type' { Assert-Entry $junction -Directory }

$Config = Join-Path $Root 'rclone.conf'
$desktop = Join-Path $Root 'oauth-desktop.json'
Expect-Blocked 'desktop-client-file-required' { Initialize-DriveConfig }
New-Text $desktop '{malformed'
Expect-Blocked 'desktop-client-json-required' { Initialize-DriveConfig }
[IO.File]::WriteAllText($desktop, '{"web":{"client_id":"fictional","client_secret":"fictional"}}', $Utf8)
Expect-Blocked 'desktop-client-json-required' { Initialize-DriveConfig }
[IO.File]::WriteAllText($desktop, '{"installed":{"client_id":"202264815644.apps.googleusercontent.com","client_secret":"fictional"}}', $Utf8)
Expect-Blocked 'own-desktop-client-required' { Initialize-DriveConfig }
Assert-OwnClient '123-synthetic.apps.googleusercontent.com' 'fictional'
Expect-Blocked 'own-desktop-client-required' { Assert-OwnClient '123-synthetic.apps.googleusercontent.com' '' }
[IO.File]::WriteAllText($desktop, '{"installed":{"client_id":"123-synthetic.apps.googleusercontent.com","client_secret":"fictional"}}', $Utf8)
$acl = Get-Acl -LiteralPath $desktop
$other = [Security.Principal.SecurityIdentifier]::new('S-1-1-0')
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($other, 'Read', 'Allow'))
Set-Acl -LiteralPath $desktop -AclObject $acl
Expect-Blocked 'private-oauth-file-acl' { Initialize-DriveConfig }
$acl.PurgeAccessRules($other)
Set-Acl -LiteralPath $desktop -AclObject $acl
$desktopClient = Initialize-DriveConfig
$seed = [IO.File]::ReadAllText($Config)
$tokenLine = 'token = {"access_token":"synthetic-access","refresh_token":"synthetic-refresh"}'
Expect-Blocked 'refresh-token-required' { Read-DriveToken $desktopClient }
[IO.File]::AppendAllText($Config, "$tokenLine`n", $Utf8)
$accessToken = Read-DriveToken $desktopClient
if ($accessToken -cne 'synthetic-access') { throw 'Expected own Desktop client and token' }
Write-Output 'PASS drive-file-own-client-config'
$Config = Join-Path $Root 'changed-client.ini'
New-Text $Config ($seed.Replace('123-synthetic.', '456-synthetic.') + $tokenLine)
Expect-Blocked 'oauth-desktop-client-changed' { Read-DriveToken $desktopClient }
$Config = Join-Path $Root 'changed-secret.ini'
New-Text $Config ($seed.Replace('fictional', 'different-secret') + $tokenLine)
Expect-Blocked 'oauth-desktop-client-changed' { Read-DriveToken $desktopClient }
$Config = Join-Path $Root 'missing-refresh.ini'
New-Text $Config ($seed + 'token = {"access_token":"synthetic-access"}')
Expect-Blocked 'refresh-token-required' { Read-DriveToken }
$Config = Join-Path $Root 'wider.ini'
New-Text $Config ($seed.Replace('scope = drive.file', 'scope = drive.file,drive') + $tokenLine)
Expect-Blocked 'unexpected-oauth-config' { Read-DriveToken }
$Config = Join-Path $Root 'redirected.ini'
New-Text $Config ($seed + "root_folder_id = fictional`n" + $tokenLine)
Expect-Blocked 'unexpected-oauth-config' { Read-DriveToken }
$Config = Join-Path $Root 'rclone.conf'
function Read-Host($Prompt) { 'dedicated@example.invalid' }
function Invoke-RestMethod {
    [CmdletBinding()]
    param($Method, [switch]$UseBasicParsing, $TimeoutSec, $MaximumRedirection, $Uri, $Headers)
    if ($Headers.Authorization -cne 'Bearer synthetic-access' -or $MaximumRedirection -ne 0 -or
        $Uri -cne 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)') { throw 'Unexpected account probe' }
    if ($script:FakeAccount -eq 'error') { throw 'synthetic private response' }
    [pscustomobject]@{ user = [pscustomobject]@{ emailAddress = $script:FakeAccount } }
}
$FakeAccount = 'dedicated@example.invalid'
Confirm-DriveAccount $accessToken
Write-Output 'PASS dedicated-account-matched'
$FakeAccount = 'other@example.invalid'
Expect-Blocked 'dedicated-account-mismatch' { Confirm-DriveAccount $accessToken }
$FakeAccount = 'error'
Expect-Blocked 'drive-account-check-failed' { Confirm-DriveAccount $accessToken }

$Remote = 'gg02d:'
$MinimumFree = 128MB
$FakeJson = '{"total":1000000000,"free":900000000}'
if ((Get-Quota 'synthetic' -BeforeWrite).free -ne 900000000) { throw 'Quota test mismatch' }
Write-Output 'PASS quota-numeric'
$FakeJson = '{"total":1000000000}'
Expect-Blocked 'quota-unavailable' { Get-Quota 'synthetic' -BeforeWrite }
$FakeJson = '{"total":1000000000,"free":100}'
Expect-Blocked 'insufficient-quota' { Get-Quota 'synthetic' -BeforeWrite }

$FakeJson = '[]'
if (@(Get-LabFolders).Count -ne 0) { throw 'Expected empty directory list' }
$FakeJson = '[{"Name":"unrelated"},{"Name":"' + $Lab + '","IsDir":true,"ID":"synthetic-id"}]'
if (@(Get-LabFolders).Count -ne 1) { throw 'Expected exactly one UUID folder' }
$FakeJson = '[{"Name":"' + $Lab + '"},{"Name":"' + $Lab + '"}]'
if (@(Get-LabFolders).Count -ne 2) { throw 'Expected ambiguous duplicate UUID folders' }
Write-Output 'PASS UUID-folder-selection'

$Config = Join-Path $Root 'private-oauth.ini'
$preflightLog = Join-Path $Root 'Preflight-commands.jsonl'
Assert-FreshPreflight $preflightLog
Write-Output 'PASS fresh-preflight'
New-Text $Config 'synthetic partial configuration'
Expect-Blocked 'preflight-already-attempted' { Assert-FreshPreflight $preflightLog }
$Config = Join-Path $Root 'absent-oauth.ini'
New-Text $preflightLog ''
Expect-Blocked 'preflight-already-attempted' { Assert-FreshPreflight $preflightLog }

$prepared = Join-Path $Root 'Prepare-result.json'
Expect-Blocked 'prepare-current-revision-required' { Assert-PreparedRevision 'current' }
New-Text $prepared ('{"phase":"Prepare","status":"PASS","lab":"' + $Lab + '","script_sha256":"current"}')
Assert-PreparedRevision 'current'
Write-Output 'PASS prepare-current-revision'
Expect-Blocked 'prepare-current-revision-required' { Assert-PreparedRevision 'older' }

$cases = @(
    @{ text = 'failed to start auth webserver: address in use'; expected = 'oauth-loopback-bind-failed' }
    @{ text = "Auth state doesn't match: private-sentinel"; expected = 'oauth-loopback-state-mismatch' }
    @{ text = 'failed to get token: invalid_client private-sentinel'; expected = 'oauth-client-rejected' }
    @{ text = 'No code returned by remote server: access_denied'; expected = 'oauth-access-denied' }
    @{ text = 'No code returned by remote server: redirect_uri_mismatch'; expected = 'oauth-request-rejected' }
    @{ text = 'failed to get token: 400 Bad Request private-sentinel'; expected = 'oauth-token-exchange-failed' }
    @{ text = 'No code returned by remote server'; expected = 'oauth-loopback-rejected' }
    @{ text = 'Failed to open browser automatically (private-sentinel)'; timeout = $true; expected = 'oauth-browser-launch-failed' }
    @{ text = "NOTICE: Waiting for code...`r`n"; timeout = $true; expected = 'oauth-callback-timeout' }
    @{ text = "NOTICE: Waiting for code...`r`nNOTICE: Got code`r`n"; timeout = $true; expected = 'oauth-after-callback-timeout' }
    @{ text = '400 malformed request private-sentinel'; timeout = $true; expected = 'oauth-process-timeout' }
    @{ text = 'unknown private-sentinel'; expected = 'oauth-process-failed' }
)
foreach ($case in $cases) {
    $outcome = Get-OAuthFailureReason $case.text -TimedOut:([bool]$case['timeout'])
    if ($outcome -cne $case.expected) { throw ('Unexpected OAuth diagnostic for ' + $case.expected) }
    Write-Output "PASS $outcome"
}

function Read-OAuthAbort { $script:SimulatedAbort }

# A native child exercises the wait and termination without OAuth, network or console input.
foreach ($scenario in @(
    @{ key = 'oauth-browser-http-400-reported'; command = 'Start-Sleep -Seconds 20'; ms = 10000; expected = 'oauth-browser-http-400-reported' }
    @{ key = 'oauth-operator-cancelled'; command = 'Start-Sleep -Seconds 20'; ms = 10000; expected = 'oauth-operator-cancelled' }
    @{ key = ''; command = 'Start-Sleep -Seconds 20'; ms = 10; expected = 'timeout' }
    @{ key = ''; command = 'exit 0'; ms = 10000; expected = 'exited' }
)) {
    $script:SimulatedAbort = $scenario.key
    $start = [Diagnostics.ProcessStartInfo]::new(
        (Join-Path $PSHOME 'powershell.exe'), ('-NoProfile -NonInteractive -Command "' + $scenario.command + '"'))
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $process = [Diagnostics.Process]::Start($start)
    try {
        $outcome = Wait-OAuthProcess $process ([Diagnostics.Stopwatch]::StartNew()) $scenario.ms
        if ($outcome -cne $scenario.expected) { throw ('Unexpected child outcome for ' + $scenario.expected) }
        Stop-OAuthProcess $process
        if (!$process.WaitForExit(5000)) { throw 'Synthetic child did not exit' }
        Write-Output "PASS child-$outcome"
    } finally {
        try { Stop-OAuthProcess $process } finally { $process.Dispose() }
    }
}
