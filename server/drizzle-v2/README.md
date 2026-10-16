# Drizzle v2 migration preparation

The baseline has passed seven isolated migration tests and the offline schema
generation check. The permanent runner **has not been executed**. Its offline
type-check and harmless launcher checks have passed; database behavior remains
untested. Testing it on a disposable database requires the next approval.
Adoption on the original `kalima` requires a later approval.

V2 is not the default migration system. `drizzle.config.ts`, `package.json`, the
canonical schema and historical migrations remain unchanged. **Do not use
`npm run db:migrate`: it still selects the historical chain containing DROP.**

## Files and installed tooling

- `../drizzle-v2.config.ts`: credential-free canonical schema, `./drizzle-v2`,
  and `drizzle.__drizzle_migrations_v2`; no dotenv import.
- `0000_vocabulary_baseline.sql`: frozen guarded baseline.
- `meta/0000_snapshot.json` and `meta/_journal.json`: generated metadata, one
  baseline entry with journal timestamp `1792050962769`.
- `../scripts/migrate-v2.ts`: new explicit-target initial-adoption runner.
- Installed Drizzle Kit **0.31.11**, Drizzle ORM **0.45.3**, Node.js
  **24.21.0** and `tsx` **4.23.15**. The manual launcher uses these installed
  tools; do not install dependencies.

## Completed tests

These tests used the baseline and earlier harnesses, not the new permanent runner.

| Test | Verified result |
| --- | --- |
| Fresh database | Eight columns; vocabulary empty; one v2 record; no historical ledger |
| Existing database adoption | 20 records, UUIDs, contents, three historical records, sequence and protected schema preserved; one v2 record |
| Repeat run | Baseline not executed again; protected data/metadata unchanged; one v2 record |
| Extra vocabulary index | Expected rejection; data/metadata and intentional index preserved; zero successful v2 records |
| Historical hash mismatch | Expected rejection; intentional hash change and other protected state preserved; zero successful v2 records |
| Extra vocabulary column | Expected rejection; original eight-column contents and other protected state preserved; zero successful v2 records |
| Missing vocabulary name with historical ledger | Expected rejection; renamed original table/data preserved; no replacement vocabulary table; zero successful v2 records |

The complete backup also passed isolated restoration and comparison of records,
UUIDs, contents, historical records/sequence, structure, ownership and permissions.

Offline generation used Kit **0.31.11** in a disposable filesystem copy, exited
**0**, and reported **"No schema changes, nothing to migrate"**. It generated
zero SQL migrations, snapshots or journal entries. The eight-column canonical
schema matched the snapshot, and original/copy checksums remained unchanged. That
verification made no database connections and read no project secrets.

The permanent runner separately passed strict TypeScript **7.0.2** no-output
type-checking with exit code **0**. The corrected launcher passed Windows
PowerShell **5.1.26100.9711** syntax parsing with zero errors and these harmless
TypeScript-program checks using Node **24.21.0** and tsx **4.23.15**:

| Launcher-only check | Result |
| --- | --- |
| Normal completion | Exit code 0 and required completion marker accepted |
| Nonzero exit | Exit code 7 rejected and reported without raw output |
| Missing completion marker | Rejected despite exit code 0 |
| Unexpected stderr | Rejected without exposing private fixture output |
| Execution timeout | Direct Node process terminated and exit confirmed |
| Injected managed launcher failure | Direct Node process terminated and exit confirmed; observed native compiler helper also exited |

These checks extracted the documented functions, substituted only a harmless
temporary program for the main-script path, and used dummy stdin input instead
of credentials. The timeout check shortened only the in-memory test wait to
1.5 seconds. Parent/PID checks confirmed no intermediate Node wrapper, and every
probe's Node process had exited afterward. Private dummy input/error markers
were not exposed. No migration runner, database code or project secrets were
loaded; temporary fixtures were removed. These are launcher tests, not migration
runner database tests.

Frozen SHA-256 checksums:

