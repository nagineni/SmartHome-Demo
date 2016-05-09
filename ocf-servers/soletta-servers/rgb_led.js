var device = require( "iotivity-node" )( "server" ),
    _ = require( "lodash" ),
    rgbLEDResource,
    resourceTypeName = "oic.r.colour.rgb",
    resourceInterfaceName = "/a/rgbled",
    range = "0,255",
    rgbValue = "0,0,0",
    clockPin,
    dataPin;

// Require the Soletta GPIO library
var gpio = "";
try {
    gpio = require( "soletta/gpio" );
} catch ( e ) {
    console.log( "No GPIO module: " + e.message );
}

// Setup LED pin.
function setupHardware() {
    if ( !gpio ) {
        return;
    }

    gpio.open( {
        pin: 48
    } ).then( function( pin ) {
        clockPin = pin;
    } );

    gpio.open( {
        pin: 49
    } ).then( function( pin ) {
        dataPin = pin;
        setColourRGB( 0, 0, 0 );
    } );
}

function clk() {
    if ( !gpio ) {
        return;
    }

    clockPin.write( false );
    clockPin.write( true );
}

function sendByte( b ) {
    if ( !gpio ) {
        return;
    }

    // Send one bit at a time
    for ( var i = 0; i < 8; i++ ) {
        if ( ( b & 0x80 ) != 0 ) {
            dataPin.write( true );
        } else {
            dataPin.write( false );
        }

        clk();
        b <<= 1;
    }
}

function sendColour( red, green, blue ) {

    // Start by sending a byte with the format "1 1 /B7 /B6 /G7 /G6 /R7 /R6"
    var prefix = 0xC0;

    if ( ( blue & 0x80 ) == 0 ) { prefix |= 0x20; };
    if ( ( blue & 0x40 ) == 0 ) { prefix |= 0x10; };
    if ( ( green & 0x80 ) == 0 ) { prefix |= 0x08; };
    if ( ( green & 0x40 ) == 0 ) { prefix |= 0x04; };
    if ( ( red & 0x80 ) == 0 ) { prefix |= 0x02; };
    if ( ( red & 0x40 ) == 0 ) { prefix |= 0x01; };

    sendByte( prefix );

    sendByte( blue );
    sendByte( green );
    sendByte( red );
}

// Set the RGB colour
function setColourRGB( red, green, blue ) {

    // Send prefix 32 x "0"
    sendByte( 0x00 );
    sendByte( 0x00 );
    sendByte( 0x00 );
    sendByte( 0x00 );

    sendColour( red, green, blue );

    // Terminate data frame
    sendByte( 0x00 );
    sendByte( 0x00 );
    sendByte( 0x00 );
    sendByte( 0x00 );
}

function checkColour( colour ) {
    var rangeTemp = range.split( "," );
    var min = parseInt( rangeTemp[ 0 ] );
    var max = parseInt( rangeTemp[ 1 ] );

    if ( colour >= min && colour <= max ) {
        return true;
    }

    return false;
}

// This function parce the incoming Resource properties
// and change the sensor state.
function updateProperties( properties ) {
    var input = properties.rgbValue;
    if ( !input || !gpio ) {
        return;
    }

    var rgb = input.split( "," );
    var r = parseInt( rgb[ 0 ] );
    var g = parseInt( rgb[ 1 ] );
    var b = parseInt( rgb[ 2 ] );
    if ( !checkColour( r ) || !checkColour( g ) || !checkColour( b ) ) {
        return;
    }

    setColourRGB( r, g, b );
    rgbValue = input;

    console.log( "\nrgbled: Update received. value: " + rgbValue );
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {

    // Format the payload.
    var properties = {
        rt: resourceTypeName,
        id: "rgbled",
        rgbValue: rgbValue,
        range: range
    };

    console.log( "rgbled: Send the response. value: " + rgbValue );
    return properties;
}

// Set up the notification loop
function notifyObservers( request ) {
    rgbLEDResource.properties = getProperties();

    device.notify( rgbLEDResource ).then(
        function() {
            console.log( "rgbled: Successfully notified observers." );
        },
        function( error ) {
            console.log( "rgbled: Notify failed with " + error + " and result " +
                error.result );
        } );
}

// Event handlers for the registered resource.
function observeHandler( request ) {
    request.sendResponse( rgbLEDResource ).catch( handleError );
    setTimeout( notifyObservers, 200 );
}

function retrieveHandler( request ) {
    rgbLEDResource.properties = getProperties();
    request.sendResponse( rgbLEDResource ).catch( handleError );
}

function updateHandler( request ) {
    updateProperties( request.res );

    rgbLEDResource.properties = getProperties();
    request.sendResponse( rgbLEDResource ).catch( handleError );
    setTimeout( notifyObservers, 200 );
}

device.device = _.extend( device.device, {
    name: "Smart Home RGB LED"
} );

function handleError( error ) {
    console.log( "rgbled: Failed to send response with error " + error +
        " and result " + error.result );
}

device.platform = _.extend( device.platform, {
    manufacturerName: "Intel",
    manufactureDate: new Date( "Fri Oct 30 10:04:17 EEST 2015" ),
    platformVersion: "1.1.0",
    firmwareVersion: "0.0.1"
} );

// Enable presence
device.enablePresence().then(
    function() {

        // Setup RGB LED sensor pin.
        setupHardware();

        console.log( "\nCreate RGB LED resource." );

        // Register RGB LED resource
        device.registerResource( {
            id: {
                path: resourceInterfaceName
            },
            resourceTypes: [ resourceTypeName ],
            interfaces: [ "oic.if.baseline" ],
            discoverable: true,
            observable: true,
            properties: getProperties()
        } ).then(
            function( resource ) {
                console.log( "rgbled: registerResource() successful" );
                rgbLEDResource = resource;

                // Add event handlers for each supported request type
                device.addEventListener( "observerequest", observeHandler );
                device.addEventListener( "retrieverequest", retrieveHandler );
                device.addEventListener( "updaterequest", updateHandler );
            },
            function( error ) {
                console.log( "rgbled: registerResource() failed with: " + error );
            } );
    },
    function( error ) {
        console.log( "rgbled: device.enablePresence() failed with: " + error );
    } );

// Cleanup on SIGINT
process.on( "SIGINT", function() {
    console.log( "Delete RGB LED Resource." );

    // Turn off led before we tear down the resource.
    if ( gpio ) {
        rgbValue = "0,0,0";
        setColourRGB( 0, 0, 0 );
    }

    // Remove event listeners
    device.removeEventListener( "observerequest", observeHandler );
    device.removeEventListener( "retrieverequest", retrieveHandler );
    device.removeEventListener( "updaterequest", updateHandler );

    // Unregister resource.
    device.unregisterResource( rgbLEDResource ).then(
        function() {
            console.log( "rgbled: unregisterResource() successful" );
        },
        function( error ) {
            console.log( "rgbled: unregisterResource() failed with: " + error +
                " and result " + error.result );
        } );

    // Disable presence
    device.disablePresence().then(
        function() {
            console.log( "rgbled: device.disablePresence() successful" );
        },
        function( error ) {
            console.log( "rgbled: device.disablePresence() failed with: " + error );
        } );

    // Exit
    process.exit( 0 );
} );
