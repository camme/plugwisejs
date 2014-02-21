plugwisejs
==========

Plugwise API for nodejs

===
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

