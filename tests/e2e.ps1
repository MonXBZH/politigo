# End-to-end check of the running stack in a real (headless) Chrome, driven over the DevTools protocol.
# Usage: powershell -File tests\e2e.ps1 [-Url http://localhost:8080/] [-Out <folder for screenshots>]
# Needs the stack up (docker compose up -d) and POLITIGO_INVITE in .env. Creates two throwaway players.
# Registrations are rate-limited (5 per hour per address): between runs, `docker compose restart api` resets it.
param([string]$Url = "http://localhost:8080/", [string]$Out = $env:TEMP)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$invite = ((Get-Content (Join-Path $root ".env")) | Where-Object { $_ -match '^POLITIGO_INVITE=' }) -replace '^POLITIGO_INVITE=', ''
$suffix = Get-Random -Maximum 99999
$p1 = "Testeur$suffix"; $p2 = "Rival$suffix"; $pw = "motdepasse-e2e"
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$prof = Join-Path $env:TEMP ("pg-e2e-" + [guid]::NewGuid())
$proc = Start-Process $chrome -ArgumentList "--headless=new", "--disable-gpu", "--remote-debugging-port=9333", "--user-data-dir=$prof", "about:blank" -PassThru
$results = New-Object System.Collections.ArrayList
function Check($cond, $name) { [void]$results.Add(("{0} {1}" -f $(if ($cond) { "PASS" } else { "FAIL" }), $name)) }
try {
  $ws = $null
  for ($i = 0; $i -lt 20 -and -not $ws; $i++) { Start-Sleep -Milliseconds 300; try { $ws = ((Invoke-RestMethod http://127.0.0.1:9333/json) | Where-Object { $_.type -eq "page" })[0].webSocketDebuggerUrl } catch {} }
  $sock = New-Object System.Net.WebSockets.ClientWebSocket
  $sock.ConnectAsync([Uri]$ws, [Threading.CancellationToken]::None).Wait()
  $script:id = 0; $script:events = New-Object System.Collections.ArrayList
  function Recv() {
    $buf = New-Object byte[] 4194304; $ms = New-Object IO.MemoryStream
    do { $r = $sock.ReceiveAsync((New-Object ArraySegment[byte] -ArgumentList (, $buf)), [Threading.CancellationToken]::None).Result; $ms.Write($buf, 0, $r.Count) } while (-not $r.EndOfMessage)
    [Text.Encoding]::UTF8.GetString($ms.ToArray())
  }
  function Cdp($method, $params = @{}) {
    $script:id++; $msg = @{ id = $script:id; method = $method; params = $params } | ConvertTo-Json -Depth 20 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $sock.SendAsync((New-Object ArraySegment[byte] -ArgumentList (, $bytes)), "Text", $true, [Threading.CancellationToken]::None).Wait()
    while ($true) { $o = (Recv) | ConvertFrom-Json; if ($o.id -eq $script:id) { return $o }; [void]$script:events.Add($o) }
  }
  function Eval($js) { (Cdp "Runtime.evaluate" @{ expression = $js; awaitPromise = $true; returnByValue = $true }).result.result.value }
  function Shot($name) { $d = (Cdp "Page.captureScreenshot" @{ format = "png" }).result.data; [IO.File]::WriteAllBytes((Join-Path $Out "$name.png"), [Convert]::FromBase64String($d)) }
  function Wait($ms) { [void](Eval "new Promise(r=>setTimeout(r,$ms))") }

  [void](Cdp "Runtime.enable"); [void](Cdp "Log.enable"); [void](Cdp "Page.enable")
  [void](Cdp "Emulation.setDeviceMetricsOverride" @{ width = 390; height = 844; deviceScaleFactor = 2; mobile = $true })
  [void](Cdp "Page.navigate" @{ url = $Url }); Start-Sleep 3
  Check ((Eval "!document.getElementById('auth').hidden") -eq $true) "the login screen shows without a session"
  Shot "e2e-1-auth"

  $reg = @"
(async()=>{document.getElementById('tab-register').click();const f=document.getElementById('form-register');
 f.querySelector('[name=name]').value='$p1';f.querySelector('[name=password]').value='$pw';f.querySelector('[name=invite]').value='$invite';
 document.querySelector('.camp[data-camp=right]').click();f.requestSubmit();
 for(let i=0;i<30&&!document.getElementById('auth').hidden;i++)await new Promise(r=>setTimeout(r,200));
 return document.getElementById('auth').hidden||document.getElementById('auth-error').textContent;})()
"@
  $r = Eval $reg
  Check ($r -eq $true) "registering through the form opens the game ($r)"
  $wrong = Eval "fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Intrus$suffix',password:'$pw',invite:'faux',camp:'left'})}).then(r=>r.status)"
  Check ($wrong -eq 403) "a wrong invite code is refused (got $wrong)"
  # A second player, straight through the API, so the leaderboard has someone to beat.
  $body = @{ name = $p2; password = $pw; invite = $invite; camp = "left" } | ConvertTo-Json
  [void](Invoke-RestMethod -Method Post -Uri ($Url.TrimEnd('/') + "/api/register") -ContentType "application/json" -Body $body)
  Wait 9000                                  # the rebirth intro plays first
  $buy = @"
(async()=>{const fm0=document.getElementById('chip-fm').textContent;document.querySelector('[data-sheet=food]').click();
 const b=[...document.querySelectorAll('#sheet-body .item')].find(x=>/Soupe|Velout/.test(x.textContent)&&x.getAttribute('aria-disabled')!=='true');if(!b)return 'no soup button ('+document.querySelector('#sheet-body').textContent.slice(0,80)+')';
 b.click();for(let i=0;i<20&&document.getElementById('chip-fm').textContent===fm0;i++)await new Promise(r=>setTimeout(r,150));
 return fm0+' -> '+document.getElementById('chip-fm').textContent;})()
"@
  $b = Eval $buy
  Check ($b -match "^10 FM -> 9 FM$") "buying a soup goes through the server ($b)"
  # Quitte ou double: offered in the Play sheet right after a debate, gone once played. Daytime only (he sleeps 0-6 h).
  $qod = @"
(async()=>{const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'debate'})}).then(r=>r.json());
 if(!r.ok)return 'skip: '+r.error;await new Promise(r=>setTimeout(r,500));
 const find=()=>[...document.querySelectorAll('#sheet-body .item')].find(x=>/Quitte ou double/.test(x.textContent));
 document.querySelector('[data-sheet=play]').click();await new Promise(r=>setTimeout(r,200));
 const b=find();if(!b)return 'no rematch button after a debate';b.click();await new Promise(r=>setTimeout(r,800));
 document.querySelector('[data-sheet=play]').click();await new Promise(r=>setTimeout(r,200));const again=!!find();document.getElementById('sheet-close').click();
 return again?'still offered after playing':'ok';})()
"@
  $q = Eval $qod
  Check ($q -eq "ok" -or $q -match "^skip: ") "quitte ou double is offered after a debate, once ($q)"
  Wait 600; Shot "e2e-2-game-mobile"
  $rows = Eval "document.querySelectorAll('#board .row').length"
  Check ($rows -ge 2) "the live leaderboard lists both players ($rows rows)"
  Check ((Eval "!!document.querySelector('#board .row.me')") -eq $true) "the player's own row is highlighted"
  Check ((Eval "[...document.querySelectorAll('#feed li')].some(li=>li.textContent.includes('$p2'))") -eq $true) "the feed announced the rival's arrival live"
  [void](Cdp "Page.reload"); Start-Sleep 3
  Check ((Eval "document.getElementById('auth').hidden&&document.getElementById('pname').textContent.length>0") -eq $true) "the session survives a reload"
  [void](Cdp "Emulation.setDeviceMetricsOverride" @{ width = 1366; height = 900; deviceScaleFactor = 1; mobile = $false })
  Start-Sleep 1; Shot "e2e-3-desktop"
  $out = Eval "(async()=>{document.querySelector('[data-sheet=more]').click();await new Promise(r=>setTimeout(r,200));const b=[...document.querySelectorAll('#sheet-body button')].find(x=>/^Se d.connecter$/.test(x.textContent));if(!b)return 'no logout button: '+[...document.querySelectorAll('#sheet-body h3,#sheet-body button')].map(x=>x.textContent).join(' | ').slice(0,300);b.click();await new Promise(r=>setTimeout(r,800));return !document.getElementById('auth').hidden;})()"
  Check ($out -eq $true) "logging out returns to the login screen ($out)"
  $errs = $script:events | Where-Object { $_.method -eq "Runtime.exceptionThrown" -or ($_.method -eq "Log.entryAdded" -and $_.params.entry.level -eq "error" -and $_.params.entry.url -notmatch "/api/(me|login|register)") -or ($_.method -eq "Runtime.consoleAPICalled" -and $_.params.type -eq "error") }
  foreach ($e in $errs) { $j = $e.params | ConvertTo-Json -Depth 6 -Compress; [void]$results.Add("FAIL browser error: " + $j.Substring(0, [Math]::Min(400, $j.Length))) }
  Check (-not $errs) "no JavaScript error and no CSP violation"
  [void](Cdp "Browser.close")
} finally {
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item -Recurse -Force $prof -ErrorAction SilentlyContinue
}
$results
"players created: $p1, $p2"
if ($results -match "^FAIL") { exit 1 }
