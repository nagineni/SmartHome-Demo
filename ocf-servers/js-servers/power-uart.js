// Copyright 2017 Intel Corporation
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var debuglog = require('util').debuglog('power-uart'),
    powerResource,
    uart,
    resourceTypeName = 'oic.r.energy.consumption',
    resourceInterfaceName = '/a/power',
    notifyObserversTimeoutId,
    exitId,
    hasUpdate = false,
    observerCount = 0,
    power1 = 100,  // For simulation only
    power2 = 1000, // Ditto
    simulationMode = false,
    secureMode = true;

var BLE_DEV_NAME = 'Zephyr DC Power Meter',
    powerServiceUUID = '9c10c448308244cd853d08266c070be5',
    consumptionCharacteristicUUID = '71c9e918830247aa89d37bf67152237a',
    solarCharacteristicUUID = '0609e802afd24d56b61c12ba1f80ccb6',
    blePeripheral = null;

// Parse command-line arguments
var args = process.argv.slice(2);
args.forEach(function(entry) {
    if (entry === "--simulation" || entry === "-s") {
        simulationMode = true;
        debuglog('Running in simulation mode');
    } else if (entry === "--no-secure") {
        secureMode = false;
    }
});

// Create appropriate ACLs when security is enabled
if (secureMode) {
    debuglog('Running in secure mode');
    require('./config/json-to-cbor')(__filename, [{
        href: resourceInterfaceName,
        rel: '',
        rt: [resourceTypeName],
        'if': ['oic.if.baseline']
    }], true);
}

var device = require('iotivity-node');

var noble = '';
if (!simulationMode) {
    try {
        noble = require('noble');
    }
    catch(e) {
        console.log('No noble module: ' + e.message);
        console.log('Attempting to use wire connection.');
    }
}

// Require the MRAA library
var mraa = '',
    serialDev = '/dev/ttyUSB0';

if (!simulationMode) {
    if (!noble) {
        try {
            mraa = require('mraa');
        }
        catch (e) {
            debuglog('No mraa module: ', e.message);
            debuglog('Automatically switching to simulation mode');
            simulationMode = true;
        }

    if (mraa) {
           /* Default: MinnowBoard MAX/Turbot, raw mode
            * or specify the port, e.g, "$ node power-uart.js /dev/ttyS0
            */
            args.forEach(function(entry) {
                if (entry !== "--simulation" && entry !== "-s")
                    serialDev = entry;
            });
        }
    }
}

// Setup BLE or UART
function setupHardware() {
    if (noble) {
        // intitialize BLE, make sure BT is enabled with 'rfkill unblock bluetooth'
        noble.on('stateChange', function(state) {
            debuglog('on -> stateChange');
            if (state == 'poweredOn') {
                // only search for devices with custom power service UUID
                //noble.startScanning([powerServiceUUID], true);
                noble.startScanning();
            } else {
                noble.stopScanning();
            }
        });

        noble.on('scanStart', function() {
            debuglog('on -> scanStart');
        });

        noble.on('scanStop', function() {
            debuglog('on -> scanStop');
        });

        noble.on('discover', function(peripheral) {
            debuglog('on -> discover: ' + peripheral);
            if (peripheral.advertisement.localName == BLE_DEV_NAME) {
                debuglog('serviceUuids = ' + peripheral.advertisement.serviceUuids);

                blePeripheral = peripheral;

                noble.stopScanning();

                peripheral.on('connect', function() {
                    debuglog('on -> connect');
                    this.discoverServices();
                });

                peripheral.on('disconnect', function() {
                    debuglog('on -> disconnect');
                    blePeripheral = null;
                    noble.startScanning();
                });

                peripheral.connect(function(error) {
                    if (error) {
                        debuglog('Connection error');
                    }
                });

                peripheral.on('servicesDiscover', function(services) {
                    var powerService = null;

                    for (var i in services) {
                        debuglog('on -> service discovery: ' + i + ' uuid: ' + services[i].uuid);
                        if (services[i].uuid == powerServiceUUID) {
                            powerService = services[i];
                        }
                    }

                    if (powerService) {
                        powerService.on('characteristicsDiscover', function(characteristics) {
                            var consumptionCharacteristic = null;
                            var solarCharacteristic = null;

                            if (characteristics.length != 2) {
                                debuglog('WARNING: Number of characternistics is different!');
                            }

                            for (var i = 0; i < characteristics.length; i++) {
                                if (characteristics[i].uuid == consumptionCharacteristicUUID) {
                                    consumptionCharacteristic = characteristics[i];
                                }
                                else if (characteristics[i].uuid == solarCharacteristicUUID) {
                                    solarCharacteristic = characteristics[i];
                                }
                            }

                            if (consumptionCharacteristic) {
                                consumptionCharacteristic.on('read', function(data, isNotification) {
                                    power1 = data.readUInt32LE(0);
                                    debuglog('Consumption = ', power1 + ' mW');
                                });

                                consumptionCharacteristic.notify(true, function(error) {
                                    debuglog('Consumption notification ON');
                                });
                            }

                            if (solarCharacteristic) {
                                solarCharacteristic.on('read', function(data, isNotification) {
                                    power2 = data.readUInt32LE(0);
                                    debuglog('Solar = ', power2 + ' mW');
                                });

                                solarCharacteristic.notify(true, function(error) {
                                    debuglog('Solar notification ON');
                                });
                            }
                        });

                        powerService.discoverCharacteristics();
                    }
                });
            }
        });
    }
    else if (mraa) {
        uart = new mraa.Uart(serialDev);
        uart.setBaudRate(115200);
        uart.setMode(8, 0, 1);
        uart.setFlowcontrol(false, false);
    }
}

