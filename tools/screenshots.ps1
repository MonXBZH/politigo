# Regenerates the README screenshots (docs/images/*.png) from the local stack, in headless Chrome over the DevTools protocol.
# Usage: powershell -ExecutionPolicy Bypass -File tools\screenshots.ps1 [-Url http://localhost:8080/] [-Out docs\images]
#        [-AdminUrl http://localhost:8090/ -AdminPassword <POLITIGO_ADMIN_PASSWORD>]  (adds the admin dashboard shot)
# Needs: Docker Desktop, the stack up (docker compose up -d), POLITIGO_INVITE in .env, Chrome, and daytime in Paris
# (the companion sleeps 0-6 h and refuses every action). What it does:
#   1. restarts the api (resets the registration rate limit) and registers five demo players
#      (Camille, Hugo, Ines, Malik, Zoe) through the page;
#   2. stops the api, gives them levels, gauges, a history and a lively feed straight in SQLite
#      (state is loaded from the database at boot only), and starts the api again;
#   3. signs in as each player in turn and captures the screens;
#   4. stops the api, deletes the demo players, their sessions and every feed row they produced, starts the api.
# Any game that was there before is left untouched (only the five demo names are written or deleted).
# Keep this file pure ASCII (Windows PowerShell 5.1 reads it as ANSI): accents go through \u escapes in JS strings.
# Safety: it refuses to run on a database that already holds players (a real game: a friend may be called "Hugo"),
# unless -Force is given on a stack you know to be a throwaway one.
param([string]$Url = "http://localhost:8080/", [string]$Out = "", [switch]$Force, [string]$AdminUrl = "", [string]$AdminPassword = "")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
if (-not $Out) { $Out = Join-Path $root "docs\images" }
New-Item -ItemType Directory -Force $Out | Out-Null
$invite = ((Get-Content (Join-Path $root ".env")) | Where-Object { $_ -match '^POLITIGO_INVITE=' }) -replace '^POLITIGO_INVITE=', ''
if (-not $invite) { throw "POLITIGO_INVITE missing from .env" }
$paris = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, "Romance Standard Time")
if ($paris.Hour -lt 6 -or $paris.Hour -ge 23) { throw "It is $($paris.ToString('HH:mm')) in Paris: the companions sleep (0-6 h). Run this in the daytime." }
$pw = "pg-shots-" + [guid]::NewGuid().ToString("N").Substring(0, 12)
# JS string literals of the demo pseudos (accents escaped).
$names = @{ camille = "Camille"; hugo = "Hugo"; ines = "In\u00e8s"; malik = "Malik"; zoe = "Zo\u00e9" }

function Compose([string[]]$cmdArgs, [string]$stdin = $null) {
  $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  Push-Location $root
  try {
    if ($stdin) { $o = $stdin | & docker compose @cmdArgs 2>&1 } else { $o = & docker compose @cmdArgs 2>&1 }
    $code = $LASTEXITCODE
  } finally { Pop-Location; $ErrorActionPreference = $old }
  $text = ($o | ForEach-Object { "$_" }) -join "`n"
  if ($code -ne 0) { throw "docker compose $($cmdArgs -join ' ') failed ($code): $text" }
  $text
}
function WaitApi() {
  for ($i = 0; $i -lt 60; $i++) {
    try { $r = Invoke-WebRequest -UseBasicParsing ($Url.TrimEnd('/') + "/api/health") -TimeoutSec 3; if ($r.StatusCode -eq 200) { return } } catch {}
    Start-Sleep 1
  }
  throw "api not healthy after 60 s"
}
# Runs an ES module inside a one-off api container (api stopped), with the database and the game rules at hand.
function DbJs([string]$body) {
  $js = "import {DatabaseSync} from 'node:sqlite';import * as R from '/app/rules.mjs';" +
        "const db=new DatabaseSync('/data/politigo.db',{timeout:5000});db.exec('PRAGMA foreign_keys=ON');" +
        "const now=Date.now(),H=3600000,D=86400000;" + $body
  Compose @("run", "--rm", "--no-deps", "-T", "api", "node", "--input-type=module") $js
}
$demoList = "[" + (($names.Values | ForEach-Object { "'$_'" }) -join ",") + "]"
$cleanupJs = @"
const names=$demoList;
for(const n of names){const r=db.prepare('SELECT id FROM players WHERE name=?').get(n);if(r){db.prepare('DELETE FROM sessions WHERE player_id=?').run(r.id);db.prepare('DELETE FROM players WHERE id=?').run(r.id);}}
const f=db.prepare('DELETE FROM feed WHERE player IN ('+names.map(()=>'?').join(',')+')').run(...names);
console.log('cleanup: players left '+db.prepare('SELECT COUNT(*) n FROM players').get().n+', feed rows removed '+f.changes);
"@
if (-not $Force) {
  $existing = DbJs "console.log('players='+db.prepare('SELECT COUNT(*) n FROM players').get().n);"
  if ($existing -notmatch 'players=0') { throw "This database already holds players ($existing): run the screenshots on an empty local stack, or pass -Force on a throwaway one." }
}

