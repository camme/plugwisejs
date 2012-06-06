/*********************************************************************************
 *
 * Plugwise API for nodejs
 *
 * Exposes the basic commands to control and read plugwise circles through nodejs
 *
 * Written by Camilo Tapia, http://www.onezerozeroone.com/
 *
 *********************************************************************************/

var serialport = require('serialport');
var crc = require('crc');
var SerialPort = serialport.SerialPort; // localize object constructor

// useful colors for bash
var colors = {
    black: "\x1b[0;30m",
    dkgray: "\x1b[1;30m",
    brick: "\x1b[0;31m",    
    red: "\x1b[1;31m",
    green: "\x1b[0;32m",    
    lime: "\x1b[1;32m",
    brown: "\x1b[0;33m",    
    yellow: "\x1b[1;33m",
    navy: "\x1b[0;34m", 
    blue: "\x1b[1;34m",
    violet: "\x1b[0;35m",   
    magenta: "\x1b[1;35m",
    teal: "\x1b[0;36m", 
    cyan: "\x1b[1;36m",
    ltgray: "\x1b[0;37m",   
    white: "\x1b[1;37m",
    reset: "\x1b[0m"
};

// list of command codes for the protocol
var protocolCommands = {
    info: {
        name: "Info",
        request: '0023',
        response: '0024',
        infoSplit: [4,4,16,2,2,4,8,2,2],
        parseInfo: {
            'responseCode' : { length: 4, name: 'Response code' },
            'mac': { length: 16, name: 'Mac address' }, 
            'year': {length: 2, name: 'Year' },
            'month': { length: 2, name: 'Month' },
            'minutes': {length: 4, name: 'Minutes' },
            'logBufferAddress': { length: 8, name: 'Log buffer address' },
            'relayStatus': { length: 2, name: 'Relay status' },
            'hertz': { length: 2, name: 'Hertz' }
        },
        color: colors.navy
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
        color: colors.cyan
    },
    ack: {
        name: "Ack",
        response: '0000',
        infoSplit: [4,4,4],
        color: colors.violet
    },
    frames: {
        start: '\x05\x05\x03\x03',
        end: '\r'
    }
}

var commandResponses = {};
for(var key in protocolCommands) {
    var protocolCommandInfo = protocolCommands[key];
    commandResponses[protocolCommandInfo.response] = {
        infoSplit: protocolCommandInfo.infoSplit,
        name: protocolCommandInfo.name,
        color: protocolCommandInfo.color
    };
}

// found this code to check for special characters
function unicodeEscape(str) {
    return str.replace(/[\s\S]/g, function(character) {
        var escape = character.charCodeAt().toString(16),
        longhand = escape.length > 2;
        return '\\' + (longhand ? 'u' : 'x') + ('0000' + escape).slice(longhand ? -4 : -2);
    });
}

function parseResponse(responseCodeParts, data) {
    var infoData = {};      
    var cursor = 4;
    for(var key in responseCodeParts) {
        infoData[key] = {value: data.substr(cursor, responseCodeParts[key].length), name: responseCodeParts[key].name};
        cursor += responseCodeParts[key].length;
    }

    var parsed = {};

    parsed.mac = infoData.mac.value;
    parsed.relay = infoData.relayStatus.value == "01";      
    parsed.hertz = infoData.hertz.value == "85" ? 50 : 60;

    infoData.parsed = parsed;

    return infoData;
}

