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

$versionResult = az --version
write-host $versionResult
$result = [regex]::Match($versionResult, "azure-cli \((([0-9]*).([0-9]*).([0-9]*))\)").captures.groups

if($result.length -eq 5)
{
    $major = $result[2].value
    $minor = $result[3].Value
    $build = $result[4].value
}
$goodVersion = $false

write-host "Azure Cli Version '$major.$minor.$build' installed on build agent"

az ad app list --filter "displayName eq '$applicationName'"
#$permissionAccessJson = $applicationInfo.oauth2Permissions | ConvertTo-Json -Compress
#if($applicationInfo.oauth2Permissions.count -eq 1){
#    $permissionAccessJson = "[" + $permissionAccessJson + "]"
#}

#if($applicationInfo.Length -eq 0) {
#  write-host "Azure Ad Application named '$applicationName' doesn't exists"
#  exit 1
#}

#write-host "Azure ApplicationID: $($applicationInfo.appId)"
#write-host "Azure Permission Access Info-json: $($permissionAccessJson)"

$logoutResult = az account clear