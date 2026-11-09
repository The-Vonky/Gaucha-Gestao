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
    'Get-Manifest', 'Get-TreeEntries', 'Confirm-Fixture', 'Assert-DriveConfig',
    'Get-Quota', 'Get-LabFolders'
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

$Config = Join-Path $Root 'allowed.ini'
New-Text $Config "[gg02d]`ntype = drive`nscope = drive.file`ntoken = fictional`nteam_drive =`n"
Assert-DriveConfig
Write-Output 'PASS drive-file-config'
$Config = Join-Path $Root 'wider.ini'
New-Text $Config "[gg02d]`ntype = drive`nscope = drive`ntoken = fictional`n"
Expect-Blocked 'unexpected-oauth-config' { Assert-DriveConfig }
$Config = Join-Path $Root 'redirected.ini'
New-Text $Config "[gg02d]`ntype = drive`nscope = drive.file`ntoken = fictional`nroot_folder_id = fictional`n"
Expect-Blocked 'unexpected-oauth-config' { Assert-DriveConfig }

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
