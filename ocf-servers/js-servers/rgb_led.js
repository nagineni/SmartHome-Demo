var device = require('iotivity-node')(),
    rgbLEDResource,
    sensorPin,
    sensorState = false,
    resourceTypeName = 'oic.r.colour.rgb',
    resourceInterfaceName = '/a/rgbled',
    range = "0,255",
    rgbValue = "0,0,0",
    clockPin,
    dataPin;

// Require the MRAA library
var mraa = '';
try {
    mraa = require('mraa');
}
catch (e) {
    console.log('No mraa module: ' + e.message);
}

// Setup LED pin.
function setupHardware() {
    if (!mraa)
        return;

    clockPin = new mraa.Gpio(7);
    clockPin.dir(mraa.DIR_OUT);
    dataPin = new mraa.Gpio(8);
    dataPin.dir(mraa.DIR_OUT);

    setColourRGB(0, 0, 0);
}

function clk() {
    if (!mraa)
        return;

    clockPin.write(0);
    clockPin.write(1);
}

function sendByte(b) {
    if (!mraa)
        return;

    // send one bit at a time
    for (var i = 0; i < 8; i++) {
        if ((b & 0x80) != 0)
            dataPin.write(1);
        else
            dataPin.write(0);

        clk();
        b <<= 1;
  }
}

function sendColour(red, green, blue) {
    // start by sending a byte with the format "1 1 /B7 /B6 /G7 /G6 /R7 /R6"
    var prefix = 0xC0;

    if ((blue & 0x80) == 0) prefix |= 0x20;
    if ((blue & 0x40) == 0) prefix |= 0x10;
    if ((green & 0x80) == 0) prefix |= 0x08;
    if ((green & 0x40) == 0) prefix |= 0x04;
    if ((red & 0x80) == 0) prefix |= 0x02;
    if ((red & 0x40) == 0) prefix |= 0x01;

    sendByte(prefix);

    sendByte(blue);
    sendByte(green);
    sendByte(red);
}

// Set the RGB colour
function setColourRGB(red, green, blue) {
    // send prefix 32 x "0"
    sendByte(0x00);
    sendByte(0x00);
    sendByte(0x00);
    sendByte(0x00);

    sendColour(red, green, blue);

    // terminate data frame
    sendByte(0x00);
    sendByte(0x00);
    sendByte(0x00);
    sendByte(0x00);
}

function checkColour(colour) {
    var range_temp = range.split(',');
    var min = parseInt(range_temp[0]);
    var max = parseInt(range_temp[1]);

    if (colour >= min && colour <= max)
        return true;

    return false;
}

// This function parce the incoming Resource properties
// and change the sensor state.
function updateProperties(properties) {
    var input = properties.rgbValue;
    if (!input || !mraa)
        return;

    var rgb = input.split(',');
    var r = parseInt(rgb[0]);
    var g = parseInt(rgb[1]);
    var b = parseInt(rgb[2]);
    if (!checkColour(r) || !checkColour(g) || !checkColour(b))
        return;

    setColourRGB(r, g, b);
    rgbValue = input;

    console.log('\nrgbled: Update received. value: ' + rgbValue);
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    // Format the payload.
    var properties = {
        rt: resourceTypeName,
        id: 'rgbled',
        rgbValue: rgbValue,
        range: range
    };

    console.log('rgbled: Send the response. value: ' + rgbValue);
    return properties;
}

// Set up the notification loop
function notifyObservers(request) {
    rgbLEDResource.properties = getProperties();

    device.notify(rgbLEDResource).then(
        function() {
            console.log('rgbled: Successfully notified observers.');
        },
        function(error) {
            console.log('rgbled: Notify failed with ' + error + ' and result ' +
                error.result);
        });
}

// This is the entity handler for the registered resource.
function entityHandler(request) {
    if (request.type === 'update') {
        updateProperties(request.res);
    } else if (request.type === 'retrieve') {
        rgbLEDResource.properties = getProperties();
    }

    request.sendResponse(rgbLEDResource).then(
        function() {
            console.log('rgbled: Successfully responded to request');
        },
        function(error) {
            console.log('rgbled: Failed to send response with error ' + error +
                ' and result ' + error.result);
        });

    setTimeout(notifyObservers, 200);
}

// Create Fan resource
device.configure({
    role: 'server',
    info: {
        uuid: "SmartHouse.dollhouse",
        name: "SmartHouse",
        manufacturerName: "Intel",
        manufacturerDate: "Fri Oct 30 10:04:17 EEST 2015",
        platformVersion: "1.0.1",
        firmwareVersion: "0.0.1",
    }
}).then(
    function() {
        console.log('rgbled: device.configure() successful');

        // Enable presence
        device.enablePresence().then(
            function() {
                console.log('rgbled: device.enablePresence() successful');
            },
            function(error) {
                console.log('rgbled: device.enablePresence() failed with: ' + error);
            });

        // Setup Fan sensor pin.
        setupHardware();

        console.log('\nCreate RGB LED resource.');

        // Register Fan resource
        device.registerResource({
            id: { path: resourceInterfaceName },
            resourceTypes: [ resourceTypeName ],
            interfaces: [ 'oic.if.baseline' ],
            discoverable: true,
            observable: true,
            properties: getProperties()
        }).then(
            function(resource) {
                console.log('rgbled: registerResource() successful');
                rgbLEDResource = resource;
                device.addEventListener('request', entityHandler);
            },
            function(error) {
                console.log('rgbled: registerResource() failed with: ' + error);
            });
    },
    function(error) {
        console.log('rgbled: device.configure() failed with: ' + error);
    });

// Cleanup on SIGINT
process.on('SIGINT', function() {
    console.log('Delete RGB LED Resource.');

    // Turn off led before we tear down the resource.
    if (mraa) {
        rgbValue = "0,0,0";
        setColourRGB(0, 0, 0);
    }

    // Unregister resource.
    device.unregisterResource(rgbLEDResource).then(
        function() {
            console.log('rgbled: unregisterResource() successful');
        },
        function(error) {
            console.log('rgbled: unregisterResource() failed with: ' + error +
                ' and result ' + error.result);
        });

    // Disable presence
    device.disablePresence().then(
        function() {
            console.log('rgbled: device.disablePresence() successful');
        },
        function(error) {
            console.log('rgbled: device.disablePresence() failed with: ' + error);
        });

    // Exit
    process.exit(0);
});
