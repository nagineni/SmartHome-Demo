var device = require('iotivity-node')('server'),
    debuglog = require('util').debuglog('solar'),
    solarResource,
    lcdPin,
    pwmPin,
    resourceTypeName = 'oic.r.solar',
    resourceInterfaceName = '/a/solar',
    tiltPercentage = 0,
    lcd1 = 'Solar Connected!!',
    lcd2 = '',
    simulationTimerId = null, noObservers = false, simulationMode = false, updatePos = 0,
    solarProperties = {};

// Require the MRAA library
var mraa = '';
try {
    mraa = require('mraa');
}
catch (e) {
    debuglog('No mraa module: ', e.message);
}

var lcd = '';
try {
    lcd = require('jsupm_i2clcd');
}
catch (e) {
    debuglog('No lcd module: ', e.message);
}

function resetLCDScreen() {
    if (!lcd)
        return;

    lcdPin.clear();
    lcdPin.setColor(255, 0, 0);
    lcdPin.setCursor(0, 0);
    lcdPin.write('Solar');
    lcdPin.setCursor(1, 0);
    lcdPin.write('');
}

// Setup solar panel.
function setupHardware() {
    if (!mraa)
        return;

    if (lcd) {
        lcdPin = new lcd.Jhd1313m1(6, 0x3E, 0x62);
        resetLCDScreen();
    }

    pwmPin = new mraa.Pwm(3);
    pwmPin.period_ms(20);
    pwmPin.enable(true);

    pwmPin.write(0.05);
    debuglog('Solar panel initialization completed.');
}

function map(x, in_min, in_max, out_min, out_max) {
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

function updateSolarPanel(tiltPos, locationInfo, percentage) {
    if (tiltPos)
        tiltPercentage = tiltPos;

    if (!mraa)
        return;

    var val = map(tiltPercentage, 0, 100, .05, .10);
    debuglog('Update received. tiltPercentage: ', tiltPercentage);
    pwmPin.write(val);

    if (!lcd)
        return;

    if (locationInfo) {
        lcd1 = locationInfo;
        lcdPin.setCursor(0, 0);
        lcdPin.write(lcd1);
    }

    if (percentage) {
        lcd2 = percentage;
        lcdPin.setCursor(1, 0);
        lcdPin.write(lcd2);
    }
}

// Start the solar panel simulation mode.
function startSimulation(properties) {
    // Update tiltPercentage
    if (solarProperties.tiltPercentage <= 0) {
        solarProperties.lcd1.setHours(8);
        updatePos = 0.5;
    } else if (solarProperties.tiltPercentage >= 100) {
        solarProperties.tiltPercentage = 100;
        updatePos = -0.5;
    }
    solarProperties.tiltPercentage = solarProperties.tiltPercentage + updatePos;

    // Update LCD's first row with time and location.
    solarProperties.lcd1.setTime(solarProperties.lcd1.getTime() + 4*60*1000);
    var demoTime = solarProperties.lcd1.toTimeString().split(' ')[0];
    var locationInfo = demoTime + " " + solarProperties.locationInfo;

    // Update LCD's second row with tilt percentage.
    var percentage = Math.round(solarProperties.tiltPercentage).toFixed(1) + "%  ";

    updateSolarPanel(solarProperties.tiltPercentage, locationInfo, percentage);
    if (!noObservers)
        notifyObservers();

    simulationTimerId = setTimeout(startSimulation, 1000);
}

// This function parses the incoming resource properties
// and change the solar panel position.
function updateProperties(properties) {
    var tilt = properties.tiltPercentage;
    simulationMode = properties.simulationMode;

    // Cancel simulation mode before we parse the incoming request.
    if (simulationTimerId) {
        clearTimeout(simulationTimerId);
        simulationTimerId = null;
    }

    if (simulationMode) {
        if (isNaN(tilt))
            solarProperties.tiltPercentage = 0;
        else
            solarProperties.tiltPercentage = tilt;

        solarProperties.lcd1 = new Date();
        var locationInfo;
        if (properties.lcd2)
           locationInfo = properties.lcd2.split(' ')[1];

        if (locationInfo && typeof locationInfo === 'string')
            solarProperties.locationInfo = locationInfo;
        else
            solarProperties.locationInfo = "Europe/Helsinki"

        startSimulation();
    } else {
        updateSolarPanel(tilt, properties.lcd1, properties.lcd2);
    }
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    // Format the payload.
    var properties = {
        rt: resourceTypeName,
        id: 'solar',
        tiltPercentage: tiltPercentage,
        lcd1: lcd1,
        lcd2: lcd2,
        simulationMode: simulationMode
    };

    debuglog('Send the response. tiltPercentage: ', tiltPercentage);
    return properties;
}

function processObserve() {
    if (!lcd)
        return;

    lcdPin.setColor(0, 255, 0);

    lcdPin.setCursor(0, 0);
    lcdPin.write(lcd1);
    lcdPin.setCursor(1, 0);
    lcdPin.write(lcd2);
}

// Set up the notification loop
function notifyObservers(request) {
    solarResource.properties = getProperties();

    device.notify(solarResource).catch(
        function(error) {
            debuglog('Failed to notify observers with error: ', error);
            noObservers = error.noObservers;
            if (noObservers) {
                resetLCDScreen();
            }
        });
}

// Event handlers for the registered resource.
function observeHandler(request) {
    processObserve();
    noObservers = false;
    request.sendResponse(solarResource).catch(handleError);
    setTimeout(notifyObservers, 200);
}

function retrieveHandler(request) {
    solarResource.properties = getProperties();
    request.sendResponse(solarResource).catch(handleError);
}

function changeHandler(request) {
    updateProperties(request.res);

    solarResource.properties = getProperties();
    request.sendResponse(solarResource).catch(handleError);
    setTimeout(notifyObservers, 200);
}

device.device = Object.assign(device.device, {
    name: 'Smart Home Solar',
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
        // Setup Solar sensor.
        setupHardware();

        debuglog('Create Solar resource.');

        // Register Solar resource
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
                solarResource = resource;

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
    debuglog('Delete Solar Resource.');

    // Stop moving solar panel before we tear down the resource.
    if (simulationTimerId)
        clearTimeout(simulationTimerId);

    // Reset LCD screen.
    resetLCDScreen();

    // Remove event listeners
    device.removeEventListener('observerequest', observeHandler);
    device.removeEventListener('retrieverequest', retrieveHandler);
    device.removeEventListener('changerequest', changeHandler);

    // Unregister resource.
    device.unregister(solarResource).then(
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
