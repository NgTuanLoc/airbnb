#Requires -Version 7.2
<#
.SYNOPSIS
    Scans the repo with a local SonarQube: the .NET solutions (backend and services) and the frontend.

.DESCRIPTION
    Runs SonarQube Community Build in Docker, runs the tests for coverage, scans, waits for the server to process each
    analysis, then prints the quality gate and a summary and writes every open issue to
    tools/sonar/.local/issues-<project>.json. See tools/sonar/README.md.

.EXAMPLE
    ./tools/sonar/scan.ps1                  # scan both projects, with the tests' coverage
    ./tools/sonar/scan.ps1 -Only frontend   # or dotnet
    ./tools/sonar/scan.ps1 -SkipTests       # faster: reuse the coverage of the last run that ran the tests
    ./tools/sonar/scan.ps1 -Rules core      # a smaller rule set (default: comprehensive)
    ./tools/sonar/scan.ps1 -IssuesOnly      # print and export the issues of the last scans again
    ./tools/sonar/scan.ps1 -Stop            # stop the server (-Reset also deletes its data and the local credentials)
#>
[CmdletBinding()]
param(
    [ValidateSet('all', 'dotnet', 'frontend')] [string] $Only = 'all',
    # The built-in "Sonar way" tiers. Comprehensive replaces the former "Sonar way"; the server's own default is core.
    [ValidateSet('core', 'extended', 'comprehensive')] [string] $Rules = 'comprehensive',
    # Coverage is part of the quality gate, so the tests run by default; this reuses the last run's reports instead.
    [switch] $SkipTests,
    [switch] $IssuesOnly,
    [switch] $Stop,
    [switch] $Reset
)

$ErrorActionPreference = 'Stop'

# Pinned versions (README: Upgrading). A new image recreates the server: its embedded database can't be upgraded.
$SonarQubeImage = 'sonarqube:26.10.0.133078-community'
$DotnetScannerVersion = '12.0.0'
$NpmScannerVersion = '5.0.2'

$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$local = Join-Path $PSScriptRoot '.local'
$hostUrl = 'http://localhost:9000'
$container = 'airbnb-sonarqube'
$volumes = 'airbnb-sonarqube-data', 'airbnb-sonarqube-extensions', 'airbnb-sonarqube-logs'
$projects = [ordered]@{ dotnet = 'airbnb-dotnet'; frontend = 'airbnb-frontend' }
$reportTasks = @{
    dotnet   = Join-Path $local 'dotnet/.sonarqube/out/.sonar/report-task.txt'
    frontend = Join-Path $local 'frontend/report-task.txt'
}
$passwordFile = Join-Path $local 'admin-password'
$tokenFile = Join-Path $local 'token'
$coverageNotes = @{}

function Assert-ExitCode([string] $Step) {
    if ($LASTEXITCODE) { throw "$Step failed (exit code $LASTEXITCODE)" }
}

function Get-BasicAuth([string] $UserInfo) {
    'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($UserInfo))
}

function Invoke-Api([string] $Method, [string] $Path, [string] $Auth, [hashtable] $Body = @{}) {
    Invoke-RestMethod -Method $Method -Uri "$hostUrl$Path" -Headers @{ Authorization = $Auth } -Body $Body
}

function Test-Auth([string] $Auth) {
    try { (Invoke-Api GET '/api/authentication/validate' $Auth).valid } catch { $false }
}

function Remove-Server {
    docker rm -f $container 2>$null | Out-Null
    docker volume rm $volumes 2>$null | Out-Null
    Remove-Item -LiteralPath $passwordFile, $tokenFile -ErrorAction SilentlyContinue
}

function Start-Server {
    docker version --format '{{.Server.Version}}' *> $null
    Assert-ExitCode 'Docker (is it running?)'
    $image = docker ps -a --filter "name=^$container$" --format '{{.Image}}'
    if ($image -and $image -ne $SonarQubeImage) {
        Write-Host "The server runs $image; recreating it on $SonarQubeImage (its history and credentials start over)."
        Remove-Server
        $image = $null
    }
    if ($image) {
        docker start $container | Out-Null
        Assert-ExitCode 'docker start'
    } else {
        # Localhost only: until the first scan sets the admin password, it's admin/admin.
        docker run -d --name $container -p 127.0.0.1:9000:9000 -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true `
            -v "$($volumes[0]):/opt/sonarqube/data" -v "$($volumes[1]):/opt/sonarqube/extensions" `
            -v "$($volumes[2]):/opt/sonarqube/logs" $SonarQubeImage | Out-Null
        Assert-ExitCode 'docker run'
    }
    Write-Host 'Waiting for SonarQube...'
    $deadline = (Get-Date).AddMinutes(5)
    while ((Get-Date) -lt $deadline) {
        try {
            if ((Invoke-RestMethod "$hostUrl/api/system/status").status -eq 'UP') { return }
        } catch {
            Write-Verbose "Not answering yet: $($_.Exception.Message)"
        }
        Start-Sleep -Seconds 3
    }
    throw "SonarQube isn't up after 5 minutes: see docker logs $container"
}

