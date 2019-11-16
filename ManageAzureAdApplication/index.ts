import tl = require('azure-pipelines-task-lib/task');
import msRestNodeAuth = require('@azure/ms-rest-nodeauth');
import azureGraph = require('@azure/graph');

async function LoginToAzure(servicePrincipalId:string, servicePrincipalKey:string, tenantId:string) {
    return await msRestNodeAuth.loginWithServicePrincipalSecret(servicePrincipalId, servicePrincipalKey, tenantId );
};

async function FindAzureAdApplication(applicationName:string, graphClient:any){
    var appFilterValue = "displayName eq '" + applicationName + "'";
    var appFilter = {
        filter: appFilterValue 
    };
    var searchResults = await graphClient.applications.list(appFilter);
    console.log("--------");
    console.log(searchResults);
    console.log("--------");
    if(searchResults.length === 0){
        return null;
    } else {
        return searchResults[0];
    }
}

async function CreateServicePrincipal(
      applicationName:string
    , applicationId:string
    , graphClient:azureGraph.GraphRbacManagementClient
) {
    var serviceParms = {
        displayName: applicationName,
        appId: applicationId
    };
    return graphClient.servicePrincipals.create(serviceParms);
}

async function AddADApplicationOwner(
        applicationObjectId:string
    ,   ownerId:string
    ,   tenantId:string
    ,   graphClient:azureGraph.GraphRbacManagementClient) 
{
    var ownerParm = {
        url: 'https://graph.windows.net/' + tenantId + '/directoryObjects/' + ownerId
    };
    console.log("Adding owner to Azure ActiveDirectory Application ...");
    return await graphClient.applications.addOwner(applicationObjectId, ownerParm);
}

async function CreateOrUpdateADApplication(
          appObjectId:string | null
        , applicationName:string
        , rootDomain:string
        , applicationSecret:string
        , homeUrl:string
        , taskReplyUrls:string
        , requiredResource:string
        , graphClient:azureGraph.GraphRbacManagementClient
) {
    console.log("Creating new Azure ActiveDirectory AD Application...");
    
    var now = new Date();
    const nextYear = new Date(now.getFullYear()+1, now.getMonth(), now.getDay());
    var newPwdCreds = [{
        endDate: nextYear,
        value: applicationSecret
    }];

    var taskUrlArray:Array<string>;
    if(taskReplyUrls.length === 0){
        taskUrlArray = [
            'http://' + applicationName + '.' + rootDomain,
            'http://' + applicationName + '.' + rootDomain + '/signin-oidc',
            'http://' + applicationName + '.' + rootDomain + '/signin-aad'
        ];
    } else {
        taskUrlArray = JSON.parse(taskReplyUrls);
    }

    var newAppParms = {
        displayName: applicationName,
        homepage: homeUrl,
        passwordCredentials: newPwdCreds,
        replyUrls: taskUrlArray,
        requiredResourceAccess: JSON.parse(requiredResource)
    };

    if(appObjectId == null){
        return await graphClient.applications.create(newAppParms);
    }
    else {
        return await graphClient.applications.patch(appObjectId, newAppParms);
    }
}

async function grantAuth2Permissions (
        rqAccess: any
    ,   servicePrincipalId:string
    ,   graphClient:azureGraph.GraphRbacManagementClient
) {
    var resourceAppFilter = {
        filter: "appId eq '" + rqAccess.resourceAppId + "'"
    };
    
    var rs = await graphClient.servicePrincipals.list(resourceAppFilter);
    var srv = rs[0];
    var desiredScope = "";
    for(var i=0;i<rqAccess.resourceAccess.length;i++){
        var rAccess = rqAccess.resourceAccess[i];
        var p = srv.oauth2Permissions.find(p=> {
            return p.id === rAccess.id;
        });
        desiredScope += p.value + " ";
    }

    var now = new Date();
    const nextYear = new Date(now.getFullYear()+1, now.getMonth(), now.getDay());
    
    var permissions = {
        body: {
            clientId: servicePrincipalId,
            consentType: 'AllPrincipals',
            scope: desiredScope,
            resourceId: srv.objectId,
            expiryTime: nextYear.toISOString()
        }
    };
    return await graphClient.oAuth2PermissionGrant.create(permissions)
}

