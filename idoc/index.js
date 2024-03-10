const fs = require('fs');
const path = require('path');
const pageJson = require('./demo2.json');
const { transform, debug } = require('../dist/index');

debug.sizeSpec = true;
debug.buildPreOnly = false;
debug.buildAllNodes = false;
const page = transform(pageJson, {
    codeGenOptions: {
        experimentalZIndex: true,
    }
});
fs.writeFileSync(path.join(__filename, '../../dist/demo.html'), page);