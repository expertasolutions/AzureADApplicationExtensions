param(
    [Parameter(Mandatory=$true, Position=1)]
    [string]$subscriptionId
  , [Parameter(Mandatory=$true, Position=2)]
    [string]$servicePrincipalId
  , [Parameter(Mandatory=$true, Position=3)]
    [string]$servicePrincipalKey
  , [Parameter(Mandatory=$true, Position=4)]
    [string]$tenantId
  , [Parameter(Mandatory=$true, Position=5)]
    [string]$applicationName
)

$loginResult = az login --service-principal -u $servicePrincipalId -p $servicePrincipalKey --tenant $tenantId
$setSubResult = az account set --subscription $subscriptionId

try {
    $test = az --version
} catch {
    write-host "Azure Cli not installed"
    throw;
}

$applicationInfo = (az ad app list --filter "displayName eq '$applicationName'") | ConvertFrom-Json
$permissionAccessJson = $applicationInfo.oauth2Permissions | ConvertTo-Json -Compress
if($applicationInfo.oauth2Permissions.count -eq 1){
    $permissionAccessJson = "[" + $permissionAccessJson + "]"
}

if($applicationInfo.Length -eq 0) {
  write-host "Azure Ad Application named '$applicationName' doesn't exists"
  exit 1
}

write-host "Azure ApplicationID: $($applicationInfo.appId)"
write-host "Azure Permission Access Info-json: $($permissionAccessJson)"

#$logoutResult = az account clear