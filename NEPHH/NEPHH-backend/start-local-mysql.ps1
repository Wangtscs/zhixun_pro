$env:SPRING_CONFIG_ADDITIONAL_LOCATION='optional:file:./.local-database.yml'
Set-Location -LiteralPath $PSScriptRoot
& "$PSScriptRoot/mvnw.cmd" spring-boot:run
