param(
    [string]$HostName = "10.10.10.129",
    [string]$AppPath = "/mnt/user/appdata/data-hub",
    [int]$ApiPort = 3001
)

$remoteTemplate = @'
set -e
cd __APP_PATH__
echo HEAD=$(git rev-parse --short HEAD)
echo ENV:
grep -E '^(ADAPTER_STRAVA_ENABLED|ADAPTER_STRAVA_PACKAGE|ADAPTER_STRAVA_MODULE)=' .env || true
echo HEALTH:
curl -s http://127.0.0.1:__API_PORT__/api/health
echo
echo CAPABILITIES:
curl -s http://127.0.0.1:__API_PORT__/api/capabilities
echo
echo FEATURE_LOG:
if [ -f dashboards/strava/src/lib/featureLog.ts ]; then
  FEATURE_LOG_DATE=$(grep -m1 "date:[[:space:]]*'" dashboards/strava/src/lib/featureLog.ts | sed -E "s/.*date:[[:space:]]*'([^']+)'.*/\\1/")
  FEATURE_LOG_TITLE_DE=$(awk '
    /FEATURE_LOG_ENTRIES/ { in_entries=1 }
    in_entries && /title:[[:space:]]*{/ { in_title=1; next }
    in_entries && in_title && /de:[[:space:]]*'\''/ {
      line=$0
      sub(/^[[:space:]]*de:[[:space:]]*'\''/, "", line)
      sub(/'\''[[:space:]]*,?[[:space:]]*$/, "", line)
      print line
      exit
    }
  ' dashboards/strava/src/lib/featureLog.ts)
  echo latest_date=${FEATURE_LOG_DATE:-unknown}
  echo latest_title_de=${FEATURE_LOG_TITLE_DE:-unknown}
else
  echo feature_log_file_missing
fi
echo
echo LOGCHECK:
docker logs --tail 120 strava-tracker 2>&1 | grep 'Loaded Strava adapter module' || true
'@

$remote = $remoteTemplate.Replace('__APP_PATH__', $AppPath).Replace('__API_PORT__', [string]$ApiPort)

ssh "root@$HostName" $remote