# Levels, gauges and a plausible history for the demo players; feed rows in chronological order (the feed is read by id).
$setupJs = @'
const N=__NAMES__;
const row=n=>{const r=db.prepare('SELECT id,state FROM players WHERE name=?').get(n);if(!r)throw new Error('missing '+n);return r;};
function put(n,o,extra=[]){
 const r=row(n),s=JSON.parse(r.state);
 const born=now-o.days*D;delete o.days;
 Object.assign(s,{born,vclock:now,lastReal:now,hourIdx:Math.floor(now/H),form:'Excellente',mult:1.25},o);
 if(o.xp===undefined)s.xp=R.xpFloor(s.lvl)+(s.lvl<100?0.45*R.xpCost(s.lvl):180);
 s.best=Math.max(s.best||1,s.lvl);s.bestStreak=Math.max(s.bestStreak||0,s.streak||0);
 const first=s.journal[s.journal.length-1];first.t=born;
 const entries=[first,...extra.map(e=>({t:now-e.ago,k:e.k,text:e.text,d:e.d}))].sort((a,b)=>a.t-b.t);
 entries.forEach((e,i)=>{e.n=i+1;if(e.d===undefined)delete e.d;});
 s.journal=entries.reverse();s.jn=entries.length;
 db.prepare('UPDATE players SET state=?,score=?,updated=? WHERE id=?').run(JSON.stringify(s),R.score(s),now,r.id);
 db.prepare("UPDATE feed SET t=? WHERE player=? AND kind='new'").run(born,n);
}
put(N.hugo,{days:26,lvl:47,best:100,sat:82,moral:74,energy:66,hyg:79,fm:52,streak:5,bestStreak:31,deaths:1,diedAt:now-9*D});
put(N.ines,{days:19,lvl:100,sat:91,moral:88,energy:83,hyg:90,fm:99,streak:14,bestStreak:44});
put(N.zoe,{days:10,lvl:34,sat:58,moral:61,energy:55,hyg:64,fm:21,form:'Correcte',mult:1,streak:0,bestStreak:17});
put(N.camille,{days:8,lvl:23,sat:86,moral:92,energy:78,hyg:84,fm:37,streak:9,bestStreak:21},[
 {ago:5*D,k:'evolve',text:'Passation de pouvoir : Olivier Faure laisse la place \u00e0 Rapha\u00ebl Glucksmann au niveau 10.'},
 {ago:2*D,k:'evolve',text:'Passation de pouvoir : Rapha\u00ebl Glucksmann laisse la place \u00e0 Marine Tondelier au niveau 20.'},
 {ago:7*H,k:'stress',text:'Stress de Marine Tondelier : Veste verte au pressing. \u00ab Sans ma veste, plus personne ne me reconna\u00eet ! \u00bb (moral \u22125)'},
 {ago:3*H,k:'buy',text:'Couscous de la f\u00eate de quartier : \u22123 FM, sati\u00e9t\u00e9 +50, moral +5, visite +25 XP.'},
 {ago:80*60000,k:'buy',text:'Jardin partag\u00e9 : \u22124 FM, moral +30.'}]);
