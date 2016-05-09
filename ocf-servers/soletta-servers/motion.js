var device = require( "iotivity-node" )( "server" ),
    _ = require( "lodash" ),
    motionResource,
    sensorPin,
    notifyObserversTimeoutId,
    resourceTypeName = "oic.r.sensor.motion",
    resourceInterfaceName = "/a/pir",
    hasUpdate = false,
    noObservers = false,
    sensorState = false;

// Require the Soletta GPIO library
var gpio = "";
try {
    gpio = require( "soletta/gpio" );
} catch ( e ) {
    console.log( "No GPIO module: " + e.message );
}

// Setup Motion sensor pin.
function setupHardware() {
    if ( !gpio ) {
        return;
    }

    gpio.open( {
        pin: 13,
        direction: "in"
    } ).then( function( pin ) {
        sensorPin = pin;
        pin.onchange = function( event ) {
            motion = event.value;
            if ( sensorState != motion ) {
                hasUpdate = true;
                sensorState = motion;
            }
        };
    } );

}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {

    // Simulate real sensor behavior. This is
    // useful for testing on desktop without mraa.
    if ( !gpio ) {
        hasUpdate = true;
        sensorState = !sensorState;
    }

    // Format the payload.
    var properties = {
        rt: resourceTypeName,
        id: "motionSensor",
        value: sensorState
    };

    return properties;
}

// Set up the notification loop
function notifyObservers() {
    properties = getProperties();

    if ( hasUpdate ) {
        motionResource.properties = properties;
        hasUpdate = false;

        console.log( "\nmotionSensor: Send the response: " + sensorState );
        device.notify( motionResource ).catch(
            function( error ) {
                console.log( "motionSensor: Failed to notify observers." );
                noObservers = error.noObservers;
                if ( noObservers ) {
                    if ( notifyObserversTimeoutId ) {
                        clearTimeout( notifyObserversTimeoutId );
                        notifyObserversTimeoutId = null;
                    }
                }
            } );
    }

    // After all our clients are complete, we don't care about any
    // more requests to notify.
    if ( !noObservers ) {
        notifyObserversTimeoutId = setTimeout( notifyObservers, 2000 );
    }
}

// Event handlers for the registered resource.
function observeHandler( request ) {
    motionResource.properties = getProperties();
    request.sendResponse( motionResource ).catch( handleError );

    noObservers = false;
    hasUpdate = true;

    if ( !notifyObserversTimeoutId ) {
        setTimeout( notifyObservers, 200 );
    }
}

function retrieveHandler( request ) {
    motionResource.properties = getProperties();
    request.sendResponse( motionResource ).catch( handleError );
}

device.device = _.extend( device.device, {
    name: "Smart Home Motion Sensor"
} );

function handleError( error ) {
    console.log( "motionSensor: Failed to send response with error " + error +
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

        // Setup Motion sensor pin.
        setupHardware();

        console.log( "\nCreate motion resource." );

        // Register Motion resource
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
                console.log( "motionSensor: registerResource() successful" );
                motionResource = resource;

                // Add event handlers for each supported request type
                device.addEventListener( "observerequest", observeHandler );
                device.addEventListener( "retrieverequest", retrieveHandler );
            },
            function( error ) {
                console.log( "motionSensor: registerResource() failed with: " +
                    error );
            } );
    },
    function( error ) {
        console.log( "motionSensor: device.enablePresence() failed with: " + error );
    } );

// Cleanup on SIGINT
process.on( "SIGINT", function() {
    console.log( "Delete Motion Resource." );

    // Remove event listeners
    device.removeEventListener( "observerequest", observeHandler );
    device.removeEventListener( "retrieverequest", retrieveHandler );

    // Unregister resource.
    device.unregisterResource( motionResource ).then(
        function() {
            console.log( "motionSensor: unregisterResource() successful" );
        },
        function( error ) {
            console.log( "motionSensor: unregisterResource() failed with: " +
                error + " and result " + error.result );
        } );

    // Disable presence
    device.disablePresence().then(
        function() {
            console.log( "motionSensor: device.disablePresence() successful" );
        },
        function( error ) {
            console.log( "motionSensor: device.disablePresence() failed with: " + error );
        } );

    // Exit
    process.exit( 0 );
} );
