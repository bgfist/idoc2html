const fs = require('fs');
const path = require('path');
const pageJson = require('./demo6.json');
const { iDocJson2Html, debug, BuildStage } = require('../dist/index');

debug.showId = true;
debug.showSizeSpec = true;
debug.buildToStage = BuildStage.Measure;
debug.buildAllNodes = false;
const page = iDocJson2Html(pageJson, {
    codeGenOptions: {
        experimentalZIndex: true,
    }
});
fs.writeFileSync(path.join(__filename, '../../dist/demo.html'), page);