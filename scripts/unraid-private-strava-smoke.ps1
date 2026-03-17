param(
    [string]$HostName = "10.10.10.129",
    [string]$AppPath = "/mnt/user/appdata/data-hub",
    [int]$ApiPort = 3001
)

$remote = @"
set -e
cd $AppPath
echo HEAD=\$(git rev-parse --short HEAD)
echo ENV:
grep -E '^(ADAPTER_STRAVA_ENABLED|ADAPTER_STRAVA_PACKAGE|ADAPTER_STRAVA_MODULE)=' .env || true
echo HEALTH:
curl -s http://127.0.0.1:$ApiPort/api/health
echo
echo CAPABILITIES:
curl -s http://127.0.0.1:$ApiPort/api/capabilities
echo
echo LOGCHECK:
docker logs --tail 120 strava-tracker 2>&1 | grep 'Loaded Strava adapter module' || true
"@

ssh "root@$HostName" $remote
