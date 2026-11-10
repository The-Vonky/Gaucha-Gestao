#requires -Version 5.1
[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(Mandatory)][ValidateSet('Prepare', 'Preflight', 'Run', 'LocalTest', 'Offline')][string]$Phase,
    [ValidatePattern('^GG02D-SYNTHETIC-[0-9a-f]{32}$')][string]$Lab
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Utf8 = [Text.UTF8Encoding]::new($false)
$Tools = [ordered]@{
    restic = @{
        version = '0.19.1'; asset = 'restic_0.19.1_windows_amd64.zip'; entry = 'restic_0.19.1_windows_amd64.exe'
        release = 'https://github.com/restic/restic/releases/download/v0.19.1/'
        sha256 = 'da948ad707ed690426473aaba2046cd61f8f90f6f0e7dab6be0d5796531de67d'
    }
    rclone = @{
        version = '1.76.0'; asset = 'rclone-v1.76.0-windows-amd64.zip'; entry = 'rclone-v1.76.0-windows-amd64/rclone.exe'
        release = 'https://github.com/rclone/rclone/releases/download/v1.76.0/'
        sha256 = '8b4fd2737ade4e70c057ef4a49deb7cffe94b0fb9d7587c189d149823f21a1dc'
    }
}
$MinimumFree = 128MB
$Remote = 'gg02d:'
$FolderId = ''
$WriteStarted = $false
$Stage = 'guard'
$Reason = 'guard-or-unexpected-error'
$Evidence = $null
$Result = [ordered]@{ phase = $Phase; status = 'BLOCKED' }

function Assert-Lab($Condition, [string]$Code) {
    if (!$Condition) { $script:Reason = $Code; throw 'GG02D guard' }
}

function New-File([string]$Path, [byte[]]$Bytes) {
    $stream = [IO.File]::Open($Path, 'CreateNew', 'Write', 'None')
    try { $stream.Write($Bytes, 0, $Bytes.Length) } finally { $stream.Dispose() }
}

function New-Text([string]$Path, [string]$Text) { New-File $Path ($Utf8.GetBytes($Text)) }

function Add-Evidence($Record) {
    [IO.File]::AppendAllText($Evidence, (($Record | ConvertTo-Json -Depth 16 -Compress) + "`n"), $Utf8)
}

function Assert-Entry([string]$Path, [switch]$Directory) {
    $item = Get-Item -LiteralPath $Path -Force
    Assert-Lab (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -and
        $item.PSIsContainer -eq [bool]$Directory -and $item.LinkType -ne 'HardLink') 'link-or-wrong-file-type'
    $item
}

function Assert-DirectoryChain([string]$Path) {
    for ($parent = [IO.DirectoryInfo]::new($Path); $null -ne $parent; $parent = $parent.Parent) {
        $null = Assert-Entry $parent.FullName -Directory
    }
}

function Assert-PrivateRoot {
    Assert-DirectoryChain $Root
    $acl = Get-Acl -LiteralPath $Root
    $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    Assert-Lab ($acl.AreAccessRulesProtected -and
        $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $Sid.Value -and
        $rules.Count -eq 1 -and $rules[0].IdentityReference.Value -eq $Sid.Value -and
        $rules[0].AccessControlType -eq 'Allow' -and $rules[0].FileSystemRights -eq 'FullControl' -and
        $rules[0].InheritanceFlags -eq 'ContainerInherit, ObjectInherit' -and
        $rules[0].PropagationFlags -eq 'None') 'private-root-acl'
}

function New-PrivateRoot {
    Assert-Lab (!(Test-Path -LiteralPath $Root)) 'root-already-exists'
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($Sid)
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
        $Sid, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow'))
    $null = [IO.Directory]::CreateDirectory($Root, $acl)
    Assert-PrivateRoot
}

