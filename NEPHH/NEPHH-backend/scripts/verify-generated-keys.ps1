param([string]$JavaDirectory='C:\PyCharm\PyCharm 2026.2.3\jbr')
$ErrorActionPreference='Stop'
$backend=Split-Path $PSScriptRoot
$runtime=Join-Path (Split-Path $backend) '.nephh-runtime'
$output=Join-Path $runtime 'checks\generated-keys'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$classpath=(Join-Path $backend 'target\classes')+';'+(Join-Path $runtime 'lib\*')
$source=Join-Path $backend 'src\main\java\com\nephh\business\AccessService.java'
$test=Join-Path $backend 'src\test\java\com\nephh\business\AccessServiceGeneratedKeysRegression.java'
& (Join-Path $JavaDirectory 'bin\javac.exe') -encoding UTF-8 -cp $classpath -d $output $source $test
if($LASTEXITCODE -ne 0){throw 'Generated key regression compilation failed'}
& (Join-Path $JavaDirectory 'bin\java.exe') -cp ($output+';'+$classpath) com.nephh.business.AccessServiceGeneratedKeysRegression
if($LASTEXITCODE -ne 0){throw 'Generated key regression failed'}
