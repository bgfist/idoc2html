const fs = require('fs');
const path = require('path');
const pageJson = require('./demo2.json');
const { transform, debug, BuildStage } = require('../dist/index');

debug.showId = true;
debug.showSizeSpec = true;
debug.buildToStage = BuildStage.Tree;
debug.buildAllNodes = false;
const page = transform(pageJson, {
    codeGenOptions: {
        experimentalZIndex: true,
    }
});
fs.writeFileSync(path.join(__filename, '../../dist/demo.html'), page);