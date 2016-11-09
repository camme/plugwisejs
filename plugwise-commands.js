
var colors = require('./colors').colors;


// power functions
function pulseCorrection(pulses, timespanSource, timespanTarget, gainA, gainB, offTot, offNoise) {

    if (pulses == 0) {
        return pulses;
    }

    var corrected = 0;
    var value = pulses / timespanSource;
    //console.log("pulses per sec", value);
    var out = timespanTarget * (((Math.pow(value + offNoise, 2) * gainB) + ((value + offNoise) * gainA)) + offTot);
    //console.log("pulses per sec after correction:", out);
    return out;

}

// converts pulses to the watt unit.
function pulsesToWatt(pulses) {
    return pulsesToKwh(pulses * 1000);
}

// converts pulses to the kWh unit.
function pulsesToKwh(pulses) {
    return (pulses / 3600.0) / 468.9385193;
}

// list of command codes for the protocol
exports.protocolCommands = {
    info: {
        name: "Info",
        request: '0023',
        response: '0024',
        infoSplit: [4,4,16,2,2,4,8,2,2],
        parseFunction: function(pw, data) {
            pw.data.relay = data[7] == "01";
            pw.data.logAddress = (parseInt(data[6], 16) - 278528) / 32
            pw.data.logAddressHex = data[6];

            pw.data.year = parseInt(data[3], 16) + 2000;
            pw.data.month = parseInt(data[4], 16);
            pw.data.minutes = parseInt(data[5], 16);
            pw.data.clock = new Date(pw.data.year, pw.data.month - 1, 0, 0, pw.data.minutes);

            return {relay: pw.data.relay, clock: pw.data.clock};
        },
        parseInfo: {
            'responseCode' : { length: 4, name: 'Response code' },
            'mac': { length: 16, name: 'Mac address' }, 
            'year': {length: 2, name: 'Year' },
            'month': { length: 2, name: 'Month' },
            'minutes': {length: 4, name: 'Minutes' },
            'logBufferAddress': { length: 9, name: 'Log buffer address' },
            'relayStatus': { length: 2, name: 'Relay status' },
            'hertz': { length: 2, name: 'Hertz' }
        },
        color: colors.navy
    },
    calibration: {
        name: "Calibration",
        request: '0026',
        response: '0027',
        infoSplit: [4,4,16,8,8,8,8,4],
        color: colors.teal,
        parseFunction: function(pw, data) {

            var calibration = pw.data.calibration = { };

            try {
                calibration.gainA = new Buffer(data[3], 'hex').readFloatBE(0);
                calibration.gainB = new Buffer(data[4], 'hex').readFloatBE(0);
                calibration.offTot = new Buffer(data[5], 'hex').readFloatBE(0);
                calibration.offNoise = new Buffer(data[6], 'hex').readFloatBE(0);
            }
            catch(err) {
                console.log("ERROR IN PLUGWISE COMMANDS", err);
            }

        }
    },
    powerinfo: {
        name: "Power info",
        request: '0012',
        response: '0013',
        infoSplit: [4,4,16,4,4,8,4,4,4,4],
        color: colors.lime,
        parseFunction: function(pw, data) {

            if (data[4] === 'FFFF') {
                return {error: true, message: 'Got unknown pulse value "FFFF". Too much?'};
            }

            pw.data.powerInfo = {};

            var pulsesOneSecond = parseInt(data[3], 16);
            var pulsesEightSeconds = parseInt(data[4], 16);
            var pulsesTotal = parseInt(data[5], 16);

            if (pw.data.calibration) {
                var pulses =  pulseCorrection(
                    pulsesEightSeconds,
                    8,
                    60*60,
                    pw.data.calibration.gainA,
                    pw.data.calibration.gainB,
                    pw.data.calibration.offTot,
                    pw.data.calibration.offNoise
                );
                var watt = pulsesToWatt(pulses);
                var kwh = pulsesToKwh(pulses);

                return {watt: watt, kWh: kwh, pulses: pulses};
            }
            else {
                return {error: true, message: 'no calibration data'};
            }


        }
    },

    powerbufferinfo: {
        name: "Power buffer info",
        request: '0048',
        response: '0049',
        infoSplit: [4,4,16,8,8,8,8,8,8,8,8,8,4],
        color: colors.lime,
        parseFunction: function(pw, data) {

            var dates = [];

            for(var i = 0, ii = 4; i < ii; i++){

                var year = parseInt(data[i * 2 + 3].substring(0, 2), 16) + 2000;
                var month = parseInt(data[i * 2 + 3].substring(2, 4), 16) - 1;
                var minutes = parseInt(data[i * 2 + 3].substring(4, 8), 16);

                //console.log(year, data[i * 2 + 3].substring(0, 2));
                //console.log(month, data[i * 2 + 3].substring(2, 4));
                //console.log(minutes, data[i * 2 + 3].substring(4, 8));
                //console.log("-");

                var day = Math.ceil(minutes / (60 * 24));

                var pulses =  pulseCorrection(
                    parseInt(data[i * 2 + 4], 16),
                    8,
                    60*60,
                    pw.data.calibration.gainA,
                    pw.data.calibration.gainB,
                    pw.data.calibration.offTot,
                    pw.data.calibration.offNoise
                );
                var watt = pulsesToWatt(pulses);
                var kwh = pulsesToKwh(pulses);

                dates.push({
                    date: new Date(year, month, 0, 0, minutes),
                    info: {watt: watt, kWh: kwh, pulses: pulses}
                });

            }

            return dates;

        }
    },
 
    setclock: {
        name: "Restart",
        request: '0016',
        response: '0011',
        infoSplit: [4,4,16],
        color: colors.green
    },
 
    restart: {
        name: "Restart",
        request: '0008',
        response: '0011',
        infoSplit: [4,4,16,2,2,16,4,2,4],
        color: colors.green
    },
    init: {
        name: "Init",
        request: '000A',
        response: '0011',
        infoSplit: [4,4,16,2,2,16,4,2,4],
        color: colors.magenta
    },
    switch: {
        name: "Switch",
        request: '0017',
        response: '0018',
        color: colors.cyan,
        parseFunction: function(pw, data) {
            pw.data.relay = data[2] == "00D8";
        }
    },
    ack: {
        name: "Ack",
        response: '0000',
        infoSplit: [4,4,4],
        color: colors.brown
    },
    frames: {
        start: '\x05\x05\x03\x03',
        end: '\r'
    }
}


