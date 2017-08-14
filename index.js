var os = require('os');
var os_utils 	= require('os-utils');
var csv_parse = require('csv-parse');
var parser = csv_parse({delimiter: ','});
var system_host = os.hostname();

var system_platform = process.platform;
var isWin = /^win/.test(system_platform);
const exec = require('child_process').exec;

const params = [
    'name',
    'pcie.link.width.current',
    'pcie.link.gen.current',
    'display_mode',
    'display_active',
    'driver_version',
    'uuid',
    'fan.speed',
    'pstate',
    'memory.total',
    'memory.used',
    'memory.free',
    'utilization.gpu',
    'temperature.gpu',
    'clocks.video',
    'power.draw',
    'clocks.gr',
    'clocks.sm',
    'clocks.mem'
];
const params_string = params.join(',');
const nvidia_smi = (isWin ? 'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe' :'nvidia-smi');
const nvidia_smi_params = [
    '--loop=5',
    '--format=csv,noheader,nounits',
    `--query-gpu=${params_string}`
];

function SystemUsage(){
    console.log(os.platform());
    console.log(os.cpuCount());
    console.log(os.freemem());
    console.log(os.totalmem());
    console.log(os.sysUptime());
    console.log(os.loadavg(1));
    console.log(os.loadavg(5));
    console.log(os.loadavg(15));
    console.log(os2.hostname());
    os.cpuUsage(function(v){
        console.log( 'CPU Usage (%): ' + v );
    });
}


const Influx = require('influx');
const influx = new Influx.InfluxDB({
    host: '172.16.0.1',
    database: 'miners_monitor',
    schema: [
        {
            measurement: 'gpu',
            fields: {
                fanSpeed: Influx.FieldType.INTEGER,
                utilization: Influx.FieldType.INTEGER,
                temperature: Influx.FieldType.INTEGER,
                powerDraw: Influx.FieldType.INTEGER,
                memoryTotal: Influx.FieldType.INTEGER,
                memoryUsed: Influx.FieldType.INTEGER,
                memoryFree: Influx.FieldType.INTEGER,
                clocksGr: Influx.FieldType.INTEGER,
                clocksSm: Influx.FieldType.INTEGER,
                clocksMem: Influx.FieldType.INTEGER,
                clocksVideo: Influx.FieldType.INTEGER
            },
            tags: [
                'host',
                'name',
                'uuid',
                'displayMode',
                'displayActive',
                'driverVersion',
                'pstate',
                'pcieLinkGenCurrent',
                'pcieLinkWidthCurrent'
            ]
        },
        {
            measurement: 'cpu',
            fields: {
                load1: Influx.FieldType.FLOAT,
                load5: Influx.FieldType.FLOAT,
                load15: Influx.FieldType.FLOAT,
                upTime:  Influx.FieldType.FLOAT,
            },
            tags: [
                'host'
            ]
        }

    ]
});

influx.getDatabaseNames()
    .then(names => {
    if( !names.includes('miners_monitor')){
    return influx.createDatabase('miners_monitor')
}});

var spawn = require('child_process').spawn;
var child = spawn(nvidia_smi, nvidia_smi_params);

child.stdout.on('data', function(data) {
    parser.write(data);
});
child.stderr.on('data', function(data) {
    console.log('stderr: ' + data);
});
child.on('close', function(code) {
    console.log('closing code: ' + code);
    parser.end();
});
child.on('error', function(code) {
    console.log('error: ' + code);
});


parser.on('readable', function(){
    var record;
    while ( record = parser.read()) {
        var data =  parseData(record);
        writeGpuStatsInflux(data);
    }
});
// Catch any error
parser.on('error', function(err){
    console.log(err.message);
});
// When we are done, test that the parsed output matched what expected
parser.on('finish', function(){
    console.log(output);
});

function parseData(record){
    var data = {};
    for (var key in params) {
        data[ params[key] ] = record[key].trim();
    }
    return data;
}

function writeGpuStatsInflux(data){
    influx.writePoints([
        {
            measurement: 'gpu',
            fields: {
                fanSpeed: parseInt(data['fan.speed']),
                utilization: parseInt(data['utilization.gpu']),
                temperature: parseInt(data['temperature.gpu']),
                powerDraw: parseFloat(data['power.draw']),
                memoryTotal: parseInt(data['memory.total']),
                memoryUsed: parseInt(data['memory.used']),
                memoryFree: parseInt(data['memory.free']),
                clocksGr: parseInt(data['clocks.gr']),
                clocksSm: parseInt(data['clocks.sm']),
                clocksMem: parseInt(data['clocks.mem']),
                clocksVideo: parseInt(data['clocks.video'])
            },
            tags: {
                host: system_host,
                name: data['name'],
                uuid: data['uuid'],
                displayMode: data['display_mode'],
                displayActive: data['display_active'],
                driverVersion: data['driver_version'],
                pstate: data['pstate'],
                pcieLinkGenCurrent: data['pcie.link.gen.current'],
                pcieLinkWidthCurrent: data['pcie.link.width.current']
            }
        }
    ]).catch(err => {
        console.log('Error saving data to InfluxDB! ${err.stack}')
    });
}

