var device = require('iotivity-node')('server'),
    debuglog = require('util').debuglog('gas'),
    gasResource,
    sensorPin,
    gasDensity = 0,
    resourceTypeName = 'oic.r.sensor.carbondioxide',
    resourceInterfaceName = '/a/gas',
    notifyObserversTimeoutId,
    hasUpdate = false,
    noObservers = false,
    gasDetected = false;

// Require the MRAA library
var mraa = '';
try {
    mraa = require('mraa');
}
catch (e) {
    debuglog('No mraa module: ', e.message);
}

// Setup Gas sensor pin.
function setupHardware() {
    if (mraa) {
       sensorPin = new mraa.Aio(0);
       sensorPin.setBit(10);
    }
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    if (mraa) {
        val = sensorPin.read();
        density = val * 500 / 1024;

        debuglog('density: %d, threshold: 70', density);
        if (density != gasDensity) {
            if (density > 70 && gasDensity < 70) {
                gasDensity = density;
                gasDetected = true;
                hasUpdate = true;
            } else if (gasDensity > 70 && density < 70) {
                gasDensity = density;
                gasDetected = false;
                hasUpdate = true;
            }
        }
    } else {
        // Simulate real sensor behavior. This is useful
        // for testing on desktop without mraa.
        gasDetected = !gasDetected;
        hasUpdate = true;
    }

    // Format the properties.
    var properties = {
        rt: resourceTypeName,
        id: 'gasSensor',
        value: gasDetected
    };

    return properties;
}

// Set up the notification loop
function notifyObservers() {
    var properties = getProperties();
    if (hasUpdate) {
        gasResource.properties = properties;
        hasUpdate = false;

        debuglog('Send the response: ', gasDetected);
        device.notify(gasResource).catch(
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
    gasResource.properties = getProperties();
    request.sendResponse(gasResource).catch(handleError);

    noObservers = false;
    hasUpdate = true;

    if (!notifyObserversTimeoutId)
        setTimeout(notifyObservers, 200);
}

function retrieveHandler(request) {
    gasResource.properties = getProperties();
    request.sendResponse(gasResource).catch(handleError);
}

device.device = Object.assign(device.device, {
    name: 'Smart Home Gas Sensor',
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
        // Setup Gas sensor pin.
        setupHardware();

        debuglog('Create Gas resource.');

        // Register Gas resource
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
                gasResource = resource;

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
    debuglog('Delete Gas Resource.');

    // Remove event listeners
    device.removeEventListener('observerequest', observeHandler);
    device.removeEventListener('retrieverequest', retrieveHandler);

    // Unregister resource.
    device.unregister(gasResource).then(
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
