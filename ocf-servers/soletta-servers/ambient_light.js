var device = require('iotivity-node')('server'),
    _ = require('lodash'),
    illuminanceResource,
    sensorPin,
    notifyObserversTimeoutId,
    resourceTypeName = 'oic.r.sensor.illuminance',
    resourceInterfaceName = '/a/illuminance',
    hasUpdate = false,
    noObservers = false,
    rawValue = 0.0,
    lux = 0.0;

// Require the Soletta AIO library
var aio = '';
try {
    aio = require('soletta/aio');
} catch (e) {
    console.log('No AIO module: ' + e.message);
}

// Setup ambient light sensor pin.
function setupHardware() {
    if (!aio) {
        return;
    }

    aio.open({
        device: 1,
        pin: 3
    }).then(function(pin) {
        sensorPin = pin;
        pin.read().then(function(data) {
            rawValue = data;
        });
    });
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    var temp = 0;
    if (aio) {

        // Conversion to lux
        temp = 10000.0 / Math.pow(((1023.0 - raw_value) * 10.0 / raw_value) * 15.0, 4.0 / 3.0);
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

function sendDeviceNotify() {
    if (hasUpdate) {
        hasUpdate = false;
        console.log('\nIlluminance: Send the response - Illuminance: ' + lux);
        device.notify(illuminanceResource).catch(
            function(error) {
                console.log('Illuminance: Failed to notify observers.');
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

// Set up the notification loop
function notifyObservers() {
    if (aio) {
        sensorPin.read().then(function(data) {
            rawValue = data;
            illuminanceResource.properties = getProperties();
            sendDeviceNotify();
        });
    } else {
        illuminanceResource.properties = getProperties();
        sendDeviceNotify();
    }
}

// Event handlers for the registered resource.
function observeHandler(request) {
    illuminanceResource.properties = getProperties();
    request.sendResponse(illuminanceResource).catch(handleError);

    noObservers = false;
    if (!notifyObserversTimeoutId)
        setTimeout(notifyObservers, 200);
}

function retrieveHandler(request) {
    if (aio) {
        sensorPin.read().then(function(data) {
            rawValue = data;
            illuminanceResource.properties = getProperties();
            request.sendResponse(illuminanceResource).catch(handleError);
        });
    } else {
        illuminanceResource.properties = getProperties();
        request.sendResponse(illuminanceResource).catch(handleError);
    }
}

device.device = _.extend(device.device, {
    name: 'Smart Home Illuminance Sensor'
});

function handleError(error) {
    console.log('Illuminance: Failed to send response with error ' + error +
        ' and result ' + error.result);
}

device.platform = _.extend(device.platform, {
    manufacturerName: 'Intel',
    manufactureDate: new Date('Fri Oct 30 10:04:17 EEST 2015'),
    platformVersion: '1.1.0',
    firmwareVersion: '0.0.1',
});

// Enable presence
device.enablePresence().then(
    function() {
        // Setup Illuminance sensor pin.
        setupHardware();

        console.log('\nCreate Illuminance sensor resource.');

        // Register illuminance resource
        device.registerResource({
            id: {
                path: resourceInterfaceName
            },
            resourceTypes: [resourceTypeName],
            interfaces: ['oic.if.baseline'],
            discoverable: true,
            observable: true,
            properties: getProperties()
        }).then(
            function(resource) {
                console.log('Illuminance: registerResource() successful');
                illuminanceResource = resource;

                // Add event handlers for each supported request type
                device.addEventListener('observerequest', observeHandler);
                device.addEventListener('retrieverequest', retrieveHandler);
            },
            function(error) {
                console.log('Illuminance: registerResource() failed with: ' +
                    error);
            });
    },
    function(error) {
        console.log('Illuminance: device.enablePresence() failed with: ' + error);
    });

// Cleanup on SIGINT
process.on('SIGINT', function() {
    console.log('Delete Illuminance sensor Resource.');

    // Remove event listeners
    device.removeEventListener('observerequest', observeHandler);
    device.removeEventListener('retrieverequest', retrieveHandler);

    // Unregister resource.
    device.unregisterResource(illuminanceResource).then(
        function() {
            console.log('Illuminance: unregisterResource() successful');
        },
        function(error) {
            console.log('Illuminance: unregisterResource() failed with: ' +
                error + ' and result ' + error.result);
        });

    // Disable presence
    device.disablePresence().then(
        function() {
            console.log('Illuminance: device.disablePresence() successful');
        },
        function(error) {
            console.log('Illuminance: device.disablePresence() failed with: ' + error);
        });

    // Exit
    process.exit(0);
});