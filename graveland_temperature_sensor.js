const {temperature, identify, onOff} = require('zigbee-herdsman-converters/lib/modernExtend');
const ota = require('zigbee-herdsman-converters/lib/ota');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const e = exposes.presets;
const ea = exposes.access;

const fzLocal = {
    reset_count: {
        cluster: 'haDiagnostic',
        type: ['attributeReport', 'readResponse'],
        convert: (model, msg, publish, options, meta) => {
            if (msg.data.numberOfResets !== undefined) {
                return {reset_count: msg.data.numberOfResets};
            }
        },
    },
};

const definition = {
    zigbeeModel: ['Temperature Sensor'],
    model: 'Temperature Sensor',
    vendor: 'graveland',
    description: 'Temperature sensor (mains powered)',
    extend: [
        temperature(),
        identify(),
    ],
    exposes: [
        e.switch_().withEndpoint('reboot'),
        e.numeric('reset_count', ea.STATE).withDescription('Number of device resets'),
    ],
    fromZigbee: [
        fz.on_off,
        fzLocal.reset_count,
    ],
    toZigbee: [
        tz.on_off,
    ],
    endpoint: (device) => {
        return {reboot: 10};
    },
    ota: {
        isUpdateAvailable: async (device, logger, data = null) => {
            return ota.isUpdateAvailable(device, logger, data, {
                imageBlockResponseDelay: 500,
            });
        },
        updateToLatest: async (device, logger, onProgress) => {
            return ota.updateToLatest(device, logger, onProgress, {
                imageBlockResponseDelay: 500,
            });
        },
    },
    configure: async (device, coordinatorEndpoint) => {
        const endpoint = device.getEndpoint(1);

        // Bind power config and temperature measurement clusters for reporting
        await endpoint.bind('genPowerCfg', coordinatorEndpoint);
        await endpoint.bind('msTemperatureMeasurement', coordinatorEndpoint);

        // Configure temperature reporting
        await endpoint.configureReporting('msTemperatureMeasurement', [
            {
                attribute: 'measuredValue',
                minimumReportInterval: 5,     // Report at least every 5 second
                maximumReportInterval: 300,   // Report every 5 minutes
                reportableChange: 50,         // Report on 1.0°C change (value is in 0.01°C units)
            }
        ]);

        // Configure reboot switch endpoint
        const rebootEndpoint = device.getEndpoint(10);
        if (rebootEndpoint) {
            await rebootEndpoint.bind('genOnOff', coordinatorEndpoint);
            await rebootEndpoint.read('genOnOff', ['onOff']);
        }

        // Read reset count from diagnostics cluster
        await endpoint.read('haDiagnostic', ['numberOfResets']);
    },
};

module.exports = definition;