// Read simple json records from the uart.
// The format of the incoming UART data is:
//   {"ch-1": 0, "ch-2": 0}
// Since the UART is constanty sending data we need to:
//   - sync to the start of the record
//   - read all the records but use only the last one
// TODO: we might want to add simple protocol to UART, like sending a read cmd.
function readJsonFromUart() {

    var start = false; end = false;

    var json = '', last = '', count = 0;

    while (uart.dataAvailable(0)) {
        var ch = uart.readStr(1);
        count++;
        if (ch == '{')
            start = true;
        else if (ch == '}' && start == true)
            end = true;

        if (start == true)
            json += ch;

        if (start == true && end == true) {
            last = json;
            start = end = false;
            json = "";
        }
        /* In some cases the reading wont stop, make it stop. */
        if (count >= 4096) {
            debuglog('UART read error.');
            break;
        }
    }
    debuglog('read: %d bytes', count);
    return last;
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    var data = null;
    var obj = {"ch-1": 0, "ch-2": 0};

    if (!simulationMode) {
        if (noble) {
            data = "{\"ch-1\": " + power1 + ", \"ch-2\": " + power2 + "}";
        } else if (mraa) {
            data = readJsonFromUart();
        }
    } else {
        // Simulate real sensor behavior. This is useful for testing.
        data = "{\"ch-1\": " + power1++ + ", \"ch-2\": " + power2++ + "}";
    }

    if (data != null && data != "") {
        debuglog(data);
        hasUpdate = true;
    }

    try {
        obj = JSON.parse(data);
    }
    catch (e) {
        debuglog('Invalid data: ', e.message);
    }

    // Format the properties.
    var properties =
    {
        rt: resourceTypeName,
        id: 'power',
        power1: obj["ch-1"],
        power2: obj["ch-2"]
    };

    return properties;
}

// Set up the notification loop
function notifyObservers() {
    var properties = getProperties();

    notifyObserversTimeoutId = null;
    if (hasUpdate) {
        powerResource.properties = properties;
        hasUpdate = false;

        debuglog('Send observe response.');
        powerResource.notify().catch(
            function(error) {
                debuglog('Failed to notify observers with error: ', error);
                if (error.observers.length === 0) {
                    observerCount = 0;
                    if (notifyObserversTimeoutId) {
                        clearTimeout(notifyObserversTimeoutId);
                        notifyObserversTimeoutId = null;
                    }
                }
            });
    }

    // After all our clients are complete, we don't care about any
    // more requests to notify.
    if (observerCount > 0) {
        notifyObserversTimeoutId = setTimeout(notifyObservers, 2000);
    }
}

// Event handlers for the registered resource.
function retrieveHandler(request) {
    powerResource.properties = getProperties();
    request.respond(powerResource).catch(handleError);

    if ('observe' in request) {
        hasUpdate = true;
        observerCount += request.observe ? 1 : -1;
        if (!notifyObserversTimeoutId && observerCount > 0)
            setTimeout(notifyObservers, 200);
    }

}

device.device = Object.assign(device.device, {
    name: 'Smart Home Energy Consumption',
    coreSpecVersion: 'core.1.1.0',
    dataModels: ['res.1.1.0']
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

if (device.device.uuid) {
    // Setup uart
    setupHardware();

    debuglog('Create Power resource.');

    // Register Power resource
    device.server.register({
        resourcePath: resourceInterfaceName,
        resourceTypes: [resourceTypeName],
        interfaces: ['oic.if.baseline'],
        discoverable: true,
        observable: true,
        properties: getProperties()
    }).then(
        function(resource) {
            debuglog('register() resource successful');
            powerResource = resource;

            // Add event handlers for each supported request type
            resource.onretrieve(retrieveHandler);
        },
        function(error) {
            debuglog('register() resource failed with: ', error);
        });
}

// Cleanup when interrupted
function exitHandler() {
    debuglog('Disconnect any existing BLE connection');
    if (blePeripheral) {
        blePeripheral.disconnect(function(err) {
            if (err) {
                debuglog('Disconnection error: ' + err);
            }
        });
    }

    debuglog('Delete Power Resource.');

    if (exitId)
        return;

    if (notifyObserversTimeoutId) {
        clearTimeout(notifyObserversTimeoutId);
        notifyObserversTimeoutId = null;
    }

    // Unregister resource.
    powerResource.unregister().then(
        function() {
            debuglog('unregister() resource successful');
        },
        function(error) {
            debuglog('unregister() resource failed with: ', error);
        });

    // Exit
    exitId = setTimeout(function() { process.exit(0); }, 1000);
}

// Exit gracefully
process.on('SIGINT', exitHandler);
process.on('SIGTERM', exitHandler);
