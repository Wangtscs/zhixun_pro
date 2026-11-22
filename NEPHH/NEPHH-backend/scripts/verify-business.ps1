param([string]$BaseUrl='http://localhost:18081',[string]$Username=$env:ADMIN_USERNAME,[string]$Password=$env:ADMIN_PASSWORD)
$ErrorActionPreference='Stop'
if(-not $Username -or -not $Password){throw 'Provide isolated test credentials through -Username/-Password or ADMIN_USERNAME/ADMIN_PASSWORD.'}
function Call($path,$method='GET',$body=$null,$token=$script:adminToken){
 $parameters=@{Uri="$BaseUrl/api/business$path";Method=$method;Headers=@{Authorization="Bearer $token"};ContentType='application/json'}
 if($null -ne $body){$parameters.Body=ConvertTo-Json -Depth 12 -Compress $body}
 $response=Invoke-RestMethod @parameters
 if($response.code -ne 0){throw "API failure: $path"};return $response.data
}
function Login($username,$password){(Invoke-RestMethod "$BaseUrl/api/auth/login" -Method POST -ContentType application/json -Body (@{username=$username;password=$password}|ConvertTo-Json)).data.accessToken}
function ExpectDenied($path,$method,$body,$token){try{Call $path $method $body $token|Out-Null;throw 'Expected rejection not received'}catch{if($_.Exception.Response.StatusCode.value__ -notin 400,403,409){throw}}}
$script:adminToken=Login $Username $Password
$identity=Call '/identity';if($identity.role -ne 'ADMIN'){throw 'Administrator required'}
$suffix=[DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$areaId=(Call '/areas')[0].id
$node=(Call '/nodes'|Where-Object area_id -eq $areaId|Select-Object -First 1)
$workerName="verify-$suffix"
$worker=Call '/users' POST @{username=$workerName;password='Verify123456789';role='INSPECTOR';displayName='验证巡检员'}
Call "/users/$($worker.id)" PUT @{role='INSPECTOR';enabled=$true;areas=@($areaId);displayName='验证巡检员'}|Out-Null
$workerToken=Login $workerName 'Verify123456789'
ExpectDenied '/users' POST @{username='forbidden';password='Verify123456789';role='ADMIN'} $workerToken
Call '/rules' POST @{areaId=$areaId;metric='methane';threshold=35;durationSeconds=0;severity='HIGH';enabled=$true}|Out-Null
Call "/nodes/$($node.id)/simulate" POST @{scenario='normal'}|Out-Null
Call "/nodes/$($node.id)/simulate" POST @{scenario='gas'}|Out-Null
$alarm=Call '/alarms'|Where-Object { $_.node_id -eq $node.id -and !$_.recovered_at }|Select-Object -First 1
if(!$alarm){throw 'Simulation did not create alarm'}
$message=@{messageId="verify-$suffix";source='SIMULATOR';collectedAt=[DateTime]::UtcNow.ToString('o');values=@{methane=48}}
$first=Call "/nodes/$($node.id)/telemetry" POST $message
$repeat=Call "/nodes/$($node.id)/telemetry" POST $message
if($first.inserted -ne 1 -or $repeat.inserted -ne 0){throw 'Duplicate ingestion failed'}
Call "/alarms/$($alarm.id)/acknowledge" POST @{note='验证告警确认'}|Out-Null
$order=Call '/orders' POST @{nodeId=$node.id;alarmId=$alarm.id;title="验证流程 $suffix";priority='HIGH';description='自动集成验证'}
Call "/orders/$($order.id)/assign" POST @{assigneeId=$worker.id;priority='HIGH';note='验证派发'}|Out-Null
ExpectDenied "/orders/$($order.id)/action" POST @{action='approve';note='非法提前复核'} $adminToken
foreach($action in @('accept','start')){Call "/orders/$($order.id)/action" POST @{action=$action;note='集成验证'} $workerToken|Out-Null}
Call "/orders/$($order.id)/action" POST @{action='submit';result='现场排查完成';readings='甲烷12 %LEL';note='提交'} $workerToken|Out-Null
ExpectDenied "/orders/$($order.id)/action" POST @{action='approve';note='不允许自行复核'} $workerToken
Call "/orders/$($order.id)/action" POST @{action='reject';note='请补充检查记录'}|Out-Null
Call "/orders/$($order.id)/action" POST @{action='submit';result='已补充检查记录';readings='甲烷12 %LEL';note='重新提交'} $workerToken|Out-Null
Call "/orders/$($order.id)/action" POST @{action='approve';note='复核完成'}|Out-Null
$detail=Call "/orders/$($order.id)"
if($detail.status -ne 'COMPLETED' -or $detail.events.Count -lt 8){throw 'Order workflow incomplete'}
$plan=Call '/patrol/plans' POST @{name="验证巡检 $suffix";areaId=$areaId;assigneeId=$worker.id;periodHours=24;points=@(@{nodeId=$node.id;checkItems='检查外观及读数'})}
$run=Call "/patrol/plans/$($plan.id)/generate" POST
$runDetail=Call "/patrol/runs/$($run.id)" GET $null $workerToken
Call "/patrol/results/$($runDetail.points[0].id)" POST @{result='现场检查无异常';abnormal=$false} $workerToken|Out-Null
$finished=Call "/patrol/runs/$($run.id)"
if($finished.status -ne 'COMPLETED'){throw 'Patrol not completed'}
Call "/patrol/plans/$($plan.id)/enabled" POST @{enabled=$false}|Out-Null
$stats=Call '/statistics';$audit=Call '/audit';$messages=Call '/notifications' GET $null $workerToken
if(!$audit.Count -or !$messages.Count){throw 'Missing audit or notifications'}
Call "/users/$($worker.id)" PUT @{role='INSPECTOR';enabled=$false;areas=@($areaId);displayName='验证账号（已停用）'}|Out-Null
try{Call '/identity' GET $null $workerToken|Out-Null;throw 'Disabled account accepted'}catch{if($_.Exception.Response.StatusCode.value__ -ne 401){throw}}
[pscustomobject]@{Passed=$true;OrderId=$order.id;PatrolRunId=$run.id;DuplicateRejected=$true;PermissionsChecked=$true;DisabledAccountRejected=$true}
