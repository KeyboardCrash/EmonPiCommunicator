"use strict";
exports.__esModule = true;
var serialport_1 = require("serialport");
main();
/**
 * Receives payload and validates it is a valid message for parsing
 * @param msg
 * @returns string containing payload from emon pi
 */
function checkValidMessage(msg) {
    console.log("raw msg", msg);
    // May have other data, try to parse the payload out
    // Check if payload is complete in buffer
    if (msg.includes('OK') && msg.includes('(-0)')) {
        var start = msg.indexOf('OK');
        var end = msg.indexOf('(-0)');
        // extract payload from serial-payload mixed data
        var payload = msg.substring(start, end + 4);
        return payload;
    }
    // otherwise msg has no payload
    return null;
}
/*
Structure of Emon Pi Messages

Datacodes
    b: byte, 1 byte
    h: short integer, 2 bytes
    i: integer, 4 bytes
    l: long, 4 bytes
    q: long long, 8 bytes
    f: float, 4 bytes
    d: double, 8 bytes
    B: unsigned byte, 1 byte
    H: unsigned short integer, 2 bytes
    I: unsigned integer, 4 bytes
    L: unsigned long, 4 bytes
    Q: unsigned long long, 8 bytes
    c: char, 1 byte

Configuration and order in nodeRED
Information must be parsed in the same order with correct units (or converted)

[[5]]
nodename = emonpi
[[[rx]]]
    names = power1,power2,power1pluspower2,vrms,t1,t2,t3,t4,t5,t6,pulsecount
    datacodes = h, h, h, h, h, h, h, h, h, h, L
    scales = 1,1,1,0.01,0.1,0.1,0.1,0.1,0.1,0.1,1
    units = W,W,W,V,C,C,C,C,C,C,p

*/
/**
 * Decodes the payload string into power data and saves values
 * into the data object
 * @param data payload string decoded from verifyValidMessage(
 */
function jeelabPacketDecode(data) {
    var words = data.split(' ');
    // check if packet is good
    if (words.shift() === 'OK') {
        // Convert int strings into ints
        var ints = words.map(function (x) { return parseInt(x, 10); });
        // Remove the RSSI of msg (NaN in array)
        ints.pop();
        // Useful for multiple shield units on same pi
        var nodeId = ints[0];
        // get bytes from the payload, values stored as 2 bytes in little endian
        var power1Bytes = ints.slice(1, 3);
        var power2Bytes = ints.slice(3, 5);
        var p1p2Bytes = ints.slice(5, 7);
        var vrmsBytes = ints.slice(7, 9);
        // Read bytes as a value
        var p1Value = (Buffer.from(power1Bytes)).readUInt16LE(0);
        var p2Value = (Buffer.from(power2Bytes)).readUInt16LE(0);
        var p1p2Value = (Buffer.from(p1p2Bytes)).readUInt16LE(0);
        var vrmsValue = (Buffer.from(vrmsBytes)).readUInt16LE(0) * 0.01; // voltage is scaled
        // Set driver data to these values
        this.data.rmsWattsCT1 = (p1Value * 750).toString();
        this.data.rmsWattsCT2 = (p2Value * 750).toString();
        this.data.rmsWattsTot = (p1p2Value * 750).toString();
        this.data.rmsVolts = vrmsValue.toString();
        console.log("Emon reported power usage\n        rmsWattsCT1 ".concat(this.data.rmsWattsCT1, "\n        rmsWattsCT2 ").concat(this.data.rmsWattsCT2, "\n        rmsWattsTot ").concat(this.data.rmsWattsTot, "\n        rmsVolts ").concat(this.data.rmsVolts));
        console.log("Emon is now reporting the following:\n        current / currents ".concat(this.getCurrent(), " / ").concat(this.getCurrents(), "\n        voltage / voltages ").concat(this.getVoltage(), " / ").concat(this.getVoltages(), "\n        power / powers ").concat(this.getPower(), " / ").concat(this.getPowers()));
    }
}
function main() {
    // SETUP DEVICE
    var portName = '/dev/ttyS0';
    var port = new serialport_1.SerialPort({
        path: portName,
        baudRate: 38400,
        dataBits: 8,
        stopBits: 1,
        parity: 'even'
    });
    // SETUP PARSER
    var parser = new serialport_1.ReadlineParser({ delimiter: '\r\n' });
    var buffer = '';
    port.pipe(parser);
    port.on("error", function (err) {
        console.log("Error opening port ".concat(portName, ": ").concat(err));
        return -1;
    });
    port.on("open", function () {
        console.log("Started reading on " + portName);
    });
    parser.on('open', function (data) {
        console.log("Parser available on " + portName);
        /*
    Startup Command

        "Available commands:\n"
        "  <nn> i     - set node IDs (standard node ids are 1..30)\n"
        "  <n> b      - set MHz band (4 = 433, 8 = 868, 9 = 915)\n"
        "  <nnn> g    - set network group (RFM12 only allows 212, 0 = any)\n"
        "  <n> c      - set collect mode (advanced, normally 0)\n"
        "  ...,<nn> a - send data packet to node <nn>, request ack\n"
        "  ...,<nn> s - send data packet to node <nn>, no ack\n"
        "  ...,<n> p  - Set AC Adapter Vcal 1p = UK, 2p = USA\n"
        "  v          - Show firmware version\n"

    */
        // port.write('2p');
        port.write('v');
    });
    parser.on('data', function (data) {
        buffer += data.toString();
        //console.log('data ', data.toString());
        if (!(buffer.includes('\r\n'))) {
            return;
        }
        console.log("Completed data is ", buffer);
        var fulldata = buffer;
        buffer = '';
        var output = checkValidMessage(fulldata);
        console.log('decoded output ', output);
        if (output !== null) {
            jeelabPacketDecode(output);
        }
        else {
            console.log('packet is bad');
        }
        // Setup [NodeID, val1, val2] data obj
    });
    parser.on('close', function () {
        console.log("serial closed");
    });
    parser.on('error', function (err) {
        console.log("serial error");
        console.log(err);
    });
}
