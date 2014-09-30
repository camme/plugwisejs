plugwisejs
==========

Plugwise API for nodejs

The basic idea for this API is simply to make controllign your
appliances as intuitive as possible. There will be much more info coming
soon, but for now this is basically how you use it:


    // use this module
    var plugwiseApi = require('plugwisejs');
    
    // enter and connect to your plugwise stick by entering its location
    // on your system (this example is for the mac, on unix it
    // would  be something more like /dev/ttyUSB0).
    var plugwise = plugwiseApi.init({log: 1, serialport: '/dev/tty.usbserial-A8005W6k'});

    // create an instance of your appliance by entering its MAC address
    var lamp = plugwise('000Dxxxxxxxxxxx');

    // turn it off
    lamp.poweroff();


## commands

The following are the current commands that work. 

Begin with:

    var plugwiseApi = require('plugwisejs');
    var plugwise = plugwiseApi.init({log: 1, serialport: '/dev/tty.usbserial-A8005W6k'});
    var circle = plugwise('000Dxxxxxxxxxxx');


Turn a circle off

    circle.poweroff(callback)


Turn a circle on

    circle.poweron(callback)


Get basic info from a circle, such as if it is on and what time the
internal clock is set to

    circle.info(callback({relay: [boolean], clock: [date]});


Set the circles clock

    circle.setclock(date, callback);


Get current power consumtion

    circle.powerinfo(callback({watt: [number], kWh: [number], pulses: [number] }));


Read the power buffer

    // Returns todays power consumtion as an array of dates and {watt: [number], kWh: [number], pulses: [number] }
    circle.powerbufferinfo(callback([array]);

    // Returns the amount of hours back in time of  power consumtion as an array of dates and {watt: [number], kWh: [number], pulses: [number] }
    circle.powerbufferinfo([number], callback([array]);

    // Returns the dates power consumtion as an array of dates and {watt: [number], kWh: [number], pulses: [number] }
    circle.powerbufferinfo([date], callback([array]);

    // Returns the dates interval power consumtion as an array of dates and {watt: [number], kWh: [number], pulses: [number] }
    circle.powerbufferinfo([[date], [date]], callback([array]);