# A user token for the scanners and the Web API. The admin password is saved before it's set, so a failure in between
# can't lock anyone out.
function Get-Token {
    if ((Test-Path $tokenFile) -and (Test-Auth "Bearer $(Get-Content -Raw $tokenFile)")) {
        return Get-Content -Raw $tokenFile
    }
    if (-not (Test-Path $passwordFile)) {
        $random = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(16)).ToLowerInvariant()
        # Upper case, lower case, a digit and a symbol, as the server's password policy wants.
        Set-Content -LiteralPath $passwordFile -Value "Sq1-$random" -NoNewline
    }
    $password = Get-Content -Raw $passwordFile
    $admin = Get-BasicAuth "admin:$password"
    if (-not (Test-Auth $admin)) {
        $default = Get-BasicAuth 'admin:admin'
        if (-not (Test-Auth $default)) {
            throw "The admin password in $passwordFile doesn't match the server's. Run with -Reset to start over."
        }
        Invoke-Api POST '/api/users/change_password' $default @{ login = 'admin'; previousPassword = 'admin'; password = $password } | Out-Null
    }
    try { Invoke-Api POST '/api/user_tokens/revoke' $admin @{ name = 'local-scan' } | Out-Null } catch { Write-Verbose 'No token to revoke' }
    $token = (Invoke-Api POST '/api/user_tokens/generate' $admin @{ name = 'local-scan'; type = 'USER_TOKEN' }).token
    Set-Content -LiteralPath $tokenFile -Value $token -NoNewline
    $token
}

# Makes "Sonar way <tier>" the default profile of every language that has one; the projects use the defaults.
function Set-RuleTier([string] $Auth) {
    $name = "Sonar way $Rules"
    (Invoke-Api GET '/api/qualityprofiles/search' $Auth).profiles |
        Where-Object { $_.isBuiltIn -and $_.name -eq $name -and -not $_.isDefault } |
        ForEach-Object { Invoke-Api POST '/api/qualityprofiles/set_default' $Auth @{ language = $_.language; qualityProfile = $name } | Out-Null }
}

function Install-DotnetScanner {
    $tools = Join-Path $local 'tools'
    $installed = dotnet tool list --tool-path $tools 2>$null |
        Select-String "^dotnet-sonarscanner\s+$([regex]::Escape($DotnetScannerVersion))\s"
    if (-not $installed) {
        dotnet tool update dotnet-sonarscanner --tool-path $tools --version $DotnetScannerVersion --allow-downgrade | Out-Null
        Assert-ExitCode 'Installing dotnet-sonarscanner'
    }
    Join-Path $tools ($IsWindows ? 'dotnet-sonarscanner.exe' : 'dotnet-sonarscanner')
}

# Where a project's coverage comes from, judged by the report files there are once the tests (if any) have run.
function Get-CoverageNote([IO.FileInfo[]] $Reports) {
    if (-not $Reports) { return $SkipTests ? 'none (run once without -SkipTests)' : 'none (the tests wrote no report)' }
    if (-not $SkipTests) { return "from this run's tests" }
    "reused from the tests run $(($Reports | Measure-Object LastWriteTime -Maximum).Maximum.ToString('yyyy-MM-dd HH:mm'))"
}