// the actual class 
function plugwise(options)
{

    var commandStack = [];
    var commandQueue = [];
    var responsesCounter = 0;

    // connect to the serial port of the 'stick'
    var sp = new SerialPort(options.serialport, { 
        baudrate: 115200,
        parser: serialport.parsers.readline('\n') 
    });

    // read incoming data
    sp.on("data", readData);

    var ackumulation = [];
    var commandCallbackReference = {};
    var ackCounter = 0;

    function readData(data) {

        var result = data;

        // strip strange character in the begining of the string
        while(data.charCodeAt(0) < 48 || data.charCodeAt(0) > 89) {
            data = data.substring(1);
        }

        // parse the data and split into meaningful pairs, if we mapped them
        var responseCode = data.substr(0, 4);
        var commandInfo = commandResponses[responseCode];

        if (commandInfo && commandInfo.infoSplit) {

            var splitedData = [];
            var index  = 0;
            for(var i = 0, ii = commandInfo.infoSplit.length; i < ii; i++) {
                splitedData.push(data.substr(index, commandInfo.infoSplit[i]));
                index += commandInfo.infoSplit[i];
            }

            if (options.log) {
                console.log(commandInfo.color + "READ ", commandInfo.name + ':\t' + splitedData.join('\t') + colors.reset);
            }

            var isAck = false;


            // here we check for the imidate reponse and the response count
            if (splitedData[0] == protocolCommands.ack.response) {

                isAck = true;


                ackCounter += 1;
                if (ackCounter > 0) ackCounter = 0;

                if (splitedData[2] == '00C1') {
                    ackumulation.push(splitedData[1]);
                    var ref = commandStack[ackumulation.length - 1];
                    ref.ack = splitedData[1];
                    commandCallbackReference[ref.ack] = ref;
                    //console.log(colors.white , "0",  data, colors.reset);
                }

                // this happens when the response is a result of a command that doesnt expect 
                // data in return
                else {
                    var ack = splitedData[1];

                    var responseInfo = commandCallbackReference[ack];
                    if (responseInfo) {
                        var mac = responseInfo.mac;
                        //console.log("ack:", responseInfo);
                        if (responseInfo.callback) {
                            var parsedData = {};
                            if (responseInfo.command.parseInfo) {
                                parsedData = parseResponse(responseInfo.command.parseInfo, data);
                            }
                            responseInfo.callback.call(plugwiseObject(mac), parsedData.parsed);
                            //commandCallbackReference[ack].callback(parsedData.parsed);
                        }
                    }
                    else {
                    console.log(colors.white ,"1",  data, colors.reset);
                        //console.log("No callback for ack:", ack,  data);
                    }
                }
                //console.log(commandStack);
            }
            else {

                var ack = splitedData[1];
                var mac = splitedData[2];
                var responseInfo = commandCallbackReference[ack];
                if (responseInfo && responseInfo.callback) {
                    var parsedData = {};
                    if (responseInfo.command.parseInfo) {
                        parsedData = parseResponse(responseInfo.command.parseInfo, data);
                    }
                    responseInfo.callback.call(plugwiseObject(mac), parsedData.parsed);
                }
                else {
                    console.log(colors.white ,"2",  data, colors.reset);
                }

            }

        }
        else {
            console.log(colors.white ,"2",  data, colors.reset);
        }


        if (responsesCounter == 1) {
            sendQueue();
        }
        else {
            responsesCounter++;
        }


    }

    // builds the command string and sends it
    function sendCommand(command, mac, params, callback, scope) {

        var commandParts = [];
        // check for callback instead of params
        if (typeof params == 'function') {
            callback = params;
            params = '';
            scope = callback;
        }

        var completeCommand = '';

        completeCommand += command.request;
        commandParts.push(command.request);
        if (mac) {
            commandParts.push(mac);
            completeCommand += mac;
        }

        if (params) {
            commandParts.push(params);
            completeCommand += params;
        }

        commandParts.push(crc.crc16(completeCommand).toString(16).toUpperCase());
        completeCommand = protocolCommands.frames.start + commandParts.join("") + protocolCommands.frames.end;

        commandStack.push({mac: mac,command: command, ack:'', callback: callback, scope: scope});

        if (options.log) {
            console.log(colors.teal + "SEND " , command.name + ":\t" +  commandParts.join("\t") + colors.reset); 
        }

        sp.write(completeCommand);

        // we use a counter to know how many ack we are up in compared to commands
        ackCounter -= 1;

        return completeCommand;
    }

    function addCallback(command, callback) {
        commandStack[command.response] = callback;
    }

    // init
    function init(){
        sendCommand(protocolCommands.init);
    }

    function sendQueue() {
        //console.log("ackCounter = ", ackCounter);
        if (responsesCounter == 1 && ackCounter >= 0) {
            var command = commandQueue.shift();
            if (command && command.f) {
                command.f.call(command.scope);
            }
        }
    }

    var listOfAppliances = {};

    // the actual object 
    var plugwiseObject = function(mac) {


        if (listOfAppliances[mac]) {
            return listOfAppliances[mac];
        }


        var internal = new (function(mac){ 
            var self = this;

            self.mac = mac;
            //console.log("MAC:", mac);

            // All commands return this to be able to chain.
            // All callbacks are scoped with 'this' as the plugwise instance
            self.poweron = function(callback) {
                (function(mac, callback, pw){
                    commandQueue.push({f:function() {
                        sendCommand(protocolCommands.switch, mac, '01', callback, pw); 
                    }, scope: pw});
                })(mac, callback, self);
                sendQueue();
                return self;
            }

            self.poweroff = function(callback) {
                (function(mac, callback, pw){
                    commandQueue.push({f: function() {
                        sendCommand(protocolCommands.switch, mac, '00', callback, pw); 
                    }, scope: pw});
                })(mac, callback, self);
                sendQueue();
                return self;
            }

            self.info = function(callback) {
                (function(mac, callback, pw){
                    commandQueue.push({f: function() {
                        sendCommand(protocolCommands.info, mac, callback, pw); 
                    }, scope: pw});
                })(mac, callback, self);
                sendQueue();
                return self;
            }
            this.init = init;

        })(mac);


        listOfAppliances[mac] = internal;

        // return to be able to chain
        return internal;

    };

    return plugwiseObject;

}

var hasBeenInitiated = false;
exports.init = function(options, callback) {

    var instance = plugwise(options);
    instance().init();
    if (typeof callback == 'function') {
        callback.call(instance);
    }
    return instance;

}



