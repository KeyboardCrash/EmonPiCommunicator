import { SerialPort, ReadlineParser } from 'serialport';

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
        const start = msg.indexOf('OK');
        const end = msg.indexOf('(-0)');
        // extract payload from serial-payload mixed data
        const payload = msg.substring(start, end + 4);
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
    const words: string[] = data.split(' ');
    // check if packet is good
    if (words.shift() === 'OK') {
        // Convert int strings into ints
        const ints: number[] = words.map((x) => parseInt(x, 10));
        // Remove the RSSI of msg (NaN in array)
        ints.pop();

        // Useful for multiple shield units on same pi
        const nodeId = ints[0];

        // get bytes from the payload, values stored as 2 bytes in little endian
        const power1Bytes = ints.slice(1, 3);
        const power2Bytes = ints.slice(3, 5);
        const p1p2Bytes = ints.slice(5, 7);
        const vrmsBytes = ints.slice(7, 9);

        // Read bytes as a value
        const p1Value: number = (Buffer.from(power1Bytes)).readUInt16LE(0);
        const p2Value: number = (Buffer.from(power2Bytes)).readUInt16LE(0);
        const p1p2Value: number = (Buffer.from(p1p2Bytes)).readUInt16LE(0);
        const vrmsValue: number = (Buffer.from(vrmsBytes)).readUInt16LE(0) * 0.01; // voltage is scaled

        // Set driver data to these values
        this.data.rmsWattsCT1 = (p1Value*750).toString();
        this.data.rmsWattsCT2 = (p2Value*750).toString();
        this.data.rmsWattsTot = (p1p2Value*750).toString();
        this.data.rmsVolts = vrmsValue.toString();

        console.log(`Emon reported power usage
        rmsWattsCT1 ${this.data.rmsWattsCT1}
        rmsWattsCT2 ${this.data.rmsWattsCT2}
        rmsWattsTot ${this.data.rmsWattsTot}
        rmsVolts ${this.data.rmsVolts}`);

        console.log(`Emon is now reporting the following:
        current / currents ${this.getCurrent()} / ${this.getCurrents()}
        voltage / voltages ${this.getVoltage()} / ${this.getVoltages()}
        power / powers ${this.getPower()} / ${this.getPowers()}`);
    }
}

function main() {
    // SETUP DEVICE
    let portName = '/dev/ttyS0';
    let port = new SerialPort({
            path: portName,
            baudRate: 38400 ,
            dataBits: 8,
            stopBits: 1,
            parity: 'even',
        });

    // SETUP PARSER
    let parser = new ReadlineParser({delimiter: '\r\n'});
    let buffer = '';

    port.pipe(parser);
    port.on("error", (err) => {
        console.log(`Error opening port ${portName}: ${err}`);
        return -1;
    })

    parser.on('open', function(data) {
        console.log("Reading serial port " + portName);
    
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
    
    parser.on('data', function(data) {
    
        buffer += data.toString();
        //console.log('data ', data.toString());
        if (!(buffer.includes('\r\n'))) {
            return;
        }
    
        console.log("Completed data is ", buffer)
        let fulldata = buffer;
        buffer = '';
    
        let output = checkValidMessage(fulldata);
        console.log('Decoded output ', output);
    
        if (output !== null) {
            jeelabPacketDecode(output);
        } else {
            console.log('Packet is bad')
        }
    
        // Setup [NodeID, val1, val2] data obj
        
    
    });
    parser.on('close', function() {
        console.log("serial closed");
    });
    parser.on('error', function(err) {
        console.log("serial error");
        console.log(err);
    });
    
}