function Get-Sha([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }

function Get-StreamSha($Stream) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($sha.ComputeHash($Stream)).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Confirm-Tools([switch]$Download) {
    $ProgressPreference = 'SilentlyContinue'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $provenance = [ordered]@{}
    foreach ($name in $Tools.Keys) {
        $tool = $Tools[$name]
        $zip = Join-Path $Root $tool.asset
        $exe = Join-Path $Root "$name.exe"
        $url = $tool.release + $tool.asset
        if ($Download) { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip -TimeoutSec 90 }
        $null = Assert-Entry $zip
        Assert-Lab ((Get-Sha $zip) -ceq $tool.sha256) 'official-zip-sha256-mismatch'
        $archive = [IO.Compression.ZipFile]::OpenRead($zip)
        try {
            $entry = $archive.GetEntry($tool.entry)
            Assert-Lab ($null -ne $entry) 'missing-official-executable'
            $stream = $entry.Open()
            try { $expected = Get-StreamSha $stream } finally { $stream.Dispose() }
            if ($Download) { [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $exe, $false) }
        } finally { $archive.Dispose() }
        $null = Assert-Entry $exe
        Assert-Lab ((Get-Sha $exe) -ceq $expected) 'executable-sha256-mismatch'
        $provenance[$name] = [ordered]@{ version = $tool.version; url = $url; zip_sha256 = $tool.sha256; exe_sha256 = $expected }
    }
    $provenance
}

function Read-OAuthAbort {
    try {
        if ([Console]::IsInputRedirected -or ![Console]::KeyAvailable) { return }
        switch ([Console]::ReadKey($true).Key) {
            'D4' { 'oauth-browser-http-400-reported' }
            'NumPad4' { 'oauth-browser-http-400-reported' }
            'Escape' { 'oauth-operator-cancelled' }
        }
    } catch [InvalidOperationException] {
        # A host without an interactive console still has the process timeout.
    } catch [IO.IOException] {}
}

function Get-OAuthFailureReason([string]$NativeError, [switch]$TimedOut) {
    switch -Regex ($NativeError) {
        'failed to start auth webserver' { return 'oauth-loopback-bind-failed' }
        "Auth state doesn't match" { return 'oauth-loopback-state-mismatch' }
        '\b(invalid_client|unauthorized_client|deleted_client)\b' { return 'oauth-client-rejected' }
        '\b(access_denied|admin_policy_enforced|org_internal)\b' { return 'oauth-access-denied' }
        '\b(invalid_request|redirect_uri_mismatch|invalid_scope)\b' { return 'oauth-request-rejected' }
        'failed to get token' { return 'oauth-token-exchange-failed' }
        'No code returned by remote server|Parse form error' { return 'oauth-loopback-rejected' }
        'Failed to open browser automatically' { return 'oauth-browser-launch-failed' }
    }
    if ($TimedOut) {
        if ($NativeError -match '(?m)Got code[ \t]*\r?$') { return 'oauth-after-callback-timeout' }
        if ($NativeError -match '(?m)Waiting for code\.\.\.[ \t]*\r?$') { return 'oauth-callback-timeout' }
        return 'oauth-process-timeout'
    }
    'oauth-process-failed'
}

function Wait-OAuthProcess($Process, [Diagnostics.Stopwatch]$Clock, [int]$TimeoutMs) {
    while (!$Process.WaitForExit(200)) {
        $abort = Read-OAuthAbort
        if ($abort) { return $abort }
        if ($Clock.ElapsedMilliseconds -ge $TimeoutMs) { return 'timeout' }
    }
    'exited'
}

function Stop-OAuthProcess($Process) {
    if ($Process.HasExited) { return }
    try { $Process.Kill() } catch [InvalidOperationException] {
        if (!$Process.HasExited) { throw }
    }
    Assert-Lab ($Process.WaitForExit(2000)) 'oauth-process-stop-timeout'
}

function Assert-FreshPreflight([string]$Log) {
    Assert-Lab (!(Test-Path -LiteralPath $Log) -and
        !(Test-Path -LiteralPath $Config) -and
        !(Test-Path -LiteralPath (Join-Path $Root 'Preflight-result.json')) -and
        !(Test-Path -LiteralPath (Join-Path $Root 'preflight-config-sha'))) 'preflight-already-attempted'
}

function Assert-PreparedRevision([string]$ScriptSha) {
    $prepared = Join-Path $Root 'Prepare-result.json'
    Assert-Lab (Test-Path -LiteralPath $prepared -PathType Leaf) 'prepare-current-revision-required'
    $null = Assert-Entry $prepared
    $record = [IO.File]::ReadAllText($prepared) | ConvertFrom-Json
    Assert-Lab ($record.phase -ceq 'Prepare' -and $record.status -ceq 'PASS' -and
        $record.PSObject.Properties['lab'] -and $record.lab -ceq $Lab -and $record.script_sha256 -ceq $ScriptSha) 'prepare-current-revision-required'
}

function Invoke-Tool([string]$Name, [string]$Operation, [string[]]$Arguments, [int]$ExpectedExit = 0, [switch]$DriveAccess) {
    $script:Stage = $Operation
    $isOAuth = $Operation -ceq 'oauth-local-browser'
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = Join-Path $Root "$Name.exe"
    $start.WorkingDirectory = $Root
    # All arguments are fixed literals, validated IDs or paths on Windows (which forbids double quotes).
    $start.Arguments = ($Arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.CreateNoWindow = $true
    $start.EnvironmentVariables.Clear()
    $start.EnvironmentVariables['SystemRoot'] = $env:SystemRoot
    $start.EnvironmentVariables['USERPROFILE'] = $Root
    $start.EnvironmentVariables['APPDATA'] = $Root
    $start.EnvironmentVariables['LOCALAPPDATA'] = $Root
    $start.EnvironmentVariables['TEMP'] = $Root
    $start.EnvironmentVariables['TMP'] = $Root
    $start.EnvironmentVariables['GOMAXPROCS'] = '4'
    if ($isOAuth) {
        $start.RedirectStandardInput = $true
        $start.EnvironmentVariables['PATH'] = Join-Path $env:SystemRoot 'System32'
        $start.EnvironmentVariables['USERPROFILE'] = $env:USERPROFILE
        $start.EnvironmentVariables['APPDATA'] = $env:APPDATA
        $start.EnvironmentVariables['LOCALAPPDATA'] = $env:LOCALAPPDATA
    }
    if ($DriveAccess) {
        $start.EnvironmentVariables['RCLONE_CONFIG'] = $Config
        $start.EnvironmentVariables['RCLONE_DRIVE_SKIP_SHORTCUTS'] = 'true'
        if ($FolderId) { $start.EnvironmentVariables['RCLONE_DRIVE_ROOT_FOLDER_ID'] = $FolderId }
    }
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $process = [Diagnostics.Process]::Start($start)
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if ($isOAuth) {
            $process.StandardInput.Close()
            $outcome = Wait-OAuthProcess $process $clock 180000
            if ($outcome -cne 'exited') {
                # End only Rclone. The browser stays available for the maintainer.
                Stop-OAuthProcess $process
                $reason = $outcome
                if ($outcome -ceq 'timeout') {
                    $nativeError = if ($stderr.Wait(1000)) { $stderr.Result } else { '' }
                    $reason = Get-OAuthFailureReason $nativeError -TimedOut
                }
                Add-Evidence @{ operation = $Operation; tool = $Name; status = 'BLOCKED'; reason = $reason
                    seconds = [Math]::Round($clock.Elapsed.TotalSeconds, 3) }
                Assert-Lab $false $reason
            }
        } elseif (!$process.WaitForExit(180000)) {
            & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /T /F /PID $process.Id *> $null
            Add-Evidence @{ operation = $Operation; status = 'TIMEOUT'; seconds = $clock.Elapsed.TotalSeconds }
            Assert-Lab $false 'command-timeout'
        }
        Assert-Lab ($stdout.Wait(5000) -and $stderr.Wait(5000)) 'process-pipes-timeout'
        $out = $stdout.Result
        $err = $stderr.Result
        $record = @{ operation = $Operation; tool = $Name; exit = $process.ExitCode; seconds = [Math]::Round($clock.Elapsed.TotalSeconds, 3) }
        if ($isOAuth) {
            if ($process.ExitCode -ne 0) { $record.reason = Get-OAuthFailureReason $err }
            Add-Evidence $record
            if ($process.ExitCode -ne 0) { Assert-Lab $false $record.reason }
            return
        }
        $stats = [regex]::Matches($err, '(?m)^rclone: (\{[^\r\n]+\})\r?$')
        $samples = @(foreach ($line in $stats) {
            try { $json = $line.Groups[1].Value | ConvertFrom-Json } catch { continue }
            if ($json.PSObject.Properties['stats'] -and $json.stats.PSObject.Properties['bytes']) { [long]$json.stats.bytes }
        })
        if ($samples.Count) { $record.rclone_accounted_bytes_max_sample = ($samples | Measure-Object -Maximum).Maximum }
        Add-Evidence $record
        $reason = switch -Regex ($err) {
            'invalid_grant|unauthorized_client|invalid_token|401 Unauthorized|insufficientPermissions|insufficient authentication scopes' { 'oauth-or-scope'; break }
            'quotaExceeded|storageQuotaExceeded|rateLimitExceeded|429 Too Many Requests' { 'quota-or-api-limit'; break }
            'no such host|connection refused|connection reset|timeout|TLS handshake|network is unreachable' { 'network-or-timeout'; break }
            default { 'native-command-failed' }
        }
        Assert-Lab ($process.ExitCode -eq $ExpectedExit) $reason
        $out
    } finally {
        try { if ($isOAuth) { Stop-OAuthProcess $process } }
        finally { $process.Dispose() }
    }
}

function Invoke-Drive([string]$Operation, [string[]]$Arguments) {
    Invoke-Tool rclone $Operation ($Arguments + @('--retries', '1', '--low-level-retries', '2', '--contimeout', '15s', '--timeout', '30s')) -DriveAccess
}

function Get-Quota([string]$Operation, [switch]$BeforeWrite) {
    $quota = Invoke-Drive $Operation @('about', $Remote, '--json') | ConvertFrom-Json
    $clean = [ordered]@{}
    foreach ($key in @('total', 'used', 'free', 'trashed', 'other')) {
        if ($quota.PSObject.Properties[$key]) {
            $value = $quota.$key
            Assert-Lab (($value -is [int] -or $value -is [long]) -and $value -ge 0) 'invalid-quota'
            $clean[$key] = [long]$value
        }
    }
    Assert-Lab ($clean.Contains('total') -and $clean.Contains('free') -and
        $clean.total -gt 0 -and $clean.free -le $clean.total) 'quota-unavailable'
    Add-Evidence @{ operation = "$Operation-result"; quota_bytes = $clean }
    if ($BeforeWrite) { Assert-Lab ($clean.free -ge $MinimumFree) 'insufficient-quota' }
    $clean
}

function Assert-PrivateOAuthFile([string]$Path) {
    $null = Assert-Entry $Path
    $acl = Get-Acl -LiteralPath $Path
    $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    Assert-Lab ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $Sid.Value -and
        $rules.Count -gt 0 -and @($rules | Where-Object {
            $_.IdentityReference.Value -ne $Sid.Value -or $_.AccessControlType -ne 'Allow'
        }).Count -eq 0) 'private-oauth-file-acl'
}