| File | SHA-256 |
| --- | --- |
| `0000_vocabulary_baseline.sql` | `2c62fcff59ae679fe38c318c9294917bdbee578c386faa3fea2f024db31dcf80` |
| `meta/0000_snapshot.json` | `a16c330aec10c803a69271274d485208c67cc34f781addf142d92cb798ca3ccb` |
| `meta/_journal.json` | `21dd705616046737d5c5b1bbc59e90497c6fa6836ece9cb97337aa03b6543307` |
| `../drizzle-v2.config.ts` | `23c008ffef8040799f48559d89ede74e74223cf5fed4bb37d9c53d5fa1c5fc0f` |
| `../src/db/schema.ts` | `1d7277022489153ef065acedf17bfe9e4ccde31d92293a6ada41273f50530056` |

The runner checks these exact bytes before importing the v2 configuration and
again before/after migration. Comments, formatting and checkout line-ending
changes can therefore cause refusal. Do not update pins to bypass a failure.

## Baseline versus runner scope

The baseline SQL supports both a genuinely fresh installation and adoption of the
verified existing installation. Vocabulary and the historical ledger must both
exist or both be absent. Unexpected public relations or incompatible checked
structure cause rejection. The existing path validates approved historical
hashes/timestamps and the vocabulary structure without rewriting records.

Checks cover column order/names/types/nullability/defaults, identity/generated
settings, collations, table properties, inheritance, primary key, indexes,
constraints, user triggers, policies and rules. PostgreSQL 18 NOT NULL catalog
constraints are allowed. Vocabulary UUIDs are never reassigned.

The permanent runner is deliberately narrower: **initial adoption of an existing
20-word database only**, with required `--adopt-existing`. Fresh databases, an
existing v2 ledger (even empty), orphaned v2 sequence/index metadata, repeat
adoption and extra migration files are refused. Future additive
migration/repeat-run support requires a reviewed
extension; do not weaken checks to bypass rejection.

Required CLI options are `--adopt-existing`, `--host`, `--port`, `--user` and
`--database`. Host must be `localhost`, `127.0.0.1` or `::1`, and port must be
`5432`. Allowed database names are:

- `kalima`, requiring both `--allow-original-kalima` and exact stdin confirmation
  `ADOPT kalima WITH DRIZZLE V2`;
- `kalima_v2_adoption_test_<yyyyMMdd_HHmmss>_<8 lowercase hex characters>`;
- `kalima_v2_runner_test_<yyyyMMdd_HHmmss>_<8 lowercase hex characters>`.

`localhost` is normalized to literal `127.0.0.1`, avoiding hostname resolution.
The connected server must be PostgreSQL 18 on that loopback endpoint and port;
the database, current role and session role must match the explicit arguments.

A permitted name does not prove that its current state is appropriate. Earlier
successful adoption databases already have v2 metadata and will be refused.
Prepare a newly restored runner-test database only after approval.

The runner verifies database identity, fixed folder/ledger, frozen checksums,
one baseline, 20 distinct vocabulary IDs, three approved historical records and
expected schema. It captures before/after UUID and content fingerprints,
historical records, historical sequence, table identities, structure, ownership
and permissions. Reports contain aggregate evidence, not individual vocabulary
contents, historical hashes or passwords. A session advisory lock serializes
cooperating runners; application writes and other migration processes must still
be paused throughout the operation.

Importing the runner does not execute its main function. It imports no
application database module or dotenv configuration. The legacy configuration is
never used as a fallback. This script is outside the normal application startup.

## Manual PowerShell launcher - not authorized to run yet

**Do not execute this during file preparation.** The next approved action is a
test of this runner on a newly restored disposable database. This helper creates,
restores and deletes no database. Run in a normal PowerShell terminal.

