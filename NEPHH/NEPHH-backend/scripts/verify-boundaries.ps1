param([string]$BaseUrl='http://localhost:18081')
$ErrorActionPreference='Stop'
$r=Invoke-RestMethod "$BaseUrl/api/auth/login" -Method POST -ContentType application/json -Body '{"username":"admin","password":"123456789012"}'
$h=@{Authorization="Bearer $($r.data.accessToken)"}
function Call($path,$body=$null){$p=@{Uri="$BaseUrl/api/business$path";Headers=$h;ContentType='application/json'};if($null -ne $body){$p.Method='POST';$p.Body=ConvertTo-Json $body -Depth 10 -Compress};(Invoke-RestMethod @p).data}
$suffix=[DateTimeOffset]::Now.ToUnixTimeMilliseconds()
Call '/areas' @{name="边界验证$suffix"}|Out-Null
$area=(Call '/areas'|Where-Object name -eq "边界验证$suffix").id
$node=Call '/nodes' @{areaId=$area;code="BOUND-$suffix";location='自动验证节点'}
Call '/rules' @{areaId=$area;metric='methane';threshold=35;durationSeconds=5;severity='HIGH';enabled=$true}|Out-Null
$clock=[DateTime]::UtcNow.AddSeconds(-12)
foreach($offset in @(0,6,12)){Call "/nodes/$($node.id)/telemetry" @{messageId="duration-$offset";source='SIMULATOR';collectedAt=$clock.AddSeconds($offset).ToString('o');values=@{methane=48}}|Out-Null}
$active=@(Call '/alarms'|Where-Object {$_.node_id -eq $node.id -and $_.metric -eq 'methane' -and !$_.recovered_at})
if($active.Count -ne 1){throw "持续异常去重失败：$($active.Count)"}
Call "/nodes/$($node.id)/simulate" @{scenario='normal'}|Out-Null
$active=@(Call '/alarms'|Where-Object {$_.node_id -eq $node.id -and $_.metric -eq 'methane' -and !$_.recovered_at})
if($active.Count){throw '恢复失败'}
Call "/nodes/$($node.id)/simulate" @{scenario='offline'}|Out-Null
Call "/nodes/$($node.id)/telemetry" @{messageId='late';source='SIMULATOR';collectedAt=[DateTime]::UtcNow.AddDays(-4).ToString('o');values=@{methane=12}}|Out-Null
$active=@(Call '/alarms'|Where-Object {$_.node_id -eq $node.id -and $_.metric -eq 'offline' -and !$_.recovered_at})
if($active.Count -ne 1){throw '历史补传错误地解除离线'}
Call "/nodes/$($node.id)/simulate" @{scenario='normal'}|Out-Null
$active=@(Call '/alarms'|Where-Object {$_.node_id -eq $node.id -and !$_.recovered_at})
if($active.Count){throw '离线恢复失败'}
try{Call "/nodes/$($node.id)/telemetry" @{messageId='bad';source='SIMULATOR';collectedAt=[DateTime]::UtcNow.ToString('o');values=@{humidity=150}}|Out-Null;throw '非法百分比未拒绝'}catch{if($_.Exception.Response.StatusCode.value__ -ne 400){throw}}
[pscustomobject]@{Passed=$true;DurationAlarm=$true;Recovered=$true;LateDataKeptOffline=$true;InvalidValueRejected=$true;NodeId=$node.id}
