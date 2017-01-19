var device = require('iotivity-node')('server'),
    debuglog = require('util').debuglog('led'),
    ledResource,
    sensorPin,
    sensorState = false,
    resourceTypeName = 'oic.r.led',
    resourceInterfaceName = '/a/led';

// Require the MRAA library
var mraa = '';
try {
    mraa = require('mraa');
}
catch (e) {
    debuglog('No mraa module: ', e.message);
}

// Setup LED sensor pin.
function setupHardware() {
    if (mraa) {
        sensorPin = new mraa.Gpio(2);
        sensorPin.dir(mraa.DIR_OUT);
        sensorPin.write(0);
    }
}

// This function parce the incoming Resource properties
// and change the sensor state.
function updateProperties(properties) {
    sensorState = properties.value;

    debuglog('Update received. value: ', sensorState);

    if (!mraa)
        return;

    if (sensorState)
        sensorPin.write(1);
    else
        sensorPin.write(0);
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    // Format the payload.
    var properties = {
        rt: resourceTypeName,
        id: 'led',
        value: sensorState
    };

    debuglog('Send the response. value: ', sensorState);
    return properties;
}

// Set up the notification loop
function notifyObservers(request) {
    ledResource.properties = getProperties();

    device.notify(ledResource).then(
        function() {
            debuglog('Successfully notified observers.');
        },
        function(error) {
            debuglog('Notify failed with error: ', error);
        });
}

// Event handlers for the registered resource.
function observeHandler(request) {
    request.sendResponse(ledResource).catch(handleError);
    setTimeout(notifyObservers, 200);
}

function retrieveHandler(request) {
    ledResource.properties = getProperties();
    request.sendResponse(ledResource).catch(handleError);
}

function changeHandler(request) {
    updateProperties(request.res);

    ledResource.properties = getProperties();
    request.sendResponse(ledResource).catch(handleError);
    setTimeout(notifyObservers, 200);
}

device.device = Object.assign(device.device, {
    name: 'Smart Home LED',
    coreSpecVersion: "1.0.0",
    dataModels: [ "v1.1.0-20160519" ]
});

function handleError(error) {
    debuglog('LED: Failed to send response with error: ', error);
}

device.platform = Object.assign(device.platform, {
    manufacturerName: 'Intel',
    manufactureDate: new Date('Fri Oct 30 10:04:17 (EET) 2015'),
    platformVersion: '1.1.0',
    firmwareVersion: '0.0.1'
});

// Enable presence
device.enablePresence().then(
    function() {

        // Setup LED pin.
        setupHardware();

        debuglog('Create LED resource.');

        // Register LED resource
        device.register({
            id: { path: resourceInterfaceName },
            resourceTypes: [ resourceTypeName ],
            interfaces: [ 'oic.if.baseline' ],
            discoverable: true,
            observable: true,
            properties: getProperties()
        }).then(
            function(resource) {
                debuglog('register() resource successful');
                ledResource = resource;

                // Add event handlers for each supported request type
                device.addEventListener('observerequest', observeHandler);
                device.addEventListener('retrieverequest', retrieveHandler);
                device.addEventListener('changerequest', changeHandler);
            },
            function(error) {
                debuglog('register() resource failed with: ', error);
            });
    },
    function(error) {
        debuglog('device.enablePresence() failed with: ', error);
    });

// Cleanup when interrupted
function exitHandler() {
    debuglog('Delete LED Resource.');

    // Turn off LED before we tear down the resource.
    if (mraa)
        sensorPin.write(0);

    // Remove event listeners
    device.removeEventListener('observerequest', observeHandler);
    device.removeEventListener('retrieverequest', retrieveHandler);
    device.removeEventListener('changerequest', changeHandler);

    // Unregister resource.
    device.unregister(ledResource).then(
        function() {
            debuglog('unregister() resource successful');
        },
        function(error) {
            debuglog('unregister() resource failed with: ', error);
        });

    // Disable presence
    device.disablePresence().then(
        function() {
            debuglog('device.disablePresence() successful');
        },
        function(error) {
            debuglog('device.disablePresence() failed with: ', error);
        });

    // Exit
    process.exit(0);
}

// Exit gracefully
process.on('SIGINT', exitHandler);
process.on('SIGTERM', exitHandler);