function Assert-OwnClient($ClientId, $ClientSecret) {
    Assert-Lab ($ClientId -is [string] -and $ClientId -cmatch '^[0-9]+-[a-zA-Z0-9_-]+[.]apps[.]googleusercontent[.]com$' -and
        $ClientId -cne '202264815644.apps.googleusercontent.com' -and
        $ClientSecret -is [string] -and $ClientSecret -cmatch '^[A-Za-z0-9_-]{8,}$') 'own-desktop-client-required'
}

function Initialize-DriveConfig {
    $clientPath = Join-Path $Root 'oauth-desktop.json'
    Assert-Lab (Test-Path -LiteralPath $clientPath -PathType Leaf) 'desktop-client-file-required'
    Assert-PrivateOAuthFile $clientPath
    try { $document = [IO.File]::ReadAllText($clientPath) | ConvertFrom-Json }
    catch { Assert-Lab $false 'desktop-client-json-required' }
    Assert-Lab ($null -ne $document -and $document.PSObject.Properties['installed'] -and
        !$document.PSObject.Properties['web'] -and $null -ne $document.installed -and
        $document.installed.PSObject.Properties['client_id'] -and
        $document.installed.PSObject.Properties['client_secret']) 'desktop-client-json-required'
    $client = $document.installed
    Assert-OwnClient $client.client_id $client.client_secret
    New-Text $Config "[gg02d]`ntype = drive`nscope = drive.file`nclient_id = $($client.client_id)`nclient_secret = $($client.client_secret)`n"
    $client
}