async function run() {
    try {
        
        var azureEndpointSubscription = tl.getInput("azureSubscriptionEndpoint", true) as string;
        var applicationName = tl.getInput("applicationName", true) as string;
        var ownerId = tl.getInput("applicationOwnerId", true) as string;
        var rootDomain = tl.getInput("rootDomain", true) as string;
        var applicationSecret = tl.getInput("applicationSecretPassword", true) as string;
        var requiredResource = tl.getInput("requiredResource", true) as string;
        var homeUrl = tl.getInput("homeUrl", true) as string;
        var taskReplyUrls = tl.getInput("replyUrls", false) as string;
        
        var subcriptionId = tl.getEndpointDataParameter(azureEndpointSubscription, "subscriptionId", false) as string;

        var servicePrincipalId = tl.getEndpointAuthorizationParameter(azureEndpointSubscription, "serviceprincipalid", false) as string;
        var servicePrincipalKey = tl.getEndpointAuthorizationParameter(azureEndpointSubscription, "serviceprincipalkey", false) as string;
        var tenantId = tl.getEndpointAuthorizationParameter(azureEndpointSubscription,"tenantid", false) as string;

        console.log("SubscriptionId: " + subcriptionId);
        console.log("ServicePrincipalId: " + servicePrincipalId);
        console.log("ServicePrincipalKey: " + servicePrincipalKey);
        console.log("TenantId: " + tenantId);
        console.log("Application Name: " + applicationName);
        console.log("Root Domain: " + rootDomain);
        console.log("Home url: " + homeUrl);
        console.log("Reply Urls: " + taskReplyUrls);
        console.log("OwnerId: " + ownerId);
        console.log("");

        const azureCredentials = await LoginToAzure(servicePrincipalId, servicePrincipalKey, tenantId);

        var pipeCreds:any = new msRestNodeAuth.ApplicationTokenCredentials(azureCredentials.clientId, tenantId, azureCredentials.secret, 'graph');
        var graphClient = new azureGraph.GraphRbacManagementClient(pipeCreds, tenantId, { baseUri: 'https://graph.windows.net' });

        var applicationInstance = await FindAzureAdApplication(applicationName, graphClient);
        if(applicationInstance == null){
            // Create new Azure AD Application
            applicationInstance = await CreateOrUpdateADApplication(null, applicationName, rootDomain, applicationSecret, homeUrl, taskReplyUrls, requiredResource, graphClient);

            // Add Owner to new Azure AD Application
            await AddADApplicationOwner(applicationInstance.objectId, ownerId, tenantId, graphClient);

            // Create Service Principal for Azure AD Application
            var newServicePrincipal = await CreateServicePrincipal(applicationName, applicationInstance.appId, graphClient);

            // Set Application Permission
            for(var i=0;i<applicationInstance.requiredResourceAccess.length;i++){
                var rqAccess = applicationInstance.requiredResourceAccess[i];
                await grantAuth2Permissions(rqAccess, newServicePrincipal.objectId as string, graphClient);
            }

            // Update Application IdentifierUrisapplicationInstance
            var appUpdateParms = {
                identifierUris: ['https://' + rootDomain + '/' + applicationInstance.appId ]
            };
            await graphClient.applications.patch(applicationInstance.objectId, appUpdateParms);
        } else {
            console.log("Update Application AD");
            applicationInstance = await CreateOrUpdateADApplication(applicationInstance.objectId, applicationName, rootDomain, applicationSecret, homeUrl, taskReplyUrls, requiredResource, graphClient);
            console.log(applicationInstance);
        }
        tl.setVariable("azureAdApplicationId", applicationInstance.appId);
} catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message || 'run() failed');
    }
}

run();