put(N.malik,{days:2,lvl:9,xp:R.xpFloor(10)-27,sat:77,moral:70,energy:81,hyg:73,fm:15,streak:3,bestStreak:8});
const feed=db.prepare('INSERT INTO feed(t,player,kind,text) VALUES(?,?,?,?)');
for(const [ago,p,k,t] of [
 [12*D,N.hugo,'legend','Niveau 100 : Marine Le Pen devient la l\u00e9gende de la collection !'],
 [9*D,N.hugo,'death','D\u00e9mission de Marine Le Pen. Nouveau d\u00e9part au niveau 1 avec Val\u00e9rie P\u00e9cresse.'],
 [5*D,N.camille,'evolve','Passation de pouvoir : Olivier Faure laisse la place \u00e0 Rapha\u00ebl Glucksmann au niveau 10.'],
 [3*D,N.ines,'legend','Niveau 100 : Jean-Luc M\u00e9lenchon devient la l\u00e9gende de la collection !'],
 [2*D,N.camille,'evolve','Passation de pouvoir : Rapha\u00ebl Glucksmann laisse la place \u00e0 Marine Tondelier au niveau 20.'],
 [36*H,N.zoe,'evolve','Passation de pouvoir : Marine Tondelier laisse la place \u00e0 Fran\u00e7ois Ruffin au niveau 30.'],
 [20*H,N.hugo,'evolve','Passation de pouvoir : \u00c9douard Philippe laisse la place \u00e0 Laurent Wauquiez au niveau 40.'],
 [7*H,N.camille,'stress','Stress de Marine Tondelier : Veste verte au pressing. \u00ab Sans ma veste, plus personne ne me reconna\u00eet ! \u00bb (moral \u22125)'],
 [3*H,N.malik,'pong','Fin du d\u00e9bat : 11 renvois, bonus d\u2019\u00e9loquence +10 XP.'],
 [80*60000,N.zoe,'stress','Stress de Fran\u00e7ois Ruffin : Appel de Jean-Luc. \u00ab Ne pas d\u00e9crocher. Surtout, ne pas d\u00e9crocher. \u00bb (moral \u22125)'],
 [40*60000,N.ines,'pong','Fin du d\u00e9bat : 9 renvois, bonus d\u2019\u00e9loquence +9 XP.'],
 [12*60000,N.malik,'stress','Stress de Val\u00e9rie P\u00e9cresse : Meeting au Z\u00e9nith. \u00ab Je lis mon discours avec l\u2019\u00e9nergie d\u2019un RER B en panne. \u00bb (moral \u22125)']
])feed.run(now-ago,p,k,t);
console.log('setup done');
'@
$setupJs = $setupJs.Replace("__NAMES__", "{camille:'$($names.camille)',hugo:'$($names.hugo)',ines:'$($names.ines)',malik:'$($names.malik)',zoe:'$($names.zoe)'}")

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$prof = Join-Path $env:TEMP ("pg-shots-" + [guid]::NewGuid())
$proc = $null
try {
  "restarting api (fresh rate limits) and removing leftovers of a previous run"
  [void](Compose @("stop", "api")); [void](DbJs $cleanupJs); [void](Compose @("start", "api")); WaitApi

  $proc = Start-Process $chrome -ArgumentList "--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=9334", "--user-data-dir=$prof", "about:blank" -PassThru
  $ws = $null
  for ($i = 0; $i -lt 30 -and -not $ws; $i++) { Start-Sleep -Milliseconds 300; try { $ws = ((Invoke-RestMethod http://127.0.0.1:9334/json) | Where-Object { $_.type -eq "page" })[0].webSocketDebuggerUrl } catch {} }
  $sock = New-Object System.Net.WebSockets.ClientWebSocket
  $sock.ConnectAsync([Uri]$ws, [Threading.CancellationToken]::None).Wait()
  $script:id = 0
  function Recv() {
    $buf = New-Object byte[] 4194304; $ms = New-Object IO.MemoryStream
    do { $r = $sock.ReceiveAsync((New-Object ArraySegment[byte] -ArgumentList (, $buf)), [Threading.CancellationToken]::None).Result; $ms.Write($buf, 0, $r.Count) } while (-not $r.EndOfMessage)
    [Text.Encoding]::UTF8.GetString($ms.ToArray())
  }
  function Cdp($method, $params = @{}) {
    $script:id++; $msg = @{ id = $script:id; method = $method; params = $params } | ConvertTo-Json -Depth 20 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $sock.SendAsync((New-Object ArraySegment[byte] -ArgumentList (, $bytes)), "Text", $true, [Threading.CancellationToken]::None).Wait()
    while ($true) { $o = (Recv) | ConvertFrom-Json; if ($o.id -eq $script:id) { return $o } }
  }
  function Eval($js) {
    $r = Cdp "Runtime.evaluate" @{ expression = $js; awaitPromise = $true; returnByValue = $true }
    if ($r.result.exceptionDetails) { throw "JS error: " + ($r.result.exceptionDetails | ConvertTo-Json -Depth 6 -Compress) }
    $r.result.result.value
  }
  function Wait($ms) { [void](Eval "new Promise(r=>setTimeout(r,$ms))") }
  function Mobile() { [void](Cdp "Emulation.setDeviceMetricsOverride" @{ width = 390; height = 844; deviceScaleFactor = 2; mobile = $true }) }
  function Desktop() { [void](Cdp "Emulation.setDeviceMetricsOverride" @{ width = 1440; height = 900; deviceScaleFactor = 1; mobile = $false }) }
  # Bounding box (page coordinates, CSS px) of one element, or of several merged, plus a margin.
  function Box($sels, $pad = 0) {
    $list = "[" + (($sels | ForEach-Object { "'$_'" }) -join ",") + "]"
    $j = Eval "(()=>{const rs=$list.map(s=>document.querySelector(s).getBoundingClientRect());const x=Math.min(...rs.map(r=>r.left)),y=Math.min(...rs.map(r=>r.top)),r=Math.max(...rs.map(r=>r.right)),b=Math.max(...rs.map(r=>r.bottom));return JSON.stringify({x:Math.max(0,x-$pad+scrollX),y:Math.max(0,y-$pad+scrollY),w:Math.min(innerWidth,r+$pad)-Math.max(0,x-$pad),h:b-y+2*$pad});})()"
    $j | ConvertFrom-Json
  }
  function Shot($name, $box = $null) {
    $p = @{ format = "png" }
    if ($box) { $p.clip = @{ x = [double]$box.x; y = [double]$box.y; width = [double]$box.w; height = [double]$box.h; scale = $(if ($box.s) { [double]$box.s } else { 1 }) } }
    $d = (Cdp "Page.captureScreenshot" $p).result.data
    [IO.File]::WriteAllBytes((Join-Path $Out "$name.png"), [Convert]::FromBase64String($d)); "  shot $name"
  }
  function Go() { [void](Cdp "Page.navigate" @{ url = $Url }); Start-Sleep 3; [void](Eval "document.fonts.ready.then(()=>1)") }
  function Login($n) {
    $s = Eval "(async()=>{await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return (await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'$n',password:'$pw'})})).status;})()"
    if ($s -ne 200) { throw "login $n failed ($s)" }
    Go; [void](Eval "document.getElementById('tips-close').click(),1")
  }
  function OpenSheet($kind) { [void](Eval "document.querySelector('[data-sheet=$kind]').click(),1"); Wait 500 }
  function CloseSheet() { [void](Eval "document.getElementById('sheet-close').click(),1"); Wait 300 }
  function ClickItem($re) {
    $r = Eval "(()=>{const b=[...document.querySelectorAll('#sheet-body .item, #sheet-body button')].find(x=>/$re/.test(x.textContent));if(!b)return 'missing';b.click();return 'ok';})()"
    if ($r -ne "ok") { throw "no button matching $re" }
  }

  [void](Cdp "Runtime.enable"); [void](Cdp "Page.enable")
  # Reduced motion off, default light/dark scheme from the page itself.
  Mobile; Go

  "1. sign-up screen"
  [void](Eval "(()=>{document.getElementById('tab-register').click();const f=document.getElementById('form-register');f.querySelector('[name=name]').value='Camille';f.querySelector('[name=password]').value='motdepasse';document.activeElement.blur();return 1;})()")
  # The whole card in one tall viewport, cropped just below the two camp cards.
  $h = Eval "document.getElementById('auth').scrollHeight"
  [void](Cdp "Emulation.setDeviceMetricsOverride" @{ width = 390; height = [int]$h; deviceScaleFactor = 2; mobile = $true }); Wait 600
  $b = Box @(".onboard-card .camps") 0
  Shot "auth" @{ x = 0; y = 0; w = 390; h = [Math]::Ceiling($b.y + $b.h + 16); s = 0.8 }; Mobile; Wait 400

  "2. demo players"
  foreach ($p in @(@("hugo", "right"), @("ines", "left"), @("zoe", "left"), @("camille", "left"), @("malik", "right"))) {
    $s = Eval "fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'$($names[$p[0]])',password:'$pw',invite:'$invite',camp:'$($p[1])'})}).then(r=>r.status)"
    if ($s -ne 201) { throw "register $($p[0]) failed ($s)" }
  }
  [void](Compose @("stop", "api")); [void](DbJs $setupJs); [void](Compose @("start", "api")); WaitApi

  "3. Camille: main screen, sheets, Pong, desktop"
  Login $names.camille; Wait 1500; Shot "game-mobile"
  OpenSheet "food"; Shot "sheet-buvette"; CloseSheet
  OpenSheet "play"; ClickItem "^D.battre"; Wait 4600        # debate animation and its toast end first
  OpenSheet "play"; Shot "sheet-jouer"; CloseSheet
  OpenSheet "more"; Shot "sheet-dossier"; CloseSheet
  OpenSheet "play"; ClickItem "Pong des arguments"; Wait 1200
  # Follow the bubble roughly with the mouse so the paddle moves: sweep across the screen.
  $c = Box @(".device canvas")
  foreach ($k in 0..8) { [void](Cdp "Input.dispatchMouseEvent" @{ type = "mouseMoved"; x = $c.x + $c.w * (0.35 + 0.04 * $k); y = $c.y + $c.h * 0.7 }); Wait 120 }
  Shot "pong" (Box @(".device") 8)
  [void](Eval "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})),1"); Wait 3000
  # Desktop: taller than 900 px so the live feed shows under the leaderboard; no toast, no focus ring.
  Desktop; [void](Cdp "Emulation.setDeviceMetricsOverride" @{ width = 1440; height = 1180; deviceScaleFactor = 1; mobile = $false })
  [void](Eval "(async()=>{for(let i=0;i<60&&document.getElementById('toast').classList.contains('show');i++)await new Promise(r=>setTimeout(r,200));document.activeElement.blur();scrollTo(0,0);return 1;})()")
  Wait 1200; Shot "game-desktop"; Mobile; Wait 800

  "4. Ines (level 100): legend and left collection"
  Login $names.ines; Wait 1500; Shot "legend"
  OpenSheet "more"; [void](Eval "document.querySelector('#sheet-body .forms').scrollIntoView({block:'center'}),1"); Wait 400
  Shot "collection-left" (Box @("#sheet-body .forms", "#sheet-body h3:nth-of-type(3)") 10); CloseSheet

  "4b. the chat: Ines shares her legend, the others answer, Camille reads"
  # Ines is on screen: the game canvas itself becomes the shared picture.
  [void](Eval "(async()=>{const b=await new Promise(r=>document.querySelector('.device canvas').toBlob(r,'image/png'));const m=await (await fetch('/api/chat/media',{method:'POST',headers:{'Content-Type':'image/png'},body:b})).json();await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:'global',text:'Niveau 100, la l\u00e9gende est servie \ud83c\udf39',media:m.id})});return 1;})()")
  foreach ($m in @(@("hugo", "global", "Bravo ! Revanche au D\u00e9bat chrono ce soir ? \ud83d\ude0f"), @("zoe", "global", "Je prends les paris \ud83c\udfdb\ufe0f"), @("malik", "global", "Pas avant mon caf\u00e9 \u2615"), @("zoe", "camp", "R\u00e9union de la gauche \u00e0 18 h : ordre du jour, rester unis \ud83d\ude05"))) {
    [void](Eval "(async()=>{await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'$($names[$m[0]])',password:'$pw'})});await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:'$($m[1])',text:'$($m[2])'})});return 1;})()")
  }
  Login $names.camille; Wait 1000
  [void](Eval "[...document.querySelectorAll('.pad-btn')].find(b=>/Chat/.test(b.textContent)).click(),1"); Wait 1500
  [void](Eval "document.activeElement.blur(),1"); Shot "chat-mobile"; CloseSheet

  "5. Hugo: right collection, then a resignation to the right"
  Login $names.hugo
  OpenSheet "more"; [void](Eval "document.querySelector('#sheet-body .forms').scrollIntoView({block:'center'}),1"); Wait 400
  Shot "collection-right" (Box @("#sheet-body .forms", "#sheet-body h3:nth-of-type(3)") 10)
  ClickItem "^Repartir . droite$"; Wait 300; ClickItem "^Confirmer"; Wait 900
  [void](Eval "document.getElementById('screen').click(),1"); Wait 2200      # skip the death, into the rebirth
  Shot "rebirth-right" (Box @(".device") 8)

  "6. Zoe: a resignation to the left"
  Login $names.zoe
  OpenSheet "more"; ClickItem "^Repartir . gauche$"; Wait 300; ClickItem "^Confirmer"; Wait 900
  [void](Eval "document.getElementById('screen').click(),1"); Wait 1300
  Shot "rebirth-left" (Box @(".device") 8)

  "7. Malik: level 9 to 10, the evolution scene"
  Login $names.malik; Wait 800
  OpenSheet "play"; ClickItem "^D.battre"; Wait 4500
  Shot "evolution" (Box @(".device") 8)
  if ($AdminUrl) {
    "8. admin dashboard"
    Desktop; [void](Cdp "Page.navigate" @{ url = $AdminUrl }); Start-Sleep 2
    $s = Eval "(async()=>{const f=document.querySelector('form');f.querySelector('input[type=password]').value='$AdminPassword';f.requestSubmit();await new Promise(r=>setTimeout(r,2500));return location.hash;})()"
    if ($s -notmatch 'tableau') { throw "admin login failed ($s)" }
    [void](Eval "document.activeElement.blur(),1"); Wait 800; Shot "admin-dashboard"
  }
  [void](Cdp "Browser.close")
} finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep 1; Remove-Item -Recurse -Force $prof -ErrorAction SilentlyContinue
  "cleanup"
  try { [void](Compose @("stop", "api")); DbJs $cleanupJs } finally { [void](Compose @("start", "api")); WaitApi }
}
Add-Type -AssemblyName System.Drawing
Get-ChildItem $Out -Filter *.png | ForEach-Object { $img = [System.Drawing.Image]::FromFile($_.FullName); "{0,-22} {1}x{2}  {3} KB" -f $_.Name, $img.Width, $img.Height, [Math]::Round($_.Length / 1KB); $img.Dispose() }