function Read-DriveToken($ExpectedClient) {
    Assert-PrivateOAuthFile $Config
    $section = ''
    $values = @{}
    foreach ($line in [IO.File]::ReadLines($Config)) {
        if (!$line.Trim()) { continue }
        if ($line -ceq '[gg02d]') {
            Assert-Lab (!$section) 'unexpected-oauth-config'
            $section = $line
            continue
        }
        Assert-Lab ($section -and $line -cmatch '^(type|scope|client_id|client_secret|token|team_drive) *= *(.*)$') 'unexpected-oauth-config'
        Assert-Lab (!$values.ContainsKey($Matches[1])) 'unexpected-oauth-config'
        $values[$Matches[1]] = $Matches[2]
    }
    Assert-Lab ($values['type'] -ceq 'drive' -and $values['scope'] -ceq 'drive.file' -and
        !$values['team_drive']) 'unexpected-oauth-config'
    Assert-OwnClient $values['client_id'] $values['client_secret']
    if ($ExpectedClient) {
        Assert-Lab ($values['client_id'] -ceq $ExpectedClient.client_id -and
            $values['client_secret'] -ceq $ExpectedClient.client_secret) 'oauth-desktop-client-changed'
    }
    Assert-Lab ($values['token']) 'refresh-token-required'
    try { $token = $values['token'] | ConvertFrom-Json }
    catch { Assert-Lab $false 'refresh-token-required' }
    Assert-Lab ($null -ne $token -and $token.PSObject.Properties['refresh_token'] -and
        $token.PSObject.Properties['access_token'] -and $token.access_token -cmatch '^[A-Za-z0-9._~-]+$' -and
        $token.refresh_token -cmatch '^[A-Za-z0-9._~/-]+$') 'refresh-token-required'
    $token.access_token
}

function Confirm-DriveAccount([string]$AccessToken) {
    $expected = (Read-Host 'Informe o e-mail da conta Drive exclusiva para verificacao local').Trim()
    Assert-Lab ($expected -match '^[^\s@]+@[^\s@]+$') 'dedicated-account-unconfirmed'
    try {
        $account = Invoke-RestMethod -Method Get -UseBasicParsing -TimeoutSec 30 -MaximumRedirection 0 `
            -Uri 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)' `
            -Headers @{ Authorization = "Bearer $accessToken" }
    } catch { Assert-Lab $false 'drive-account-check-failed' }
    Assert-Lab ($null -ne $account -and $account.PSObject.Properties['user'] -and $null -ne $account.user -and
        $account.user.PSObject.Properties['emailAddress'] -and $account.user.emailAddress -ieq $expected) 'dedicated-account-mismatch'
}

function Get-LabFolders {
    $output = Invoke-Drive 'lsjson-root-dirs' @('lsjson', $Remote, '--dirs-only')
    $folders = ConvertFrom-Json -InputObject $output
    $folders | Where-Object { $_ -and $_.Name -ceq $Lab }
}

function Invoke-Restic([string]$Operation, [string]$Repo, [string]$PasswordFile, [string[]]$Arguments, [int]$ExpectedExit = 0) {
    $options = @('--repo', $Repo, '--password-file', $PasswordFile, '--no-cache')
    $usesRclone = $Repo.StartsWith('rclone:')
    $usesDrive = $Phase -eq 'Run' -and ($Repo -ceq 'rclone:gg02d:repository' -or $Operation -ceq 'secondary-copy')
    if ($usesRclone) {
        # Invoke-Tool runs Restic from the private root containing the verified executable.
        $options += @('-o', 'rclone.program=./rclone.exe', '-o', 'rclone.args=serve restic --stdio --append-only --use-json-log --stats 1s --stats-log-level NOTICE --retries 1 --low-level-retries 2 --contimeout 15s --timeout 30s')
        if (!$usesDrive) { $options[-1] += ' --config NUL' }
    }
    Invoke-Tool restic $Operation ($options + $Arguments) $ExpectedExit -DriveAccess:$usesDrive
}

function Get-Fixture([int]$Generation) {
    $blob = [byte[]]::new(8MB)
    [Random]::new(22026).NextBytes($blob)
    $files = [ordered]@{
        'data/objects/a.bin' = $blob
        'data/objects/duplicate.bin' = $blob
        'data/records.txt' = $Utf8.GetBytes("GG02D ONLY SYNTHETIC - generation $Generation`n")
        'structure/rebuild.txt' = $Utf8.GetBytes("SYNTHETIC structure, no executable runtime`n")
        'recovery/instructions.txt' = $Utf8.GetBytes("SYNTHETIC: verify relative paths, bytes and SHA-256`n")
    }
    if ($Generation -eq 2) {
        $delta = [byte[]]::new(4096)
        [Random]::new(22027).NextBytes($delta)
        $changed = [byte[]]$blob.Clone()
        [Array]::Copy($delta, 0, $changed, 4MB, $delta.Length)
        $files['data/objects/a.bin'] = $changed
        $extra = [byte[]]::new(1MB)
        [Random]::new(22028).NextBytes($extra)
        $files['data/objects/new.bin'] = $extra
    }
    $manifest = [ordered]@{ synthetic = $true; generation = $Generation; application = 'fictional-no-release'; files = Get-Manifest $files }
    $files['manifest.json'] = $Utf8.GetBytes(($manifest | ConvertTo-Json -Depth 6 -Compress) + "`n")
    $files
}