The launcher starts the runner directly with installed Node's `--import` and
the absolute file URL of the installed tsx loader. It does not invoke the tsx
CLI: the tracked process is the actual Node migration process, with no second
Node wrapper/runner. A native esbuild compiler helper may still run; it does not
execute migrations. A small environment allowlist excludes inherited
`NODE_OPTIONS`, `NODE_PATH`, `PG*`, `DATABASE_URL` and password variables.
Compiler caching is disabled. The password is read with
`Read-Host -AsSecureString`, encoded and sent in one JSON line through redirected
stdin. It is never an argument, environment variable or file. Base64 is encoding,
not encryption; immutable password strings temporarily exist in process memory.
Do not print the payload or enable password/debug logging.

```powershell
Set-Location 'C:\Users\Soaib\Desktop\kalima\server'

# Windows command-line escaping, including embedded quotes/backslashes.
function ConvertTo-KalimaWindowsArgument([string]$Value) {
    $quoted = '"'
    $slashes = 0
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '\') { $slashes++; continue }
        if ($character -eq '"') {
            $quoted += ('\' * (2 * $slashes + 1)) + '"'
        } else {
            $quoted += ('\' * $slashes) + $character
        }
        $slashes = 0
    }
    return $quoted + ('\' * (2 * $slashes)) + '"'
}

function Invoke-KalimaV2Adoption {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [switch]$AllowOriginalKalima
    )
    $ErrorActionPreference = 'Stop'
    $serverDirectory = 'C:\Users\Soaib\Desktop\kalima\server'
    $nodePath = (Get-Command node -CommandType Application).Source
    $tsxLoaderUri = [Uri]::new(
        (Join-Path $serverDirectory 'node_modules\tsx\dist\loader.mjs')
    ).AbsoluteUri
    $kalimaHost = Read-Host 'Local PostgreSQL host'
    $kalimaPort = Read-Host 'PostgreSQL port (5432)'
    $kalimaUser = Read-Host 'PostgreSQL username'
    $testNamePattern = '^kalima_v2_(?:adoption_test|runner_test)_\d{8}_\d{6}_[0-9a-f]{8}$'
    if (@('localhost', '127.0.0.1', '::1') -cnotcontains $kalimaHost -or
        $kalimaPort -cne '5432' -or
        $kalimaUser -cnotmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$' -or
        ($Database -cne 'kalima' -and $Database -cnotmatch $testNamePattern)) {
        throw 'Unexpected connection target or database name; runner was not started.'
    }
    $confirmation = ''
    $arguments = @(
        '--import', $tsxLoaderUri,
        (Join-Path $serverDirectory 'scripts\migrate-v2.ts'),
        '--adopt-existing',
        '--host', $kalimaHost, '--port', $kalimaPort,
        '--user', $kalimaUser, '--database', $Database
    )
    if ($Database -ceq 'kalima') {
        if (-not $AllowOriginalKalima) {
            throw 'Original database requires separate approval and the explicit switch.'
        }
        $arguments += '--allow-original-kalima'
        $confirmation = Read-Host 'Type ADOPT kalima WITH DRIZZLE V2 to confirm'
        if ($confirmation -cne 'ADOPT kalima WITH DRIZZLE V2') {
            throw 'Confirmation did not match; runner was not started.'
        }
    } elseif ($AllowOriginalKalima) {
        throw 'Original-database switch is valid only for kalima.'
    }

    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $nodePath
    $start.WorkingDirectory = $serverDirectory
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.Arguments = ($arguments | ForEach-Object {
        ConvertTo-KalimaWindowsArgument $_
    }) -join ' '
    $start.EnvironmentVariables.Clear()
    foreach ($key in @('SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP')) {
        $value = [Environment]::GetEnvironmentVariable($key)
        if ($null -ne $value) { $start.EnvironmentVariables[$key] = $value }
    }
    $start.EnvironmentVariables['PATH'] =
        (Split-Path -Parent $nodePath) + ';' +
        (Join-Path $env:SystemRoot 'System32')
    $start.EnvironmentVariables['TSX_DISABLE_CACHE'] = '1'
    $start.EnvironmentVariables['ESBUILD_WORKER_THREADS'] = '0'

    $secret = $null
    $pointer = [IntPtr]::Zero
    $passwordBytes = $null
    $encodedPassword = $null
    $payload = $null
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    $processStarted = $false
    $trackedPid = $null
    $cleanupFailed = $false
    $failure = $null
    $launcherStage = 'secure input'
    try {
        $secret = Read-Host 'PostgreSQL password' -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $passwordBytes = [Text.Encoding]::UTF8.GetBytes(
            [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        )
        $encodedPassword = [Convert]::ToBase64String($passwordBytes)
        $payload = @{
            passwordBase64 = $encodedPassword
            confirmation = $confirmation
        } | ConvertTo-Json -Compress
        $launcherStage = 'process start'
        $processStarted = $process.Start()
        if (-not $processStarted) { throw 'Could not start the runner.' }
        $trackedPid = $process.Id
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $launcherStage = 'stdin delivery'
        $process.StandardInput.WriteLine($payload)
        $process.StandardInput.Close()
        $launcherStage = 'execution wait (maximum 180 seconds)'
        if (-not $process.WaitForExit(180000)) {
            throw 'Runner exceeded the execution limit.'
        }
        $launcherStage = 'output completion'
        if (-not $stdoutTask.Wait(5000) -or -not $stderrTask.Wait(5000)) {
            throw 'Runner output did not finish within the limit.'
        }
        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        $launcherStage = 'exit-code verification'
        if ($process.ExitCode -ne 0) {
            throw 'Runner returned a failure exit code.'
        }
        $launcherStage = 'completion verification'
        if (-not [string]::IsNullOrWhiteSpace($stderr)) {
            throw 'Unexpected runtime stderr; retain the database and investigate.'
        }
        $passLines = @([regex]::Split($stdout, '\r?\n') | Where-Object {
            $_ -ceq 'PASS: v2 initial adoption and preservation checks completed.'
        })
        if ($passLines.Count -ne 1) {
            throw 'Runner did not confirm successful completion; retain the database.'
        }
    } catch {
        # Never display raw exceptions, stdin payload, SQL, stdout or stderr on
        # failure. Only a fixed stage and, when available, numeric exit code.
        $failure = "Launcher or runner failed during $launcherStage; retain the database."
        try {
            if ($processStarted -and $process.HasExited) {
                $failure += " Process exit code: $($process.ExitCode)."
            }
        } catch {
            # The termination check below remains authoritative.
        }
    } finally {
        # Kill only our directly tracked Node process if still running, then
        # confirm its exit. Do not signal a PID obtained from a later lookup.
        try {
            if ($processStarted) {
                if (-not $process.HasExited) {
                    try { $process.Kill() } catch {
                        # An exit between HasExited and Kill is harmless.
                        if (-not $process.HasExited) { throw }
                    }
                }
                if (-not $process.WaitForExit(5000)) {
                    $cleanupFailed = $true
                }
            }
        } catch {
            $cleanupFailed = $true
        } finally {
            if ($pointer -ne [IntPtr]::Zero) {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            }
            if ($null -ne $passwordBytes) {
                [Array]::Clear($passwordBytes, 0, $passwordBytes.Length)
            }
            $payload = $null
            $encodedPassword = $null
            if ($null -ne $secret) { $secret.Dispose() }
            $process.Dispose()
        }
    }
    if ($cleanupFailed) {
        throw "Could not confirm runner termination (PID $trackedPid); stop and verify the process and database session separately."
    }
    if ($null -ne $failure) { throw $failure }
    Write-Output $stdout
    Write-Output 'Runner exit code: 0'
}

# Only after approval and preparation of an appropriate disposable database:
$approvedTestDatabase = Read-Host 'Exact approved runner-test database name'
Invoke-KalimaV2Adoption -Database $approvedTestDatabase
```

