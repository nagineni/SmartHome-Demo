var device = require('iotivity-node')('server'),
    debuglog = require('util').debuglog('temperature'),
    temperatureResource,
    sensorPin,
    beta = 3975, // Value of the thermistor
    resourceTypeName = 'oic.r.temperature',
    resourceInterfaceName = '/a/temperature',
    notifyObserversTimeoutId,
    hasUpdate = false,
    noObservers = false,
    temperature = 0,
    desiredTemperature = 0;

// Units for the temperature.
var units = {
    C: "C",
    F: "F",
    K: "K",
};

// Require the MRAA library.
var mraa = '';
try {
    mraa = require('mraa');
}
catch (e) {
    debuglog('No mraa module: ', e.message);
}

// Setup Temperature sensor pin.
function setupHardware() {
    if (mraa) {
       sensorPin = new mraa.Aio(1);
    }
}

// Get the range property value for temperature
// based on the unit attribute.
function getRange(tempUnit) {
    var range;

    switch (tempUnit) {
        case units.F:
            range = "-40,257";
            break;
        case units.K:
            range = "233.15,398.15";
            break;
        case units.C:
        default:
            range = "-40,125"
            break;
    }

    return range;
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties(tempUnit) {
    if (mraa) {
        var raw_value = sensorPin.read();
        var temp = 0.0;

        // Get the resistance of the sensor
        var resistance = (1023 - raw_value) * 10000 / raw_value;
        var Ktemperature = 1 / (Math.log(resistance / 10000) / beta + 1 / 298.15);

        switch (tempUnit) {
            case units.F:
                temperature = Math.round(((Ktemperature - 273.15) * 9.0 / 5.0 + 32.0) * 100) / 100;
                debuglog("Temperature in Fahrenheit: ", temperature);
                break;
            case units.K:
                temperature = Math.round(Ktemperature * 100) / 100;
                debuglog("Temperature in Kelvin: ", temperature);
                break;
            case units.C:
            default:
                temperature = Math.round((Ktemperature - 273.15) * 100) / 100;
                debuglog("Temperature in Celsius: ", temperature);
                break;
        }

        if (temperature >= desiredTemperature)
            hasUpdate = true;
    } else {
        // Simulate real sensor behavior. This is useful
        // for testing on desktop without mraa.
        temperature = temperature + 0.1;
        debuglog("Temperature: ", temperature);
        hasUpdate = true;
    }

    // Format the properties.
    var properties = {
        rt: resourceTypeName,
        id: 'temperature',
        temperature: temperature,
        units: tempUnit,
        range: getRange(tempUnit)
    };

    return properties;
}

function updateProperties(properties) {
    var range_temp = getRange(units.C).split(',');
    var min = parseInt(range_temp[0]);
    var max = parseInt(range_temp[1]);

    if (properties.temperature < min || properties.temperature > max)
        return false;

    desiredTemperature = properties.temperature;
    debuglog('Desired value: ', desiredTemperature);

    return true;
}

// Set up the notification loop
function notifyObservers() {
    var properties = getProperties(units.C);
    if (hasUpdate) {
        temperatureResource.properties = properties;
        hasUpdate = false;

        debuglog('Send the response: ', temperature);
        device.notify(temperatureResource).catch(
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
    temperatureResource.properties = getProperties(units.C);
    request.sendResponse(temperatureResource).catch(handleError);

    noObservers = false;
    hasUpdate = true;

    if (!notifyObserversTimeoutId)
        setTimeout(notifyObservers, 200);
}

function retrieveHandler(request) {
    if (request.queryOptions && request.queryOptions.units) {
        if (!(request.queryOptions.units in units)) {
            // Format the error properties.
            var error = {
                id: 'temperature',
                units: request.queryOptions.units
            };

            request.sendError(error);
            return;
        }

        temperatureResource.properties = getProperties(request.queryOptions.units);
    } else {
        temperatureResource.properties = getProperties(units.C);
    }

    request.sendResponse(temperatureResource).catch(handleError);
}

function changeHandler(request) {
    var ret = updateProperties(request.res);

    if (!ret) {
        // Format the error properties.
        var error = {
            id: 'temperature',
            range: getRange(units.C)
        };

        request.sendError(error);
        return;
    }

    temperatureResource.properties = getProperties(units.C);
    request.sendResponse(temperatureResource).catch(handleError);

    setTimeout(notifyObservers, 200);
}

device.device = Object.assign(device.device, {
    name: 'Smart Home Temperature Sensor',
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

        // Setup Temperature sensor pin.
        setupHardware();

        debuglog('Create Temperature resource.');

        // Register Temperature resource
        device.register({
            id: { path: resourceInterfaceName },
            resourceTypes: [ resourceTypeName ],
            interfaces: [ 'oic.if.baseline' ],
            discoverable: true,
            observable: true,
            properties: getProperties(units.C)
        }).then(
            function(resource) {
                debuglog('register() resource successful');
                temperatureResource = resource;

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
    debuglog('Delete temperature Resource.');

    // Remove event listeners
    device.removeEventListener('observerequest', observeHandler);
    device.removeEventListener('retrieverequest', retrieveHandler);
    device.removeEventListener('changerequest', changeHandler);

    // Unregister resource.
    device.unregister(temperatureResource).then(
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