function Get-Manifest($Files) {
    $manifest = [ordered]@{}
    foreach ($name in $Files.Keys) {
        $stream = [IO.MemoryStream]::new($Files[$name], $false)
        try { $manifest[$name] = [ordered]@{ bytes = $stream.Length; sha256 = Get-StreamSha $stream } }
        finally { $stream.Dispose() }
    }
    $manifest
}

function New-FreshDirectory([string]$Path) {
    Assert-Lab (!(Test-Path -LiteralPath $Path)) 'directory-already-exists'
    $null = New-Item -ItemType Directory -Path $Path
}

function Write-Fixture($Files) {
    New-FreshDirectory $Source
    foreach ($name in $Files.Keys) {
        $path = Join-Path $Source $name
        $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))
        New-File $path $Files[$name]
    }
}

function Get-TreeEntries([string]$Path) {
    $null = Assert-Entry $Path -Directory
    foreach ($child in Get-ChildItem -LiteralPath $Path -Force) {
        Assert-Entry $child.FullName -Directory:$child.PSIsContainer
        if ($child.PSIsContainer) { Get-TreeEntries $child.FullName }
    }
}

function Confirm-Fixture([string]$Path, $Expected) {
    $actual = [ordered]@{}
    $entries = @(Get-TreeEntries $Path)
    $files = @($entries | Where-Object { !$_.PSIsContainer })
    Assert-Lab ($files.Count -eq $Expected.Count) 'fixture-file-count-mismatch'
    foreach ($directory in ($entries | Where-Object PSIsContainer)) {
        $prefix = $directory.FullName.Substring($Path.Length + 1).Replace('\', '/') + '/'
        Assert-Lab (@($Expected.Keys | Where-Object { $_.StartsWith($prefix, [StringComparison]::Ordinal) }).Count -gt 0) 'unexpected-fixture-directory'
    }
    foreach ($file in $files) {
        $name = $file.FullName.Substring($Path.Length + 1).Replace('\', '/')
        Assert-Lab (($name -cin $Expected.Keys) -and $file.Length -eq $Expected[$name].bytes) 'fixture-path-or-size-mismatch'
        $hash = Get-Sha $file.FullName
        Assert-Lab ($hash -ceq $Expected[$name].sha256) 'fixture-sha256-mismatch'
        $actual[$name] = [ordered]@{ bytes = $file.Length; sha256 = $hash }
    }
    $actual
}

function Set-FixtureDelta($Initial, $Changed) {
    foreach ($name in $Changed.Keys) {
        $path = Join-Path $Source $name
        if (!$Initial.Contains($name)) { New-File $path $Changed[$name]; continue }
        if ($name -in @('data/objects/duplicate.bin', 'structure/rebuild.txt', 'recovery/instructions.txt')) { continue }
        $null = Assert-Entry $path
        [IO.File]::WriteAllBytes($path, $Changed[$name])
    }
}

function New-PasswordFile([string]$Path) {
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $bytes = [byte[]]::new(32)
        $random.GetBytes($bytes)
        New-Text $Path ([Convert]::ToBase64String($bytes) + "`n")
    } finally { $random.Dispose() }
}

function Get-RepoSize([string]$Operation) {
    if ($Phase -eq 'Run') {
        $stats = Invoke-Drive $Operation @('size', ($Remote + 'repository'), '--json') | ConvertFrom-Json
        Assert-Lab (($stats.bytes -is [int] -or $stats.bytes -is [long]) -and $stats.bytes -gt 0) 'invalid-repo-size'
        return [long]$stats.bytes
    }
    [long]((Get-TreeEntries $LocalBackend | Where-Object { !$_.PSIsContainer } | Measure-Object Length -Sum).Sum)
}

function Get-Snapshots([string]$Role, [string]$Repo, [string]$PasswordFile) {
    $json = Invoke-Restic "$Role-snapshots" $Repo $PasswordFile @('snapshots', '--json', '--no-lock')
    $snapshots = ConvertFrom-Json -InputObject $json
    Assert-Lab (@($snapshots).Count -eq 3) 'snapshot-count-mismatch'
    $ids = [ordered]@{}
    foreach ($tag in @('initial', 'unchanged', 'changed')) {
        $match = @($snapshots | Where-Object { @($_.tags).Count -eq 1 -and $_.tags[0] -ceq "gg02d-$tag" })
        Assert-Lab ($match.Count -eq 1 -and $match[0].id -cmatch '^[0-9a-f]{64}$') 'snapshot-tag-or-id-mismatch'
        $ids[$tag] = $match[0].id
    }
    Assert-Lab (@($ids.Values | Select-Object -Unique).Count -eq 3) 'duplicate-snapshot-id'
    $ids
}

function Restore-Verified([string]$Role, [string]$Repo, [string]$PasswordFile, $Ids, $Manifests) {
    $proof = [ordered]@{}
    foreach ($tag in @('initial', 'changed')) {
        $target = Join-Path $Root "restore-$Role-$tag"
        New-FreshDirectory $target
        $null = Invoke-Restic "$Role-restore-$tag" $Repo $PasswordFile @('restore', $Ids[$tag], '--target', $target, '--no-lock')
        $children = @(Get-ChildItem -LiteralPath $target -Force)
        Assert-Lab ($children.Count -eq 1 -and $children[0].Name -ceq 'source') 'unexpected-restore-root'
        $actual = Confirm-Fixture (Join-Path $target 'source') $Manifests[$tag]
        $proof[$tag] = [ordered]@{ snapshot = $Ids[$tag]; expected = $Manifests[$tag]; restored = $actual; status = 'PASS' }
        Add-Evidence @{ operation = "$Role-manifest-$tag"; comparison = $proof[$tag] }
    }
    $proof
}

function Save-Result {
    New-Text (Join-Path $Root "$Phase-result.json") (($Result | ConvertTo-Json -Depth 16) + "`n")
}

try {
    Assert-Lab ($PSVersionTable.PSEdition -eq 'Desktop' -and [Environment]::Is64BitProcess -and
        $env:PROCESSOR_ARCHITECTURE -eq 'AMD64') 'windows-amd64-required'
    $local = [Environment]::GetFolderPath('LocalApplicationData')
    Assert-Lab ($local -cmatch '^[A-Za-z]:\\[^\r\n]+$') 'invalid-local-appdata'
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    Assert-Lab (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'non-elevated-powershell-required'
    $Sid = $principal.Identity.User
    Assert-DirectoryChain $local
    $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($local))
    Assert-Lab ($drive.DriveType -eq 'Fixed' -and $drive.DriveFormat -eq 'NTFS') 'fixed-local-ntfs-required'
    Assert-Lab ($drive.AvailableFreeSpace -ge 512MB) 'insufficient-local-space'
    if ($Phase -eq 'Prepare') {
        Assert-Lab (!$Lab) 'prepare-generates-its-own-lab'
        $Lab = 'GG02D-SYNTHETIC-' + [Guid]::NewGuid().ToString('N')
    }
    Assert-Lab ($Lab -cmatch '^GG02D-SYNTHETIC-[0-9a-f]{32}$') 'invalid-lab-id'
    $Root = Join-Path $local $Lab
    $Config = Join-Path $Root 'rclone.conf'
    $Source = Join-Path $Root 'source'
    $PrimaryPassword = Join-Path $Root 'primary-password'
    $SecondaryPassword = Join-Path $Root 'secondary-password'
    $WrongPassword = Join-Path $Root 'wrong-password'
    $Secondary = Join-Path $Root 'secondary'
    $LocalBackend = Join-Path $Root 'local-only-backend'
    $Marker = Join-Path $Root 'LAB'
    if ($Phase -eq 'Prepare') {
        New-PrivateRoot
        New-Text $Marker 'GG02D-SYNTHETIC-v1'
        $Result.lab = $Lab
    } else {
        Assert-PrivateRoot
        $null = Assert-Entry $Marker
        Assert-Lab ([IO.File]::ReadAllText($Marker) -ceq 'GG02D-SYNTHETIC-v1') 'invalid-lab-marker'
    }
    $log = Join-Path $Root "$Phase-commands.jsonl"
    if ($Phase -eq 'Preflight') {
        $Stage = 'verify-unused-preflight'
        Assert-FreshPreflight $log
    }
    # Exclusive creation also prevents two simultaneous attempts using one UUID.
    New-Text $log ''
    $Evidence = $log
    $Result.script_sha256 = Get-Sha $PSCommandPath
    $Stage = 'verify-tools'
    $Result.tools = Confirm-Tools -Download:($Phase -eq 'Prepare')
    foreach ($name in $Tools.Keys) {
        $output = Invoke-Tool $name "$name-version" @('version')
        Assert-Lab ($output -match ('(?m)^' + $name + ' v?' + [regex]::Escape($Tools[$name].version) + '\b') -and $output -match '(?im)windows/amd64|^- os/arch: amd64\r?$') 'unexpected-tool-version'
    }
    $Initial = Get-Fixture 1
    $Changed = Get-Fixture 2
    $Manifests = @{ initial = Get-Manifest $Initial; changed = Get-Manifest $Changed }
    if ($Phase -eq 'Prepare') {
        $Stage = 'create-and-verify-fixture'
        Write-Fixture $Initial
        $Result.fixture = Confirm-Fixture $Source $Manifests.initial
    } elseif ($Phase -eq 'Preflight') {
        $Stage = 'verify-prepared-revision'
        Assert-PreparedRevision $Result.script_sha256
        $Stage = 'confirm-oauth-production'
        $confirm = Read-Host 'Confirme projeto sem billing, Drive API apenas, External/In production, 2FA, recuperacao e perfil dedicado. Digite OAUTH-PRODUCAO'
        Assert-Lab ($confirm -ceq 'OAUTH-PRODUCAO') 'oauth-production-controls-unconfirmed'
        $Result.production_controls_attested = $true
        $null = Confirm-Fixture $Source $Manifests.initial
        $Stage = 'load-private-desktop-client'
        $desktopClient = Initialize-DriveConfig
        Write-Host 'No navegador, confira a conta exclusiva antes de consentir.'
        Write-Host 'Se o navegador mostrar HTTP 400, volte ao PowerShell e pressione 4. Esc cancela por outro motivo.'
        $null = Invoke-Tool rclone 'oauth-local-browser' @('config', 'update', 'gg02d', 'config_is_local=true', 'config_shared_client_id=false', 'config_change_team_drive=false', '--no-output', '--log-level', 'NOTICE') -DriveAccess
        $Stage = 'verify-own-client-and-token'
        $accessToken = Read-DriveToken $desktopClient
        $Stage = 'confirm-dedicated-account'
        Confirm-DriveAccount $accessToken
        $Result.dedicated_account_confirmed = $true
        $Result.quota = Get-Quota 'quota-preflight' -BeforeWrite
        $Result.oauth_client = 'own-desktop'
        Assert-Lab (@(Get-LabFolders).Count -eq 0) 'remote-folder-already-exists'
        $Result.remote_folder = $Lab
        $Result.scope = 'drive.file'
        New-Text (Join-Path $Root 'preflight-config-sha') (Get-Sha $Config)
        Write-Host "Destino reservado para a proxima etapa: $Lab/repository"
        Write-Host "Quota livre confirmada em bytes: $($Result.quota.free)"
    } elseif ($Phase -eq 'Offline') {
        $Stage = 'offline-guards'
        Assert-Lab (!(Test-Path -LiteralPath $Config)) 'oauth-config-present-offline'
        $confirm = Read-Host 'Confirme segundo PC autorizado, Wi-Fi/Ethernet desligados e chave secundaria. Digite OUTRO-PC-OFFLINE'
        Assert-Lab ($confirm -ceq 'OUTRO-PC-OFFLINE') 'second-offline-computer-unconfirmed'
        Assert-Lab (@(Get-NetAdapter -Physical | Where-Object Status -eq 'Up').Count -eq 0 -and
            @(Get-NetRoute | Where-Object { $_.DestinationPrefix -in @('0.0.0.0/0', '::/0') }).Count -eq 0) 'network-interface-or-default-route-active'
        $null = @(Get-TreeEntries $Secondary)
        $null = Assert-Entry $SecondaryPassword
        $ids = Get-Snapshots 'offline' $Secondary $SecondaryPassword
        $null = Invoke-Restic 'offline-check-read-data' $Secondary $SecondaryPassword @('check', '--read-data', '--no-lock')
        $Result.snapshots = $ids
        $Result.restored = Restore-Verified 'offline' $Secondary $SecondaryPassword $ids $Manifests
        $Result.physical_recovery = 'PASS - other computer attested by maintainer; adapter and route checks passed'
    } else {
        $Stage = 'verify-source-before-write'
        $null = Confirm-Fixture $Source $Manifests.initial
        foreach ($unused in @($PrimaryPassword, $SecondaryPassword, $WrongPassword, $Secondary, $LocalBackend)) {
            Assert-Lab (!(Test-Path -LiteralPath $unused)) 'lab-artifact-already-exists'
        }
        if ($Phase -eq 'Run') {
            $Stage = 'verify-preflight'
            $preflight = Join-Path $Root 'Preflight-result.json'
            $binding = Join-Path $Root 'preflight-config-sha'
            Assert-Lab ((Test-Path -LiteralPath $preflight) -and (Test-Path -LiteralPath $binding)) 'preflight-required'
            $null = Assert-Entry $preflight
            $null = Assert-Entry $binding
            $null = Read-DriveToken
            $verified = Get-Content -Raw -LiteralPath $preflight | ConvertFrom-Json
            Assert-Lab ($verified.status -ceq 'PASS' -and $verified.remote_folder -ceq $Lab -and
                $verified.production_controls_attested -eq $true -and $verified.dedicated_account_confirmed -eq $true -and
                $verified.oauth_client -ceq 'own-desktop' -and
                $verified.scope -ceq 'drive.file' -and $verified.script_sha256 -ceq $Result.script_sha256 -and
                (Get-Sha $Config) -ceq [IO.File]::ReadAllText($binding)) 'preflight-or-oauth-config-changed'
            $confirm = Read-Host "Confirme a conta exclusiva e o destino $Lab/repository. Digite exatamente $Lab"
            Assert-Lab ($confirm -ceq $Lab) 'destination-unconfirmed'
            $Result.remote_folder = $Lab
            $Result.quota_before = Get-Quota 'quota-before-upload' -BeforeWrite
            Assert-Lab (@(Get-LabFolders).Count -eq 0) 'remote-folder-already-exists'
            $script:WriteStarted = $true
            $null = Invoke-Drive 'mkdir-lab-folder' @('mkdir', ($Remote + $Lab))
            $folders = @(Get-LabFolders)
            Assert-Lab ($folders.Count -eq 1 -and $folders[0].IsDir -and $folders[0].ID -cmatch '^[A-Za-z0-9_-]+$') 'created-folder-ambiguous'
            $script:FolderId = $folders[0].ID
            $primary = 'rclone:gg02d:repository'
            $Result.backend = 'Google Drive; drive.file; fixed folder ID; append-only'
        } else {
            Assert-Lab (!(Test-Path -LiteralPath $Config)) 'oauth-config-present-local-test'
            $script:WriteStarted = $true
            New-FreshDirectory $LocalBackend
            $primary = 'rclone:' + $LocalBackend.Replace('\', '/')
            $Result.backend = 'local filesystem via Rclone stdio; no Google Drive'
        }
        $Stage = 'new-credentials'
        New-PasswordFile $PrimaryPassword
        New-PasswordFile $SecondaryPassword
        New-PasswordFile $WrongPassword
        Assert-Lab (@(@($PrimaryPassword, $SecondaryPassword, $WrongPassword) | ForEach-Object { Get-Sha $_ } | Select-Object -Unique).Count -eq 3) 'passwords-not-distinct'
        $null = Invoke-Restic 'primary-init' $primary $PrimaryPassword @('init', '--repository-version', '2')
        $prior = Get-RepoSize 'primary-size-after-init'
        $Result.repository_empty_bytes = $prior
        $Result.backups = [ordered]@{}
        foreach ($tag in @('initial', 'unchanged', 'changed')) {
            $Stage = "validate-source-$tag"
            if ($tag -eq 'changed') { Set-FixtureDelta $Initial $Changed }
            $expected = if ($tag -eq 'changed') { $Manifests.changed } else { $Manifests.initial }
            $null = Confirm-Fixture $Source $expected
            $output = Invoke-Restic "primary-backup-$tag" $primary $PrimaryPassword @('backup', '--json', '--compression', 'off', '--host', 'gg02d-synthetic', '--tag', "gg02d-$tag", 'source')
            $summaries = @(foreach ($line in ($output -split '\r?\n')) {
                if ($line -match '^\{') {
                    $json = $line | ConvertFrom-Json
                    if ($json.message_type -ceq 'summary') { $json }
                }
            })
            Assert-Lab ($summaries.Count -eq 1 -and $summaries[0].snapshot_id -cmatch '^[0-9a-f]{8,64}$') 'backup-summary-invalid'
            $summary = $summaries[0]
            Assert-Lab ($tag -ne 'unchanged' -or $summary.data_blobs -eq 0) 'unchanged-backup-added-data-blobs'
            $bytes = Get-RepoSize "primary-size-after-$tag"
            Assert-Lab ($bytes -gt $prior) 'repository-size-did-not-grow'
            $Result.backups[$tag] = [ordered]@{
                snapshot = $summary.snapshot_id; logical_bytes = $summary.total_bytes_processed
                data_blobs = $summary.data_blobs; data_added_packed = $summary.data_added_packed
                repository_bytes = $bytes; new_persisted_payload_bytes = $bytes - $prior
            }
            Add-Evidence @{ operation = "primary-backup-result-$tag"; metrics = $Result.backups[$tag] }
            $prior = $bytes
        }
        $ids = Get-Snapshots 'primary' $primary $PrimaryPassword
        $Result.snapshots = $ids
        foreach ($tag in $ids.Keys) {
            Assert-Lab ($ids[$tag].StartsWith($Result.backups[$tag].snapshot)) 'snapshot-summary-id-mismatch'
        }
        $null = Invoke-Restic 'primary-check-read-data' $primary $PrimaryPassword @('check', '--read-data', '--no-lock')
        $Result.primary_restored = Restore-Verified 'primary' $primary $PrimaryPassword $ids $Manifests
        $null = Invoke-Restic 'primary-rejects-wrong-password' $primary $WrongPassword @('snapshots', '--no-lock') 12
        $Result.wrong_password = 'PASS (Restic exit 12)'
        if ($Phase -eq 'Run') {
            $Result.quota_after = Get-Quota 'quota-after-primary'
            $Result.free_quota_delta_bytes = $Result.quota_before.free - $Result.quota_after.free
        }
        $secondaryTransport = 'rclone:' + $Secondary.Replace('\', '/')
        $null = Invoke-Restic 'secondary-init' $secondaryTransport $SecondaryPassword @('init', '--repository-version', '2')
        $null = Invoke-Restic 'secondary-copy' $secondaryTransport $SecondaryPassword (@('copy', '--no-lock', '--from-repo', $primary, '--from-password-file', $PrimaryPassword) + @($ids.Values))
        $secondaryIds = Get-Snapshots 'secondary' $Secondary $SecondaryPassword
        $null = Invoke-Restic 'secondary-check-read-data' $Secondary $SecondaryPassword @('check', '--read-data', '--no-lock')
        $null = Invoke-Restic 'secondary-rejects-primary-password' $Secondary $PrimaryPassword @('snapshots', '--no-lock') 12
        $Result.secondary_snapshots = $secondaryIds
        $Result.secondary_restored = Restore-Verified 'secondary' $Secondary $SecondaryPassword $secondaryIds $Manifests
        $Result.physical_recovery = 'BLOCKED until separately verified on an authorized offline computer'
    }
    $Result.status = 'PASS'
    Save-Result
    Write-Host "PASS $Phase $Lab"
} catch {
    $Result.status = if ($WriteStarted) { 'FAIL' } else { 'BLOCKED' }
    $Result.stage = $Stage
    $Result.reason = $Reason
    if ($null -ne $Evidence) {
        try { Save-Result } catch { Write-Host 'Evidencia final indisponivel; artefatos preservados.' }
    }
    Write-Host "$($Result.status) $Phase $Lab [$Stage / $Reason]"
    if ($Phase -eq 'Preflight') {
        Write-Host 'Preserve este ensaio. Uma nova tentativa exige Prepare e outro UUID. Execute Run somente apos um novo Preflight PASS.'
    }
    exit 1
}
