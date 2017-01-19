var device = require('iotivity-node')('server'),
    debuglog = require('util').debuglog('motion'),
    motionResource,
    sensorPin,
    notifyObserversTimeoutId,
    resourceTypeName = 'oic.r.sensor.motion',
    resourceInterfaceName = '/a/pir',
    hasUpdate = false,
    noObservers = false,
    sensorState = false;

// Require the MRAA library
var mraa = '';
try {
    mraa = require('mraa');
}
catch (e) {
    debuglog('No mraa module: ', e.message);
}

// Setup Motion sensor pin.
function setupHardware() {
    if (!mraa)
        return;

    sensorPin = new mraa.Gpio(5);
    sensorPin.dir(mraa.DIR_IN);
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    var motion = false;

    if (mraa) {
        if (sensorPin.read() > 0)
            motion = true;
        else
            motion = false;
    } else {
        // Simulate real sensor behavior. This is
        // useful for testing on desktop without mraa.
        motion = !sensorState;
    }

    if (sensorState != motion) {
        hasUpdate = true;
        sensorState = motion;
    }

    // Format the payload.
    var properties = {
        rt: resourceTypeName,
        id: 'motionSensor',
        value: sensorState
    };

    return properties;
}

// Set up the notification loop
function notifyObservers() {
    properties = getProperties();

    if (hasUpdate) {
        motionResource.properties = properties;
        hasUpdate = false;

        debuglog('Send the response: ', sensorState);
        device.notify(motionResource).catch(
            function(error) {
                debuglog('Failed to notify observers with error: ', error);
                noObservers = error.noObservers;
                if (noObservers) {
                    if (notifyObserversTimeoutId) {
                        clearTimeout(notifyObserversTimeoutId);
                        notifyObserversTimeoutId = null;
                    }
                }
            });
    }

    // After all our clients are complete, we don't care about any
    // more requests to notify.
    if (!noObservers) {
        notifyObserversTimeoutId = setTimeout(notifyObservers, 2000);
    }
}

// Event handlers for the registered resource.
function observeHandler(request) {
    motionResource.properties = getProperties();
    request.sendResponse(motionResource).catch(handleError);

    noObservers = false;
    hasUpdate = true;

    if (!notifyObserversTimeoutId)
        setTimeout(notifyObservers, 200);
}

function retrieveHandler(request) {
    motionResource.properties = getProperties();
    request.sendResponse(motionResource).catch(handleError);
}

device.device = Object.assign(device.device, {
    name: 'Smart Home Motion Sensor',
    coreSpecVersion: "1.0.0",
    dataModels: [ "v1.1.0-20160519" ]
});

function handleError(error) {
    debuglog('Failed to send response with error: ', error);
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
        // Setup Motion sensor pin.
        setupHardware();

        debuglog('Create motion resource.');
        // Register Motion resource
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
                motionResource = resource;

                // Add event handlers for each supported request type
                device.addEventListener('observerequest', observeHandler);
                device.addEventListener('retrieverequest', retrieveHandler);
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
    debuglog('Delete Motion Resource.');

    // Remove event listeners
    device.removeEventListener('observerequest', observeHandler);
    device.removeEventListener('retrieverequest', retrieveHandler);

    // Unregister resource.
    device.unregister(motionResource).then(
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