The original-database form is
`Invoke-KalimaV2Adoption -Database kalima -AllowOriginalKalima`. This is
**documentation only**, not permission to run it. It still requires the exact
interactive confirmation, every preflight, and separate original-database
approval. Package scripts remain unchanged; never substitute the historical
`npm run db:migrate` or Drizzle Kit `push`.

The launcher allows 180 seconds for execution and bounded waits for redirected
output and process termination. On a handled launcher failure or timeout, its
`finally` block stops the directly tracked Node process and checks that it has
exited. Failure to confirm termination is reported explicitly, never treated as
success. Raw failure output is suppressed; successful aggregate runner output is
shown only after exit code, completion marker and cleanup checks pass.

This is process cleanup, not a database rollback guarantee. PostgreSQL may take
time to notice a disconnected client, and committed work remains committed.
Forced PowerShell termination, console closure, an operating-system failure or
power loss can bypass `finally`; this launcher cannot guarantee cleanup in those
cases. It does not use a Windows job object or a separate watchdog. After an
abnormal host termination, stop and inspect the local Node process and PostgreSQL
session before taking another action. Do not retry adoption automatically.

## Original-database adoption procedure - pending approval

1. Independently test this permanent runner on a newly restored disposable
   database. Require exit code 0, preservation checks, and one v2 record matching
   the frozen baseline hash and journal timestamp.
