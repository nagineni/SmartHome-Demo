var device = require('iotivity-node')('server'),
    debuglog = require('util').debuglog('ambient_light'),
    illuminanceResource,
    sensorPin,
    notifyObserversTimeoutId,
    resourceTypeName = 'oic.r.sensor.illuminance',
    resourceInterfaceName = '/a/illuminance',
    hasUpdate = false,
    noObservers = false,
    lux = 0.0;

// Require the MRAA library
var mraa = '';
try {
    mraa = require('mraa');
}
catch (e) {
    debuglog('No mraa module: ', e.message);
}

// Setup ambient light sensor pin.
function setupHardware() {
    if (!mraa)
        return;

    sensorPin = new mraa.Aio(3);
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    var temp = 0;
    if (mraa) {
        var raw_value = sensorPin.read();

        // Conversion to lux
        temp = 10000.0 / Math.pow(((1023.0 - raw_value) * 10.0 / raw_value) * 15.0,4.0 / 3.0);
    } else {
        // Simulate real sensor behavior. This is
        // useful for testing on desktop without mraa.
        temp = lux + 0.1;
    }

    var illuminance = Math.round(temp * 100) / 100;
    if (lux != illuminance) {
        lux = illuminance;
        hasUpdate = true;
    }

    // Format the payload.
    var properties = {
        rt: resourceTypeName,
        id: 'illuminance',
        illuminance: lux
    };

    return properties;
}

// Set up the notification loop
function notifyObservers() {
    properties = getProperties();

    if (hasUpdate) {
        illuminanceResource.properties = properties;
        hasUpdate = false;

        debuglog('Send the lux value: ', lux);
        device.notify(illuminanceResource).catch(
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
    illuminanceResource.properties = getProperties();
    request.sendResponse(illuminanceResource).catch(handleError);

    noObservers = false;
    hasUpdate = true;

    if (!notifyObserversTimeoutId)
        setTimeout(notifyObservers, 200);
}

function retrieveHandler(request) {
    illuminanceResource.properties = getProperties();
    request.sendResponse(illuminanceResource).catch(handleError);
}

device.device = Object.assign(device.device, {
    name: 'Smart Home Illuminance Sensor',
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
        // Setup Illuminance sensor pin.
        setupHardware();

        debuglog('Create Illuminance sensor resource.');

        // Register illuminance resource
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
                illuminanceResource = resource;

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
    debuglog('Delete Illuminance sensor Resource.');

    // Remove event listeners
    device.removeEventListener('observerequest', observeHandler);
    device.removeEventListener('retrieverequest', retrieveHandler);

    // Unregister resource.
    device.unregister(illuminanceResource).then(
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