function Invoke-DotnetScan([string] $Token) {
    $scanner = Install-DotnetScanner
    $work = Join-Path $local 'dotnet'
    $artifacts = Join-Path $local 'artifacts'
    $coverageDir = Join-Path $local 'coverage'
    $solutions = @(Get-Item (Join-Path $root 'backend/Airbnb.slnx')) + @(Get-ChildItem (Join-Path $root 'services/*/*.slnx'))
    # Unit and integration tests. The architecture tests run no product code; the AppHost smoke test needs the whole stack.
    $testProjects = Get-ChildItem (Join-Path $root 'backend/tests/*/*.csproj'), (Join-Path $root 'services/*/tests/*/*.csproj') |
        Where-Object BaseName -NotMatch 'ArchitectureTests|AppHost\.Tests'

    $begin = @(
        'begin', "/k:$($projects.dotnet)", '/n:Airbnb .NET (backend and services)',
        "/d:sonar.host.url=$hostUrl", "/d:sonar.token=$Token",
        # From the repo root, so the scan also covers its other files (Docker, YAML, scripts, secrets in config),
        # except the frontend, which is its own project (its test files too: exclusions only apply to sources).
        "/d:sonar.projectBaseDir=$root", '/d:sonar.exclusions=frontend/**,**/Migrations/**', '/d:sonar.test.exclusions=frontend/**'
    )
    # Without a report the C# analysis counts every executable line as uncovered (0%), failing the gate's coverage
    # condition: this run's tests write the reports, or -SkipTests reuses the last ones.
    $coverageReports = Join-Path $coverageDir '*.xml'
    if ($SkipTests) {
        $reports = @(Get-ChildItem $coverageReports -ErrorAction SilentlyContinue).FullName
    } else {
        Remove-Item $coverageDir -Recurse -Force -ErrorAction SilentlyContinue
        $reports = $testProjects | ForEach-Object { Join-Path $coverageDir "$($_.BaseName).xml" }
    }
    if ($reports) { $begin += "/d:sonar.cs.vscoveragexml.reportsPaths=$($reports -join ',')" }

    # begin, the builds and end run in .local/dotnet: .sonarqube/ stays out of the repo, and the copy of backend's
    # global.json picks the SDK and test runner every solution pins (the repo root may resolve a newer, preview SDK).
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force $work | Out-Null
    Copy-Item (Join-Path $root 'backend/global.json') $work
    Push-Location $work
    try {
        & $scanner @begin
        Assert-ExitCode 'dotnet-sonarscanner begin'
        foreach ($solution in $solutions) {
            # Its own output folder: no clash with a running Aspire stack's locked files or the IDE's builds.
            dotnet build $solution.FullName --no-incremental --artifacts-path $artifacts -nologo -v q
            Assert-ExitCode "Building $($solution.Name)"
        }
        if (-not $SkipTests) {
            foreach ($project in $testProjects) {
                Write-Host "Testing $($project.BaseName)..."
                dotnet test --project $project.FullName --no-build --artifacts-path $artifacts --results-directory $coverageDir `
                    --coverage --coverage-output-format xml --coverage-output "$($project.BaseName).xml"
                # Failing tests still leave their coverage behind: the analysis goes on.
                if ($LASTEXITCODE) { Write-Warning "$($project.BaseName): tests failed (exit code $LASTEXITCODE)" }
            }
        }
        $coverageNotes.dotnet = Get-CoverageNote @(Get-ChildItem $coverageReports -ErrorAction SilentlyContinue)
        & $scanner end "/d:sonar.token=$Token"
        Assert-ExitCode 'dotnet-sonarscanner end'
    } finally {
        Pop-Location
    }
}

function Invoke-FrontendScan([string] $Token) {
    $properties = @(
        "-Dsonar.host.url=$hostUrl", "-Dsonar.token=$Token",
        "-Dsonar.projectKey=$($projects.frontend)", '-Dsonar.projectName=Airbnb frontend',
        # Gitignored files (node_modules, .next, coverage, ...) are skipped, and test files aren't sources.
        '-Dsonar.sources=.', '-Dsonar.tests=.',
        '-Dsonar.test.inclusions=**/*.test.ts,**/*.test.tsx,**/test-*.ts,**/test-*.tsx,vitest.setup.ts,e2e/**',
        "-Dsonar.working.directory=$(Split-Path $reportTasks.frontend)"
    )

    Push-Location (Join-Path $root 'frontend')
    try {
        if (-not $SkipTests) {
            # Vitest clears coverage/ first, so a report left over from an earlier run never stands in for this one.
            npx vitest run --coverage --coverage.reporter=lcovonly
            if ($LASTEXITCODE) { Write-Warning "Frontend tests failed (exit code $LASTEXITCODE)" }
        }
        # The npm scanner picks up coverage/lcov.info by itself; named here so both projects read the same way.
        $lcov = @(Get-Item 'coverage/lcov.info' -ErrorAction SilentlyContinue)
        $coverageNotes.frontend = Get-CoverageNote $lcov
        if ($lcov) { $properties += '-Dsonar.javascript.lcov.reportPaths=coverage/lcov.info' }
        npx --yes "@sonar/scan@$NpmScannerVersion" @properties
        Assert-ExitCode 'Scanning the frontend'
    } finally {
        Pop-Location
    }
}

function Wait-Processing([string] $ReportTask, [string] $Auth) {
    $taskId = (Get-Content $ReportTask | Where-Object { $_ -like 'ceTaskId=*' }) -replace '^ceTaskId='
    do {
        Start-Sleep -Seconds 2
        $task = (Invoke-Api GET '/api/ce/task' $Auth @{ id = $taskId }).task
    } while ($task.status -in 'PENDING', 'IN_PROGRESS')
    if ($task.status -ne 'SUCCESS') { throw "The server couldn't process the analysis ($($task.status)): $($task.errorMessage)" }
}

function Write-Report([string] $Key, [string] $Auth, [string] $CoverageNote) {
    $issues = [Collections.Generic.List[object]]::new()
    $ruleNames = @{}
    for ($page = 1; ; $page++) {
        $result = Invoke-Api GET '/api/issues/search' $Auth @{
            components = $Key; issueStatuses = 'OPEN,CONFIRMED'; additionalFields = 'rules'; ps = 500; p = $page
        }
        $result.issues | ForEach-Object { $issues.Add($_) }
        $result.rules | ForEach-Object { $ruleNames[$_.key] = $_.name }
        # The API returns at most 10,000 issues.
        if ($page * 500 -ge [Math]::Min($result.paging.total, 10000)) { break }
    }
    $rows = @($issues | ForEach-Object {
        [pscustomobject]@{
            file     = $_.component -replace "^$([regex]::Escape($Key)):?", ''
            line     = $_.line
            rule     = $_.rule
            ruleName = $ruleNames[$_.rule]
            impacts  = ($_.impacts | ForEach-Object { "$($_.softwareQuality)/$($_.severity)".ToLowerInvariant() }) -join ', '
            message  = $_.message
        }
    } | Sort-Object file, line)
    $exportFile = Join-Path $local "issues-$Key.json"
    ConvertTo-Json -InputObject $rows -Depth 3 | Set-Content -LiteralPath $exportFile

    $gate = (Invoke-Api GET '/api/qualitygates/project_status' $Auth @{ projectKey = $Key }).projectStatus
    $coverage = ((Invoke-Api GET '/api/measures/component' $Auth @{ component = $Key; metricKeys = 'coverage' }).component.measures |
        Where-Object metric -eq 'coverage').value
    Write-Host "`n== ${Key}: quality gate $($gate.status), $($rows.Count) open issues, coverage $($coverage ? "$coverage%" : 'none')"
    $gate.conditions | Where-Object status -eq 'ERROR' | ForEach-Object {
        Write-Host "   failed condition: $($_.metricKey) is $($_.actualValue) (threshold $($_.errorThreshold))"
    }
    if ($CoverageNote) { Write-Host "   coverage:  $CoverageNote" }
    if ($rows.Count) {
        $issues.impacts | Group-Object softwareQuality, severity | Sort-Object Name |
            Format-Table Count, @{ Label = 'Quality, severity'; Expression = 'Name' } -AutoSize | Out-Host
        $rows | Group-Object rule | Sort-Object Count -Descending | Select-Object -First 20 |
            Format-Table Count, @{ Label = 'Rule'; Expression = 'Name' }, @{ Label = 'Name'; Expression = { $ruleNames[$_.Name] } } -AutoSize |
            Out-Host
    }
    Write-Host "   issues:    $exportFile"
    Write-Host "   dashboard: $hostUrl/dashboard?id=$Key"
}

if ($Reset) {
    Remove-Server
    Write-Host 'Removed the SonarQube container, its data and the local credentials.'
    return
}
if ($Stop) {
    docker stop $container | Out-Null
    return
}

New-Item -ItemType Directory -Force $local | Out-Null
Start-Server
$token = Get-Token
$targets = if ($Only -eq 'all') { $projects.Keys } else { $Only }
if (-not $IssuesOnly) { Set-RuleTier "Bearer $token" }
foreach ($target in $targets) {
    if (-not $IssuesOnly) {
        if ($target -eq 'dotnet') { Invoke-DotnetScan $token } else { Invoke-FrontendScan $token }
        Wait-Processing $reportTasks[$target] "Bearer $token"
    }
    Write-Report $projects[$target] "Bearer $token" $coverageNotes[$target]
}
Write-Host "`nDashboard sign-in: admin, with the password in $passwordFile"