2. Review the new runner evidence. Configuration/package activation and adoption
   are separate pending actions; obtain explicit approval for each scope.
3. Pause application writes and other migrations. Confirm the intended local
   server, port, role and exact `kalima` identity. Stop if the approved state of
   20 records, three historical records, schema or v2-ledger absence has changed.
4. Make a new complete, uniquely timestamped custom-format backup immediately
   before adoption with interactive authentication. Require dump exit code 0,
   archive listing/decoding success, recorded SHA-256, and isolated restoration
   verification. Preserve all earlier backups and test databases.
5. Capture counts, UUID/content fingerprints, complete historical records
   internally, historical sequence, table identities, schema, ownership and
   permissions. Rehearse this runner on an isolated restore of the fresh backup.
6. Present the evidence for final approval to adopt `kalima`. Recheck identity
   and fingerprints, then use only this runner with the original-database switch
   and exact confirmation. It creates no backup itself.
7. Require successful preservation verification and exactly one correct v2
   baseline record. Review aggregate evidence before resuming writes.

## Failure handling and limits

- Stop on unexpected errors. Do not retry, repair, edit ledgers, weaken guards,
  reset a database or restore over `kalima` automatically.
- Drizzle creates migration metadata before the baseline transaction. Rejection
  can leave empty v2 metadata; retain it for inspection. This runner refuses
  such an existing ledger. No automatic cleanup is attempted.
- A post-migration verification error does not guarantee that the migration was
  rolled back. Retain the database and investigate before any next step.
- Strict catalog/default/index checks reject unexpected states, including some
  equivalent definitions. Test success is limited to the checked scenarios.
- Keep the frozen files unchanged throughout execution. Rechecks detect drift,
  but the runner does not lock source files against another editor/process.
- Permission comparisons cover protected `public`/`drizzle` schema, relation,
  column and default ACL metadata. They are not an exhaustive audit of every
  cluster role or database-level permission.
- A cooperating-runner advisory lock does not prevent application writes or
  other tools. Pause writes throughout preflight, backup, rehearsal and adoption.
- Host/port restrictions do not authenticate a PostgreSQL server. Confirm the
  local endpoint independently. No Supabase/production connection is authorized.
- The runner is outside the existing server tsconfig's application scope; a
  normal application build alone does not type-check it. Independent runner
  review and approved disposable execution remain required.
- The runner's database behavior remains untested. Passed offline type-checks
  and harmless launcher checks do not establish original-database readiness;
  independent disposable-database tests and adoption approval remain required.

For future offline generation, preserve the previous isolation precautions: the
installed Kit CLI loads dotenv automatically. Use a disposable filesystem copy,
clean child environment, `DOTENV_CONFIG_PATH` pointing to a confirmed nonexistent
file, and disabled compiler caching. Never generate into the real folder merely
to check that the unchanged schema proposes no migration.
