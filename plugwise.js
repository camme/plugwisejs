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
var colors = require('./colors').colors;
var protocolCommands = require('./plugwise-commands').protocolCommands;

var commandResponses = {};
for(var key in protocolCommands) {
    var protocolCommandInfo = protocolCommands[key];
    commandResponses[protocolCommandInfo.response] = {
        infoSplit: protocolCommandInfo.infoSplit,
        name: protocolCommandInfo.name,
        color: protocolCommandInfo.color
    };
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
function plugwise(options) {

    var commandStack = [];
    var commandQueue = [];
    var responsesCounter = 0;
    var opened = false;
    var initiated = false;

    // connect to the serial port of the 'stick'
    var sp = new SerialPort(options.serialport, { 
        baudrate: 115200,
        parser: serialport.parsers.readline('\n') 
    });

    sp.on('open', function() {
        opened = true;
        init();
    });

    // read incoming data
    sp.on("data", readData);

    var ackumulation = [];
    var commandCallbackReference = {};
    var ackCounter = 0;

    function readData(data) {

        var result = data;

        if (options.log > 2) {
            console.log("RAW DATA:", data);
        }

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

            if (splitedData[0] === protocolCommands.ack.response && options.log > 1) {
                console.log(commandInfo.color + "READ ", commandInfo.name + ':\t' + splitedData.join('\t') + colors.reset);
            }
            else if (splitedData[0] !== protocolCommands.ack.response && options.log > 0) {
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
                else if (splitedData[2] == '00C2') {
                    var last;
                    for(var ack in commandCallbackReference) {
                       last = commandCallbackReference[ack]; 
                    }
                    if (last && last.command.request !== '000A') {
                        var mac = last.mac;
                        if (last.callback) {
                            last.callback.call(plugwiseObject(mac), {error: true});
                        }
                    }
                }
                else if (splitedData[2] =='00E1') {

                    // what is this?
                    if (options.log > 0) {
                        console.log(colors.red + "Error?" + colors.reset);
                    }

                    var ack = splitedData[1];
                    var responseInfo = commandCallbackReference[ack];
                    if (responseInfo) {
                        delete commandCallbackReference[ack];
                        var mac = responseInfo.mac;
                        //console.log("ack:", responseInfo);
                        if (responseInfo.callback) {
                            var parsedData = {};
                            var result = {error: true};
                            var pw = plugwiseObject(mac);
                            responseInfo.callback.call(pw, result);
                        }
                    }
                    if (responsesCounter == 1) {
                        sendQueue();
                    }
                }

                // this happens when the response is a result of a command that doesnt expect 
                // data in return
                else {
                    var ack = splitedData[1];
                    var responseInfo = commandCallbackReference[ack];
                    if (responseInfo) {
                        delete commandCallbackReference[ack];
                        var mac = responseInfo.mac;
                        //console.log("ack:", responseInfo);
                        if (responseInfo.callback) {
                            var parsedData = {};
                            var result = null;
                            var pw = plugwiseObject(mac);
                            //if (responseInfo.command.parseInfo) {
                                //parsedData = parseResponse(responseInfo.command.parseInfo, data);
                                //result = parsedData.parsed;
                            //}
                            //console.log("data:", data);
                            if (responseInfo.command.parseFunction) {
                                result = responseInfo.command.parseFunction(pw, splitedData);
                            }
                            responseInfo.callback.call(pw, result);
                            //commandCallbackReference[ack].callback(parsedData.parsed);
                        }
                    }
                    else {
                        //console.log(colors.white ,"1",  data, colors.reset);
                        //console.log("No callback for ack:", ack,  data);
                    }
                    if (responsesCounter == 1) {
                        sendQueue();
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
                    var result = null;
                    var pw = plugwiseObject(mac);
                    //if (responseInfo.command.parseInfo) {
                        //parsedData = parseResponse(responseInfo.command.parseInfo, data);
                        //result = parsedData.parsed;
                    //}
                    if (responseInfo.command.parseFunction) {
                        result = responseInfo.command.parseFunction(pw, splitedData);
                    }
                        responseInfo.callback.call(pw, result);
                }
                else {
                    //console.log(colors.white ,"2",  data, colors.reset);
                }

                if (responsesCounter == 1) {
                    sendQueue();
                }

            }

        }
        else {
            //console.log(colors.white ,"3",  data, colors.reset);
        }


        if (responsesCounter == 1) {
            //sendQueue();
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

        var crcChecksum = crc.crc16(completeCommand).toString(16).toUpperCase();

        if (crcChecksum.length < 2) {
            crcChecksum = "000" + crcChecksum;
        }
        else if (crcChecksum.length < 3) {
            crcChecksum = "00" + crcChecksum;
        }
        else if (crcChecksum.length < 4) {
            crcChecksum = "0" + crcChecksum;
        }

        commandParts.push(crcChecksum);
        completeCommand = protocolCommands.frames.start + commandParts.join("") + protocolCommands.frames.end;

        commandStack.push({mac: mac,command: command, ack:'', callback: callback, scope: scope});

        if (options.log > 0) {
            console.log('---');
            console.log(command.color + "SEND " , command.name + ":\t" +  commandParts.join("\t") + colors.reset); 
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
        if (opened && !initiated) {
            initiated = true;
            sendCommand(protocolCommands.init);
        }
    }

    function sendQueue() {
        //console.log("ackCounter = ", ackCounter);
        if (opened && responsesCounter == 1 && ackCounter >= 0) {
            var command = commandQueue.shift();
            if (command && command.f) {
                //(function(command) {
                    //setTimeout(function() {
                        command.f.call(command.scope);
                    //}, 500);
                //})(command);
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

            // reserved for internal data
            self.data = {};
            self.data.relay = null; // holds the status of the relay

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

            self.powerinfo = function(callback) {

                // if we want to read the power from an appliance, we have to know if its on or off
                if (self.data.relay) {
                    (function(mac, callback, pw){
                        // if we havent asked for calibarion data, lets do it now
                        if (!pw.data.calibration) {
                            pw.calibration(function(){})
                        };
                        commandQueue.push({f: function() {
                            sendCommand(protocolCommands.powerinfo, mac, callback, pw); 
                        }, scope: pw});
                    })(mac, callback, self);
                    sendQueue();
                }
                else {
                    // check if we dont know if the relay is on or off
                    if (self.data.relay !== false) {
                        //console.log("check relay");
                        self.info(function(result) {
                            //console.log("relay info recieved", result);
                            self.powerinfo(callback);
                        });
                    }
                    else {
                        callback.call(self, {error: true, message: 'relay off'});
                    }
                }
                return self;
            }

            self.calibration = function(callback) {
                (function(mac, callback, pw){
                    commandQueue.push({f: function() {
                        sendCommand(protocolCommands.calibration, mac, callback, pw); 
                    }, scope: pw});
                })(mac, callback, self);
                sendQueue();
                return self;
            }

            this.init = init;

            //this.calibration(function(){});


        })(mac);


        listOfAppliances[mac] = internal;
        //console.log(mac);
        //internal.calibration(function(){});

        // return to be able to chain
        return internal;

    };

    return plugwiseObject;

}

var hasBeenInitiated = false;
var listOfDevices = {};

exports.init = function(options, callback) {
    if (listOfDevices[options.serialport]) {
        return listOfDevices[options.serialport];
    }
    else {
        var instance = plugwise(options);
        instance().init();
        if (typeof callback == 'function') {
            callback.call(instance);
        }
        listOfDevices[options.serialport] = instance;
        return instance;
    }
}



